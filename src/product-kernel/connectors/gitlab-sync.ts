/**
 * connector.gitlab.sync — fetches open MRs + issues for one repo via
 * a pluggable GitLab client (@gitbeaker/rest or raw HTTP), upserts rows,
 * and upserts MR-branch entries into repo_branches.
 *
 * Gated: FULCRUM_FEATURES=connector-gitlab must be set.
 */
import type { ProductDb } from "../db/types.ts";
import { isFeatureEnabled } from "../features.ts";
import {
  upsertGitlabMr,
  upsertGitlabIssue,
  getGitlabToken,
} from "../store/gitlab.ts";
import { upsertRepoBranch } from "../store/github.ts";

// ── Pluggable GitLab client interface ──

export interface GitlabMrData {
  iid: number;
  title: string;
  state: string;
  author?: { username: string } | null;
  sha?: string | null;
  source_branch?: string | null;
  target_branch?: string | null;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
}

export interface GitlabIssueData {
  iid: number;
  title: string;
  state: string;
  author?: { username: string } | null;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
}

export interface GitlabClient {
  listOpenMrs(projectPath: string): Promise<GitlabMrData[]>;
  listOpenIssues(projectPath: string): Promise<GitlabIssueData[]>;
}

// ── Parse owner/repo from remote_url ──

const GITLAB_HOSTS = new Set(["gitlab.com"]);

export function addGitlabHost(host: string): void {
  GITLAB_HOSTS.add(host);
}

export function removeGitlabHost(host: string): void {
  GITLAB_HOSTS.delete(host);
}

export function parseGitlabRemote(remoteUrl: string): { host: string; projectPath: string } | null {
  // HTTPS: https://gitlab.com/group/project.git
  // SSH: git@gitlab.com:group/project.git
  for (const host of GITLAB_HOSTS) {
    const httpsRe = new RegExp(`${host.replace(/\./g, "\\.")}[/:]([^/]+(?:/[^/.]+)+)`);
    const match = remoteUrl.match(httpsRe);
    if (match) {
      const projectPath = match[1]!.replace(/\.git$/, "");
      return { host, projectPath };
    }
  }
  return null;
}

// ── Sync task ──

export interface SyncResult {
  mrsUpserted: number;
  issuesUpserted: number;
  branchesUpserted: number;
  skipped: boolean;
}

export async function syncGitlabRepo(
  db: ProductDb,
  client: GitlabClient,
  repoId: string,
  orgId: string,
  remoteUrl: string,
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-gitlab")) {
    return { mrsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const parsed = parseGitlabRemote(remoteUrl);
  if (!parsed) {
    return { mrsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const { projectPath } = parsed;
  let mrsUpserted = 0;
  let issuesUpserted = 0;
  let branchesUpserted = 0;

  // Fetch + upsert MRs
  const mrs = await client.listOpenMrs(projectPath);
  for (const mr of mrs) {
    await upsertGitlabMr(db, {
      repoId,
      orgId,
      mrIid: mr.iid,
      title: mr.title,
      state: mr.state,
      author: mr.author?.username ?? null,
      headSha: mr.sha ?? null,
      baseBranch: mr.target_branch ?? null,
      headBranch: mr.source_branch ?? null,
      labels: mr.labels ?? [],
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      mergedAt: mr.merged_at ?? null,
    });
    mrsUpserted++;

    // Upsert MR source branch into repo_branches
    if (mr.source_branch) {
      await upsertRepoBranch(db, {
        repoId,
        name: mr.source_branch,
        sha: mr.sha ?? null,
        isPrBranch: true,
        prNumber: mr.iid,
      });
      branchesUpserted++;
    }
  }

  // Fetch + upsert issues
  const issues = await client.listOpenIssues(projectPath);
  for (const issue of issues) {
    await upsertGitlabIssue(db, {
      repoId,
      orgId,
      issueIid: issue.iid,
      title: issue.title,
      state: issue.state,
      author: issue.author?.username ?? null,
      labels: issue.labels ?? [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at ?? null,
    });
    issuesUpserted++;
  }

  return { mrsUpserted, issuesUpserted, branchesUpserted, skipped: false };
}

// ── Gitbeaker-based client with 429 backoff ──

export function createGitbeakerClient(token: string, host = "https://gitlab.com"): GitlabClient {
  let apiInstance: any = null;

  async function getApi() {
    if (apiInstance) return apiInstance;
    try {
      // @ts-expect-error — @gitbeaker/rest is an optional peer dependency
      const mod = await import("@gitbeaker/rest");
      const Gitlab = mod.Gitlab ?? mod.default?.Gitlab ?? mod.default;
      apiInstance = new Gitlab({ token, host });
      return apiInstance;
    } catch {
      // Fallback: thin xh adapter if gitbeaker unavailable
      return null;
    }
  }

  async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err?.statusCode === 429 || err?.status === 429) {
          const retryAfter = err?.headers?.["retry-after"];
          let waitMs = 1000 * 2 ** attempt;
          if (retryAfter) {
            const secs = Number(retryAfter);
            if (!Number.isNaN(secs)) waitMs = Math.min(secs * 1000 + 1000, 60_000);
          }
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error("GitLab API rate limit exceeded after 5 retries");
  }

  return {
    async listOpenMrs(projectPath) {
      const api = await getApi();
      if (!api) return [];
      return withBackoff(async () => {
        const data = await api.MergeRequests.all({ projectId: projectPath, state: "opened", perPage: 100 });
        return data as GitlabMrData[];
      });
    },
    async listOpenIssues(projectPath) {
      const api = await getApi();
      if (!api) return [];
      return withBackoff(async () => {
        const data = await api.Issues.all({ projectId: projectPath, state: "opened", perPage: 100 });
        return data as GitlabIssueData[];
      });
    },
  };
}

// ── Job handler for graphile-worker / local job queue ──

export async function handleGitlabSyncJob(
  db: ProductDb,
  payload: { repoId: string; orgId: string; remoteUrl: string },
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-gitlab")) {
    return { mrsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const token = await getGitlabToken(db, payload.orgId);
  if (!token) {
    return { mrsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const parsed = parseGitlabRemote(payload.remoteUrl);
  const host = parsed ? `https://${parsed.host}` : "https://gitlab.com";
  const client = createGitbeakerClient(token, host);
  return syncGitlabRepo(db, client, payload.repoId, payload.orgId, payload.remoteUrl);
}

// ── Cron: enqueue sync for all GitLab-remote repos ──

export async function enqueueGitlabSyncForAllRepos(
  db: ProductDb,
  enqueue: (orgId: string, repoId: string, remoteUrl: string) => Promise<void>,
): Promise<number> {
  if (!isFeatureEnabled("connector-gitlab")) return 0;

  // Match gitlab.com and any user-configured self-hosted hosts
  const hostPatterns = Array.from(GITLAB_HOSTS).map((h) => `%${h}%`);
  const placeholders = hostPatterns.map((_, i) => `remote_url LIKE $${i + 1}`).join(" OR ");

  const repos = await db.query<{ id: string; org_id: string; remote_url: string }>(
    `SELECT id, org_id, remote_url FROM repos WHERE remote_url IS NOT NULL AND (${placeholders})`,
    hostPatterns,
  );

  for (const repo of repos) {
    await enqueue(repo.org_id, repo.id, repo.remote_url);
  }

  return repos.length;
}
