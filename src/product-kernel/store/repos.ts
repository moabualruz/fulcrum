import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

export interface RepoRow {
  id: string;
  org_id: string;
  project_id: string | null;
  slug: string;
  root_path: string;
  default_branch: string | null;
  remote_url: string | null;
  sync_status: "idle" | "syncing" | "error";
  sync_error: string | null;
  last_sync_at: string | null;
  mirror_path: string | null;
  mirror_size_bytes: number;
  registered_at: string;
  last_seen_at: string;
}

export interface RegisterRepoInput {
  orgId: string;
  projectId?: string | null;
  slug: string;
  rootPath: string;
  defaultBranch?: string | null;
  remoteUrl?: string | null;
  mirrorPath?: string | null;
}

export async function registerRepo(
  db: ProductDb,
  input: RegisterRepoInput,
): Promise<RepoRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO repos (id, org_id, project_id, slug, root_path, default_branch, remote_url, mirror_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.slug,
      input.rootPath,
      input.defaultBranch ?? null,
      input.remoteUrl ?? null,
      input.mirrorPath ?? null,
    ],
  );
  const rows = await db.query<RepoRow>(`SELECT * FROM repos WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`repo insert lost: ${id}`);
  return rows[0] as RepoRow;
}

export async function listRepos(
  db: ProductDb,
  orgId: string,
): Promise<RepoRow[]> {
  return db.query<RepoRow>(
    `SELECT * FROM repos WHERE org_id = $1 ORDER BY registered_at ASC, id ASC`,
    [orgId],
  );
}

export async function getRepo(
  db: ProductDb,
  id: string,
): Promise<RepoRow | null> {
  const rows = await db.query<RepoRow>(`SELECT * FROM repos WHERE id = $1`, [id]);
  return (rows[0] as RepoRow) ?? null;
}

export async function updateSyncStatus(
  db: ProductDb,
  id: string,
  status: "idle" | "syncing" | "error",
  error?: string | null,
): Promise<void> {
  await db.query(
    `UPDATE repos SET sync_status = $1, sync_error = $2, last_sync_at = now(), last_seen_at = now() WHERE id = $3`,
    [status, error ?? null, id],
  );
}

export async function updateMirrorSize(
  db: ProductDb,
  id: string,
  mirrorSizeBytes: number,
): Promise<void> {
  await db.query(
    `UPDATE repos SET mirror_size_bytes = $1 WHERE id = $2`,
    [mirrorSizeBytes, id],
  );
}

/** Aggregate stats used by `fulcrum doctor --json` repos section. */
export interface ReposDoctorStats {
  totalRepos: number;
  syncErrors: number;
  mirrorDiskBytes: number;
}

export async function getReposDoctorStats(db: ProductDb): Promise<ReposDoctorStats> {
  const rows = await db.query<{
    total_repos: number;
    sync_errors: number;
    mirror_disk_bytes: number;
  }>(
    `SELECT
       COUNT(*)::int AS total_repos,
       COUNT(*) FILTER (WHERE sync_status = 'error')::int AS sync_errors,
       COALESCE(SUM(mirror_size_bytes), 0)::bigint AS mirror_disk_bytes
     FROM repos`,
  );
  const r = rows[0]!;
  return {
    totalRepos: r.total_repos,
    syncErrors: r.sync_errors,
    mirrorDiskBytes: Number(r.mirror_disk_bytes),
  };
}
