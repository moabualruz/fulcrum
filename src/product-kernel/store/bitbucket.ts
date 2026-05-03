import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// ── Row types ──

export interface BbPrRow {
  id: string;
  repo_id: string;
  org_id: string;
  number: number;
  title: string;
  state: string;
  author: string | null;
  head_sha: string | null;
  base_branch: string | null;
  head_branch: string | null;
  labels: string[];
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

export interface BbIssueRow {
  id: string;
  repo_id: string;
  org_id: string;
  number: number;
  title: string;
  state: string;
  author: string | null;
  labels: string[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

// ── Upsert inputs ──

export interface UpsertBbPrInput {
  repoId: string;
  orgId: string;
  number: number;
  title: string;
  state: string;
  author?: string | null;
  headSha?: string | null;
  baseBranch?: string | null;
  headBranch?: string | null;
  labels?: string[];
  createdAt?: string;
  updatedAt?: string;
  mergedAt?: string | null;
}

export interface UpsertBbIssueInput {
  repoId: string;
  orgId: string;
  number: number;
  title: string;
  state: string;
  author?: string | null;
  labels?: string[];
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
}

// ── Store functions ──

export async function upsertBbPr(db: ProductDb, input: UpsertBbPrInput): Promise<BbPrRow> {
  const id = newUlid();
  const rows = await db.query<BbPrRow>(
    `INSERT INTO bb_prs (id, repo_id, org_id, number, title, state, author, head_sha, base_branch, head_branch, labels, created_at, updated_at, merged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
     ON CONFLICT (repo_id, number) DO UPDATE SET
       title = EXCLUDED.title,
       state = EXCLUDED.state,
       author = EXCLUDED.author,
       head_sha = EXCLUDED.head_sha,
       base_branch = EXCLUDED.base_branch,
       head_branch = EXCLUDED.head_branch,
       labels = EXCLUDED.labels,
       updated_at = EXCLUDED.updated_at,
       merged_at = EXCLUDED.merged_at
     RETURNING *`,
    [
      id,
      input.repoId,
      input.orgId,
      input.number,
      input.title,
      input.state,
      input.author ?? null,
      input.headSha ?? null,
      input.baseBranch ?? null,
      input.headBranch ?? null,
      JSON.stringify(input.labels ?? []),
      input.createdAt ?? new Date().toISOString(),
      input.updatedAt ?? new Date().toISOString(),
      input.mergedAt ?? null,
    ],
  );
  return rows[0] as BbPrRow;
}

export async function upsertBbIssue(db: ProductDb, input: UpsertBbIssueInput): Promise<BbIssueRow> {
  const id = newUlid();
  const rows = await db.query<BbIssueRow>(
    `INSERT INTO bb_issues (id, repo_id, org_id, number, title, state, author, labels, created_at, updated_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     ON CONFLICT (repo_id, number) DO UPDATE SET
       title = EXCLUDED.title,
       state = EXCLUDED.state,
       author = EXCLUDED.author,
       labels = EXCLUDED.labels,
       updated_at = EXCLUDED.updated_at,
       closed_at = EXCLUDED.closed_at
     RETURNING *`,
    [
      id,
      input.repoId,
      input.orgId,
      input.number,
      input.title,
      input.state,
      input.author ?? null,
      JSON.stringify(input.labels ?? []),
      input.createdAt ?? new Date().toISOString(),
      input.updatedAt ?? new Date().toISOString(),
      input.closedAt ?? null,
    ],
  );
  return rows[0] as BbIssueRow;
}

export async function listBbPrs(
  db: ProductDb,
  repoId: string,
  state?: string,
): Promise<BbPrRow[]> {
  if (state) {
    return db.query<BbPrRow>(
      `SELECT * FROM bb_prs WHERE repo_id = $1 AND state = $2 ORDER BY number DESC`,
      [repoId, state],
    );
  }
  return db.query<BbPrRow>(
    `SELECT * FROM bb_prs WHERE repo_id = $1 ORDER BY number DESC`,
    [repoId],
  );
}

export async function listBbIssues(
  db: ProductDb,
  repoId: string,
  state?: string,
): Promise<BbIssueRow[]> {
  if (state) {
    return db.query<BbIssueRow>(
      `SELECT * FROM bb_issues WHERE repo_id = $1 AND state = $2 ORDER BY number DESC`,
      [repoId, state],
    );
  }
  return db.query<BbIssueRow>(
    `SELECT * FROM bb_issues WHERE repo_id = $1 ORDER BY number DESC`,
    [repoId],
  );
}

export async function setBitbucketAppPassword(
  db: ProductDb,
  orgId: string,
  password: string,
): Promise<void> {
  await db.query(
    `INSERT INTO org_settings (org_id, bitbucket_app_password, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (org_id) DO UPDATE SET bitbucket_app_password = $2, updated_at = now()`,
    [orgId, password],
  );
}

export async function getBitbucketAppPassword(
  db: ProductDb,
  orgId: string,
): Promise<string | null> {
  const rows = await db.query<{ bitbucket_app_password: string | null }>(
    `SELECT bitbucket_app_password FROM org_settings WHERE org_id = $1`,
    [orgId],
  );
  return rows[0]?.bitbucket_app_password ?? null;
}

export async function setBitbucketOauthToken(
  db: ProductDb,
  orgId: string,
  token: string,
): Promise<void> {
  await db.query(
    `INSERT INTO org_settings (org_id, bitbucket_oauth_token, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (org_id) DO UPDATE SET bitbucket_oauth_token = $2, updated_at = now()`,
    [orgId, token],
  );
}

export async function getBitbucketOauthToken(
  db: ProductDb,
  orgId: string,
): Promise<string | null> {
  const rows = await db.query<{ bitbucket_oauth_token: string | null }>(
    `SELECT bitbucket_oauth_token FROM org_settings WHERE org_id = $1`,
    [orgId],
  );
  return rows[0]?.bitbucket_oauth_token ?? null;
}

/** Get either oauth token or app password for Bitbucket auth. OAuth preferred. */
export async function getBitbucketAuth(
  db: ProductDb,
  orgId: string,
): Promise<{ kind: "oauth"; token: string } | { kind: "app_password"; password: string } | null> {
  const rows = await db.query<{
    bitbucket_oauth_token: string | null;
    bitbucket_app_password: string | null;
  }>(
    `SELECT bitbucket_oauth_token, bitbucket_app_password FROM org_settings WHERE org_id = $1`,
    [orgId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.bitbucket_oauth_token) return { kind: "oauth", token: row.bitbucket_oauth_token };
  if (row.bitbucket_app_password) return { kind: "app_password", password: row.bitbucket_app_password };
  return null;
}
