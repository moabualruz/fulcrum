/**
 * connector.github.sync — fetches open PRs + issues for one repo via
 * a pluggable GitHub client (Octokit or raw HTTP), upserts rows, and
 * upserts PR-branch entries into repo_branches.
 *
 * Gated: FULCRUM_FEATURES=connector-github must be set.
 */
import type { ProductDb } from "../db/types.ts";
import { isFeatureEnabled } from "../features.ts";
import {
  upsertGithubPr,
  upsertGithubIssue,
  upsertRepoBranch,
  getGithubOauthToken,
} from "../store/github.ts";

// ── Pluggable GitHub client interface ──

export interface GithubPrData {
  number: number;
  title: string;
  state: string;
  user?: { login: string } | null;
  head?: { sha: string; ref: string } | null;
  base?: { ref: string } | null;
  labels?: Array<{ name: string }>;
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
}

export interface GithubIssueData {
  number: number;
  title: string;
  state: string;
  user?: { login: string } | null;
  labels?: Array<{ name: string }>;
  pull_request?: unknown;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
}

export interface GithubClient {
  listOpenPrs(owner: string, repo: string): Promise<GithubPrData[]>;
  listOpenIssues(owner: string, repo: string): Promise<GithubIssueData[]>;
}

// ── Parse owner/repo from remote_url ──

export function parseGithubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  return null;
}

// ── Sync task ──

export interface SyncResult {
  prsUpserted: number;
  issuesUpserted: number;
  branchesUpserted: number;
  skipped: boolean;
}

export async function syncGithubRepo(
  db: ProductDb,
  client: GithubClient,
  repoId: string,
  orgId: string,
  remoteUrl: string,
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-github")) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const parsed = parseGithubRemote(remoteUrl);
  if (!parsed) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const { owner, repo } = parsed;
  let prsUpserted = 0;
  let issuesUpserted = 0;
  let branchesUpserted = 0;

  // Fetch + upsert PRs
  const prs = await client.listOpenPrs(owner, repo);
  for (const pr of prs) {
    await upsertGithubPr(db, {
      repoId,
      orgId,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login ?? null,
      headSha: pr.head?.sha ?? null,
      baseBranch: pr.base?.ref ?? null,
      headBranch: pr.head?.ref ?? null,
      labels: pr.labels?.map((l) => l.name) ?? [],
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at ?? null,
    });
    prsUpserted++;

    // Upsert PR head branch into repo_branches
    if (pr.head?.ref) {
      await upsertRepoBranch(db, {
        repoId,
        name: pr.head.ref,
        sha: pr.head.sha ?? null,
        isPrBranch: true,
        prNumber: pr.number,
      });
      branchesUpserted++;
    }
  }

  // Fetch + upsert issues (exclude PRs — GitHub API returns PRs as issues)
  const issues = await client.listOpenIssues(owner, repo);
  for (const issue of issues) {
    if (issue.pull_request) continue;
    await upsertGithubIssue(db, {
      repoId,
      orgId,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user?.login ?? null,
      labels: issue.labels?.map((l) => l.name) ?? [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at ?? null,
    });
    issuesUpserted++;
  }

  return { prsUpserted, issuesUpserted, branchesUpserted, skipped: false };
}

// ── Octokit-based client with 429 backoff ──

export function createOctokitClient(token: string): GithubClient {
  // Lazy import — only loaded when connector-github is enabled
  // Uses dynamic import so @octokit/rest is an optional dependency
  let octokitInstance: any = null;

  async function getOctokit() {
    if (octokitInstance) return octokitInstance;
    // @ts-expect-error — @octokit/rest is an optional peer dependency
    const mod = await import("@octokit/rest");
    const Octokit = mod.Octokit ?? mod.default?.Octokit ?? mod.default;
    octokitInstance = new Octokit({ auth: token });
    return octokitInstance;
  }

  async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err?.status === 429 || err?.status === 403) {
          const resetHeader = err?.response?.headers?.["x-ratelimit-reset"];
          let waitMs = 1000 * 2 ** attempt;
          if (resetHeader) {
            const resetTime = Number(resetHeader) * 1000;
            const now = Date.now();
            if (resetTime > now) waitMs = Math.min(resetTime - now + 1000, 60_000);
          }
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error("GitHub API rate limit exceeded after 5 retries");
  }

  return {
    async listOpenPrs(owner, repo) {
      const octokit = await getOctokit();
      return withBackoff(async () => {
        const { data } = await octokit.pulls.list({
          owner,
          repo,
          state: "open",
          per_page: 100,
        });
        return data as GithubPrData[];
      });
    },
    async listOpenIssues(owner, repo) {
      const octokit = await getOctokit();
      return withBackoff(async () => {
        const { data } = await octokit.issues.listForRepo({
          owner,
          repo,
          state: "open",
          per_page: 100,
        });
        return data as GithubIssueData[];
      });
    },
  };
}

// ── Job handler for graphile-worker / local job queue ──

export async function handleGithubSyncJob(
  db: ProductDb,
  payload: { repoId: string; orgId: string; remoteUrl: string },
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-github")) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const token = await getGithubOauthToken(db, payload.orgId);
  if (!token) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const client = createOctokitClient(token);
  return syncGithubRepo(db, client, payload.repoId, payload.orgId, payload.remoteUrl);
}

// ── Cron: enqueue sync for all GitHub-remote repos ──

export async function enqueueGithubSyncForAllRepos(
  db: ProductDb,
  enqueue: (orgId: string, repoId: string, remoteUrl: string) => Promise<void>,
): Promise<number> {
  if (!isFeatureEnabled("connector-github")) return 0;

  const repos = await db.query<{ id: string; org_id: string; remote_url: string }>(
    `SELECT id, org_id, remote_url FROM repos WHERE remote_url IS NOT NULL AND remote_url LIKE '%github.com%'`,
  );

  for (const repo of repos) {
    await enqueue(repo.org_id, repo.id, repo.remote_url);
  }

  return repos.length;
}
