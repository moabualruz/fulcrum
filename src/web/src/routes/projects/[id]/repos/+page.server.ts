import { basename, resolve } from "node:path";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "@fulcrum/lib/server/db";
import {
  listReposForProject,
  linkRepoToProject,
  type RepoRow,
} from "@fulcrum/product-kernel/store/repositories.ts";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";
import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";

export interface ProjectRepoCard {
  id: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  currentBranch: string | null;
  syncStatus: "idle" | "syncing" | "error";
  remoteUrl: string | null;
  localPath: string | null;
  openTaskCount: number;
  lastCommits: Array<{ subject: string; relativeTime: string }>;
}

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
}

interface TaskCountRow {
  repo_id: string | null;
  cnt: number | string;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toCard(row: RepoRow, _openTasks: number): ProjectRepoCard {
  return {
    id: row.id,
    name: row.name || row.slug,
    slug: row.slug,
    kind: row.kind === "remote" ? "remote" : "local",
    currentBranch: row.current_branch,
    syncStatus:
      row.sync_status === "syncing" || row.sync_status === "error"
        ? row.sync_status
        : "idle",
    remoteUrl: row.remote_url,
    localPath: row.local_path,
    openTaskCount: _openTasks,
    lastCommits: [], // populated later when git log integration lands
  };
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    // Verify project exists
    const projectRows = await db.query<ProjectRow>(
      `SELECT id, slug, name FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projectRows.length === 0) throw error(404, "Project not found");
    const project = projectRows[0]!;
    const repoRows = await listReposForProject(db, params.id, orgId);
    const repos: ProjectRepoCard[] = repoRows.map((r) => toCard(r, 0));
    return { project, repos };
  } finally {
    await db.close();
  }
};

function slugFromRemoteUrl(url: string): string {
  const segment =
    url
      .replace(/\/$/, "")
      .split(/[/:]/)
      .filter(Boolean)
      .at(-1) ?? "repo";
  return segment.replace(/\.git$/, "") || "repo";
}

async function insertRepo(
  db: ProductDb,
  form: FormData,
  projectId: string,
): Promise<void> {
  const orgId = await getDefaultOrgId(db);
  const kind = form.get("kind") === "remote" ? "remote" : "local";
  const path = String(form.get("path") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (kind === "local" && !path) throw new Error("path required");
  if (kind === "remote" && !url) throw new Error("url required");
  const resolvedPath = kind === "local" ? resolve(path) : null;
  const slug =
    kind === "local"
      ? basename(resolvedPath ?? "repo")
      : slugFromRemoteUrl(url);
  const displayName = name || (kind === "local" ? basename(resolvedPath ?? "repo") : slugFromRemoteUrl(url));
  await db.query(
    `INSERT INTO repos (id, org_id, project_id, slug, root_path, default_branch, remote_url, name, kind, local_path, current_branch, sync_status, last_touched_at)
     VALUES ($1, $2, $3, $4, $5, 'main', $6, $7, $8, $9, 'main', 'idle', now())`,
    [
      newUlid(),
      orgId,
      projectId,
      slug,
      resolvedPath ?? "",
      kind === "remote" ? url : null,
      displayName,
      kind,
      resolvedPath,
    ],
  );
}

export const actions: Actions = {
  add: async ({ params, request }) => {
    const form = await request.formData();
    const db = await openProductDb();
    try {
      await insertRepo(db, form, params.id);
      return { ok: true };
    } catch (e) {
      return fail(400, {
        ok: false,
        message: e instanceof Error ? e.message : "invalid repo",
      });
    } finally {
      await db.close();
    }
  },
  link: async ({ params, request }) => {
    const form = await request.formData();
    const repoId = String(form.get("repoId") ?? "").trim();
    if (!repoId) return fail(400, { ok: false, message: "repoId required" });
    const db = await openProductDb();
    try {
      await linkRepoToProject(db, repoId, params.id);
      return { ok: true };
    } finally {
      await db.close();
    }
  },
};
