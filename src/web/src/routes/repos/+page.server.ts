import type { Actions, PageServerLoad } from "./$types";
import { basename, resolve } from "node:path";
import { fail } from "@sveltejs/kit";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { newUlid } from "../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";

export interface RepoListItem {
  id: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  currentBranch: string | null;
  lastSyncAt: string | null;
  syncStatus: "idle" | "syncing" | "error";
}

interface RepoRow {
  id: string;
  name: string | null;
  slug: string;
  kind: string | null;
  local_path: string | null;
  remote_url: string | null;
  current_branch: string | null;
  last_sync_at: string | Date | null;
  sync_status: string | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function slugFromRemoteUrl(url: string): string {
  const segment = url.replace(/\/$/, "").split(/[/:]/).filter(Boolean).at(-1) ?? "repo";
  return segment.replace(/\.git$/, "") || "repo";
}

function repoName(input: { kind: string; path: string; url: string; name: string }): string {
  if (input.name) return input.name;
  return input.kind === "local" ? basename(resolve(input.path)) : slugFromRemoteUrl(input.url);
}

export const load: PageServerLoad = ({ locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openProductDb();
      try {
        const orgId = await getDefaultOrgId(db);
        const rows = await db.query<RepoRow>(
          `SELECT id, name, slug, kind, local_path, remote_url, current_branch, last_sync_at, sync_status
             FROM repos
            WHERE org_id = $1
              AND COALESCE(archived, false) = false
            ORDER BY COALESCE(last_touched_at, last_sync_at) DESC NULLS LAST, slug ASC`,
          [orgId],
        );
        const repos: RepoListItem[] = rows.map((row) => ({
          id: row.id,
          name: row.name || row.slug,
          slug: row.slug,
          kind: row.kind === "remote" ? "remote" : "local",
          localPath: row.local_path,
          remoteUrl: row.remote_url,
          currentBranch: row.current_branch,
          lastSyncAt: iso(row.last_sync_at),
          syncStatus: row.sync_status === "syncing" || row.sync_status === "error" ? row.sync_status : "idle",
        }));
        return { repos };
      } finally {
        await db.close();
      }
    })(),
  },
});

async function insertRepo(db: ProductDb, form: FormData): Promise<void> {
  const orgId = await getDefaultOrgId(db);
  const kind = form.get("kind") === "remote" ? "remote" : "local";
  const path = String(form.get("path") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "").trim() || null;
  if (kind === "local" && !path) throw new Error("path required");
  if (kind === "remote" && !url) throw new Error("url required");
  const resolvedPath = kind === "local" ? resolve(path) : null;
  const slug = kind === "local" ? basename(resolvedPath ?? "repo") : slugFromRemoteUrl(url);
  const displayName = repoName({ kind, path, url, name });
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
  add: async ({ request }) => {
    const form = await request.formData();
    const db = await openProductDb();
    try {
      await insertRepo(db, form);
      return { ok: true };
    } catch (error) {
      return fail(400, { ok: false, message: error instanceof Error ? error.message : "invalid repo" });
    } finally {
      await db.close();
    }
  },
};
