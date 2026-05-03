import { error } from "@sveltejs/kit";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";

const execFileAsync = promisify(execFile);

export interface RepoBranch {
  name: string;
  isCurrent: boolean;
}

export interface RepoCommit {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface LinkedTask {
  id: string;
  title: string;
  status: string;
}

async function getBranches(rootPath: string): Promise<RepoBranch[]> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "branch", "--format=%(refname:short)|%(HEAD)"]);
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name = "", flag = ""] = line.split("|");
        return { name: name.trim(), isCurrent: flag.trim() === "*" };
      });
  } catch {
    return [];
  }
}

async function getRecentCommits(rootPath: string, branch: string | null, limit = 10): Promise<RepoCommit[]> {
  try {
    const ref = branch ?? "HEAD";
    const { stdout } = await execFileAsync("git", [
      "-C", rootPath,
      "log", ref,
      `--max-count=${limit}`,
      "--format=%H|%ae|%an|%aI|%s",
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha = "", email = "", author = "", date = "", ...rest] = line.split("|");
        return {
          sha: sha.trim(),
          shortSha: sha.trim().slice(0, 8),
          author: author.trim(),
          email: email.trim(),
          date: date.trim(),
          message: rest.join("|").trim(),
        };
      });
  } catch {
    return [];
  }
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const rows = await db.query<{
            id: string;
            slug: string;
            root_path: string;
            default_branch: string | null;
            remote_url: string | null;
            registered_at: string | Date;
            last_seen_at: string | Date;
            project_id: string | null;
          }>(
            `SELECT id, slug, root_path, default_branch, remote_url,
                    registered_at, last_seen_at, project_id
               FROM repos WHERE id = $1 AND org_id = $2`,
            [params.id, orgId],
          );
          if (rows.length === 0) throw error(404, "Repo not found");
          const raw = rows[0]!;
          const repo = {
            ...raw,
            registered_at: isoStamp(raw.registered_at),
            last_seen_at: isoStamp(raw.last_seen_at),
          };

          // Load linked tasks via edges (repo → task)
          const edgeRows = await db.query<{
            to_id: string;
            title: string;
            status: string;
          }>(
            `SELECT e.to_id, t.title, t.status
               FROM edges e
               JOIN tasks t ON t.id = e.to_id
              WHERE e.from_kind = 'repo' AND e.from_id = $1
                AND e.to_kind = 'task' AND e.org_id = $2
              LIMIT 50`,
            [repo.id, orgId],
          );
          const linkedTasks: LinkedTask[] = edgeRows.map((r) => ({
            id: r.to_id,
            title: r.title,
            status: r.status,
          }));

          const [branches, commits] = await Promise.all([
            getBranches(repo.root_path),
            getRecentCommits(repo.root_path, repo.default_branch, 10),
          ]);

          return { repo, branches, commits, linkedTasks };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
