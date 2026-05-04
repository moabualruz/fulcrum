import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// ── Row types ──

export interface GitlabMrRow {
  id: string;
  repo_id: string;
  org_id: string;
  mr_iid: number;
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

export interface GitlabIssueRow {
  id: string;
  repo_id: string;
  org_id: string;
  issue_iid: number;
  title: string;
  state: string;
  author: string | null;
  labels: string[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

// ── Upsert inputs ──

export interface UpsertMrInput {
  repoId: string;
  orgId: string;
  mrIid: number;
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

export interface UpsertGitlabIssueInput {
  repoId: string;
  orgId: string;
  issueIid: number;
  title: string;
  state: string;
  author?: string | null;
  labels?: string[];
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
}

// ── Store functions ──

export async function upsertGitlabMr(db: ProductDb, input: UpsertMrInput): Promise<GitlabMrRow> {
  const id = newUlid();
  const rows = await db.query<GitlabMrRow>(
    `INSERT INTO gitlab_mrs (id, repo_id, org_id, mr_iid, title, state, author, head_sha, base_branch, head_branch, labels, created_at, updated_at, merged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
     ON CONFLICT (repo_id, mr_iid) DO UPDATE SET
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
      input.mrIid,
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
  return rows[0] as GitlabMrRow;
}

export async function upsertGitlabIssue(db: ProductDb, input: UpsertGitlabIssueInput): Promise<GitlabIssueRow> {
  const id = newUlid();
  const rows = await db.query<GitlabIssueRow>(
    `INSERT INTO gitlab_issues (id, repo_id, org_id, issue_iid, title, state, author, labels, created_at, updated_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     ON CONFLICT (repo_id, issue_iid) DO UPDATE SET
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
      input.issueIid,
      input.title,
      input.state,
      input.author ?? null,
      JSON.stringify(input.labels ?? []),
      input.createdAt ?? new Date().toISOString(),
      input.updatedAt ?? new Date().toISOString(),
      input.closedAt ?? null,
    ],
  );
  return rows[0] as GitlabIssueRow;
}

export async function listGitlabMrs(
  db: ProductDb,
  repoId: string,
  state?: string,
): Promise<GitlabMrRow[]> {
  if (state) {
    return db.query<GitlabMrRow>(
      `SELECT * FROM gitlab_mrs WHERE repo_id = $1 AND state = $2 ORDER BY mr_iid DESC`,
      [repoId, state],
    );
  }
  return db.query<GitlabMrRow>(
    `SELECT * FROM gitlab_mrs WHERE repo_id = $1 ORDER BY mr_iid DESC`,
    [repoId],
  );
}

export async function listGitlabIssues(
  db: ProductDb,
  repoId: string,
  state?: string,
): Promise<GitlabIssueRow[]> {
  if (state) {
    return db.query<GitlabIssueRow>(
      `SELECT * FROM gitlab_issues WHERE repo_id = $1 AND state = $2 ORDER BY issue_iid DESC`,
      [repoId, state],
    );
  }
  return db.query<GitlabIssueRow>(
    `SELECT * FROM gitlab_issues WHERE repo_id = $1 ORDER BY issue_iid DESC`,
    [repoId],
  );
}

export async function setGitlabPat(
  db: ProductDb,
  orgId: string,
  token: string,
): Promise<void> {
  await db.query(
    `INSERT INTO org_settings (org_id, gitlab_pat, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (org_id) DO UPDATE SET gitlab_pat = $2, updated_at = now()`,
    [orgId, token],
  );
}

export async function setGitlabOauthToken(
  db: ProductDb,
  orgId: string,
  token: string,
): Promise<void> {
  await db.query(
    `INSERT INTO org_settings (org_id, gitlab_oauth_token, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (org_id) DO UPDATE SET gitlab_oauth_token = $2, updated_at = now()`,
    [orgId, token],
  );
}

export async function getGitlabToken(
  db: ProductDb,
  orgId: string,
): Promise<string | null> {
  const rows = await db.query<{ gitlab_pat: string | null; gitlab_oauth_token: string | null }>(
    `SELECT gitlab_pat, gitlab_oauth_token FROM org_settings WHERE org_id = $1`,
    [orgId],
  );
  if (!rows[0]) return null;
  // Prefer PAT over OAuth token
  return rows[0].gitlab_pat ?? rows[0].gitlab_oauth_token ?? null;
}
