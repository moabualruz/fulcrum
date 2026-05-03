/**
 * connector.bitbucket.sync — fetches open PRs + issues for one repo via
 * a pluggable Bitbucket client (bitbucket.js or raw HTTP), upserts rows
 * into bb_prs and bb_issues tables.
 *
 * Gated: FULCRUM_FEATURES=connector-bitbucket must be set.
 */
import type { ProductDb } from "../db/types.ts";
import { isFeatureEnabled } from "../features.ts";
import {
  upsertBbPr,
  upsertBbIssue,
  getBitbucketAuth,
} from "../store/bitbucket.ts";
import { upsertRepoBranch } from "../store/github.ts";

// ── Pluggable Bitbucket client interface ──

export interface BitbucketPrData {
  id: number;
  title: string;
  state: string;
  author?: { display_name?: string; nickname?: string } | null;
  source?: { branch?: { name: string }; commit?: { hash: string } } | null;
  destination?: { branch?: { name: string } } | null;
  created_on?: string;
  updated_on?: string;
  merge_commit?: { hash: string } | null;
  closed_on?: string | null;
}

export interface BitbucketIssueData {
  id: number;
  title: string;
  state: string;
  reporter?: { display_name?: string; nickname?: string } | null;
  priority?: string;
  kind?: string;
  created_on?: string;
  updated_on?: string;
  closed_on?: string | null;
}

export interface BitbucketClient {
  listOpenPrs(workspace: string, repoSlug: string): Promise<BitbucketPrData[]>;
  listOpenIssues(workspace: string, repoSlug: string): Promise<BitbucketIssueData[]>;
}

// ── Parse workspace/repo from remote_url ──

export function parseBitbucketRemote(
  remoteUrl: string,
): { workspace: string; repoSlug: string } | null {
  // HTTPS: https://bitbucket.org/workspace/repo-slug.git
  // SSH: git@bitbucket.org:workspace/repo-slug.git
  const match = remoteUrl.match(/bitbucket\.org[/:]([^/]+)\/([^/.]+)/);
  if (match) return { workspace: match[1]!, repoSlug: match[2]! };
  return null;
}

// ── Sync task ──

export interface SyncResult {
  prsUpserted: number;
  issuesUpserted: number;
  branchesUpserted: number;
  skipped: boolean;
}

export async function syncBitbucketRepo(
  db: ProductDb,
  client: BitbucketClient,
  repoId: string,
  orgId: string,
  remoteUrl: string,
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-bitbucket")) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const parsed = parseBitbucketRemote(remoteUrl);
  if (!parsed) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const { workspace, repoSlug } = parsed;
  let prsUpserted = 0;
  let issuesUpserted = 0;
  let branchesUpserted = 0;

  // Fetch + upsert PRs
  const prs = await client.listOpenPrs(workspace, repoSlug);
  for (const pr of prs) {
    const authorName =
      pr.author?.display_name ?? pr.author?.nickname ?? null;
    await upsertBbPr(db, {
      repoId,
      orgId,
      number: pr.id,
      title: pr.title,
      state: pr.state,
      author: authorName,
      headSha: pr.source?.commit?.hash ?? null,
      baseBranch: pr.destination?.branch?.name ?? null,
      headBranch: pr.source?.branch?.name ?? null,
      labels: [],
      createdAt: pr.created_on,
      updatedAt: pr.updated_on,
      mergedAt: pr.state === "MERGED" ? (pr.updated_on ?? null) : null,
    });
    prsUpserted++;

    // Upsert PR head branch into repo_branches
    if (pr.source?.branch?.name) {
      await upsertRepoBranch(db, {
        repoId,
        name: pr.source.branch.name,
        sha: pr.source.commit?.hash ?? null,
        isPrBranch: true,
        prNumber: pr.id,
      });
      branchesUpserted++;
    }
  }

  // Fetch + upsert issues
  const issues = await client.listOpenIssues(workspace, repoSlug);
  for (const issue of issues) {
    const reporterName =
      issue.reporter?.display_name ?? issue.reporter?.nickname ?? null;
    await upsertBbIssue(db, {
      repoId,
      orgId,
      number: issue.id,
      title: issue.title,
      state: issue.state,
      author: reporterName,
      labels: issue.kind ? [issue.kind] : [],
      createdAt: issue.created_on,
      updatedAt: issue.updated_on,
      closedAt: issue.closed_on ?? null,
    });
    issuesUpserted++;
  }

  return { prsUpserted, issuesUpserted, branchesUpserted, skipped: false };
}

// ── HTTP-based client with 429 backoff (thin adapter over xh/fetch) ──

export function createBitbucketHttpClient(
  auth: { kind: "oauth"; token: string } | { kind: "app_password"; password: string },
  username?: string,
): BitbucketClient {
  async function apiFetch<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (auth.kind === "oauth") {
      headers.Authorization = `Bearer ${auth.token}`;
    } else if (username) {
      headers.Authorization = `Basic ${btoa(`${username}:${auth.password}`)}`;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(String(url), { headers });
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        let waitMs = 1000 * 2 ** attempt;
        if (retryAfter) {
          const secs = Number(retryAfter);
          if (!Number.isNaN(secs)) waitMs = Math.min(secs * 1000 + 1000, 60_000);
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) throw new Error(`Bitbucket API ${res.status}: ${await res.text()}`);
      return (await res.json()) as T;
    }
    throw new Error("Bitbucket API rate limit exceeded after 5 retries");
  }

  // Bitbucket API 2.0 uses paginated responses with `values` array
  async function fetchAllPages<T>(baseUrl: string): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = baseUrl;
    while (url) {
      const page = await apiFetch<{ values: T[]; next?: string }>(url);
      results.push(...page.values);
      url = page.next ?? null;
    }
    return results;
  }

  return {
    async listOpenPrs(workspace, repoSlug) {
      return fetchAllPages<BitbucketPrData>(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/pullrequests?state=OPEN`,
      );
    },
    async listOpenIssues(workspace, repoSlug) {
      return fetchAllPages<BitbucketIssueData>(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/issues?q=state="new" OR state="open"`,
      );
    },
  };
}

// ── Job handler for graphile-worker / local job queue ──

export async function handleBitbucketSyncJob(
  db: ProductDb,
  payload: { repoId: string; orgId: string; remoteUrl: string },
): Promise<SyncResult> {
  if (!isFeatureEnabled("connector-bitbucket")) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const authInfo = await getBitbucketAuth(db, payload.orgId);
  if (!authInfo) {
    return { prsUpserted: 0, issuesUpserted: 0, branchesUpserted: 0, skipped: true };
  }

  const client = createBitbucketHttpClient(authInfo);
  return syncBitbucketRepo(db, client, payload.repoId, payload.orgId, payload.remoteUrl);
}

// ── Cron: enqueue sync for all Bitbucket-remote repos ──

export async function enqueueBitbucketSyncForAllRepos(
  db: ProductDb,
  enqueue: (orgId: string, repoId: string, remoteUrl: string) => Promise<void>,
): Promise<number> {
  if (!isFeatureEnabled("connector-bitbucket")) return 0;

  const repos = await db.query<{ id: string; org_id: string; remote_url: string }>(
    `SELECT id, org_id, remote_url FROM repos WHERE remote_url IS NOT NULL AND remote_url LIKE '%bitbucket.org%'`,
  );

  for (const repo of repos) {
    await enqueue(repo.org_id, repo.id, repo.remote_url);
  }

  return repos.length;
}
