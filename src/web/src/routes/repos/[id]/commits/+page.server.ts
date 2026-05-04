import { error } from "@sveltejs/kit";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";

const execFileAsync = promisify(execFile);

const PAGE_SIZE = 50;

export interface CommitEntry {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

async function getCommits(
  rootPath: string,
  branch: string | null,
  skip: number,
  limit: number,
): Promise<CommitEntry[]> {
  try {
    const ref = branch ?? "HEAD";
    const { stdout } = await execFileAsync("git", [
      "-C", rootPath,
      "log", ref,
      `--max-count=${limit}`,
      `--skip=${skip}`,
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

async function getTotalCommits(rootPath: string, branch: string | null): Promise<number> {
  try {
    const ref = branch ?? "HEAD";
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "rev-list", "--count", ref]);
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ params, url, locals }) => {
  const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const skip = (page - 1) * PAGE_SIZE;

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    page,
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
            last_seen_at: string | Date;
          }>(
            `SELECT id, slug, root_path, default_branch, last_seen_at
               FROM repos WHERE id = $1 AND org_id = $2`,
            [params.id, orgId],
          );
          if (rows.length === 0) throw error(404, "Repo not found");
          const raw = rows[0]!;
          const repo = { ...raw, last_seen_at: isoStamp(raw.last_seen_at) };

          const [commits, total] = await Promise.all([
            getCommits(repo.root_path, repo.default_branch, skip, PAGE_SIZE),
            getTotalCommits(repo.root_path, repo.default_branch),
          ]);

          const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

          return { repo, commits, page, totalPages, total };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
