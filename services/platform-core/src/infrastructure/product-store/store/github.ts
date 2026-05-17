import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// ── Row types ──

export interface GithubPrRow {
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

export interface GithubIssueRow {
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

export interface RepoBranchRow {
  id: string;
  repo_id: string;
  name: string;
  sha: string | null;
  is_pr_branch: boolean;
  pr_number: number | null;
  updated_at: string;
}

// ── Upsert inputs ──

export interface UpsertPrInput {
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

export interface UpsertIssueInput {
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

export interface UpsertBranchInput {
  repoId: string;
  name: string;
  sha?: string | null;
  isPrBranch?: boolean;
  prNumber?: number | null;
}

// ── Store functions ──

export async function upsertGithubPr(db: ProductDb, input: UpsertPrInput): Promise<GithubPrRow> {
  const id = newUlid();
  const rows = await db.query<GithubPrRow>(
    `INSERT INTO github_prs (id, repo_id, org_id, number, title, state, author, head_sha, base_branch, head_branch, labels, created_at, updated_at, merged_at)
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
  return rows[0] as GithubPrRow;
}

export async function upsertGithubIssue(db: ProductDb, input: UpsertIssueInput): Promise<GithubIssueRow> {
  const id = newUlid();
  const rows = await db.query<GithubIssueRow>(
    `INSERT INTO github_issues (id, repo_id, org_id, number, title, state, author, labels, created_at, updated_at, closed_at)
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
  return rows[0] as GithubIssueRow;
}

export async function upsertRepoBranch(db: ProductDb, input: UpsertBranchInput): Promise<RepoBranchRow> {
  const id = newUlid();
  const rows = await db.query<RepoBranchRow>(
    `INSERT INTO repo_branches (id, repo_id, name, sha, is_pr_branch, pr_number)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (repo_id, name) DO UPDATE SET
       sha = EXCLUDED.sha,
       is_pr_branch = EXCLUDED.is_pr_branch,
       pr_number = EXCLUDED.pr_number,
       updated_at = now()
     RETURNING *`,
    [
      id,
      input.repoId,
      input.name,
      input.sha ?? null,
      input.isPrBranch ?? false,
      input.prNumber ?? null,
    ],
  );
  return rows[0] as RepoBranchRow;
}

export async function listGithubPrs(
  db: ProductDb,
  repoId: string,
  state?: string,
): Promise<GithubPrRow[]> {
  if (state) {
    return db.query<GithubPrRow>(
      `SELECT * FROM github_prs WHERE repo_id = $1 AND state = $2 ORDER BY number DESC`,
      [repoId, state],
    );
  }
  return db.query<GithubPrRow>(
    `SELECT * FROM github_prs WHERE repo_id = $1 ORDER BY number DESC`,
    [repoId],
  );
}

export async function listGithubIssues(
  db: ProductDb,
  repoId: string,
  state?: string,
): Promise<GithubIssueRow[]> {
  if (state) {
    return db.query<GithubIssueRow>(
      `SELECT * FROM github_issues WHERE repo_id = $1 AND state = $2 ORDER BY number DESC`,
      [repoId, state],
    );
  }
  return db.query<GithubIssueRow>(
    `SELECT * FROM github_issues WHERE repo_id = $1 ORDER BY number DESC`,
    [repoId],
  );
}

export async function listRepoBranches(
  db: ProductDb,
  repoId: string,
): Promise<RepoBranchRow[]> {
  return db.query<RepoBranchRow>(
    `SELECT * FROM repo_branches WHERE repo_id = $1 ORDER BY name ASC`,
    [repoId],
  );
}

export async function setGithubOauthToken(
  db: ProductDb,
  orgId: string,
  token: string,
): Promise<void> {
  await db.query(
    `INSERT INTO org_settings (org_id, github_oauth_token, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (org_id) DO UPDATE SET github_oauth_token = $2, updated_at = now()`,
    [orgId, token],
  );
}

export async function getGithubOauthToken(
  db: ProductDb,
  orgId: string,
): Promise<string | null> {
  const rows = await db.query<{ github_oauth_token: string | null }>(
    `SELECT github_oauth_token FROM org_settings WHERE org_id = $1`,
    [orgId],
  );
  return rows[0]?.github_oauth_token ?? null;
}
