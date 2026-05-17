import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { _resetFeatureCache } from "../features.ts";
import {
  listGithubPrs,
  listGithubIssues,
  listRepoBranches,
  setGithubOauthToken,
  getGithubOauthToken,
} from "../store/github.ts";
import {
  parseGithubRemote,
  syncGithubRepo,
  handleGithubSyncJob,
  enqueueGithubSyncForAllRepos,
  type GithubClient,
  type GithubPrData,
  type GithubIssueData,
} from "./github-sync.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-gh-sync-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  _resetFeatureCache();
  delete process.env.FULCRUM_FEATURES;
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

async function insertRepo(
  db: Awaited<ReturnType<typeof openIsolatedStore>>,
  orgId: string,
  slug: string,
  remoteUrl: string,
) {
  const { makeId } = await import("@test-support/product-workspace-fixtures.ts");
  const id = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, remote_url) VALUES ($1, $2, $3, $4, $5)`,
    [id, orgId, slug, `/tmp/${slug}`, remoteUrl],
  );
  return id;
}

function mockClient(prs: GithubPrData[], issues: GithubIssueData[]): GithubClient {
  return {
    async listOpenPrs() {
      return prs;
    },
    async listOpenIssues() {
      return issues;
    },
  };
}

// ── parseGithubRemote ──

describe("parseGithubRemote", () => {
  test("parses HTTPS URL", () => {
    expect(parseGithubRemote("https://github.com/octocat/Hello-World.git")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
  });

  test("parses SSH URL", () => {
    expect(parseGithubRemote("git@github.com:octocat/Hello-World.git")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
  });

  test("returns null for non-github URL", () => {
    expect(parseGithubRemote("https://gitlab.com/foo/bar")).toBeNull();
  });
});

// ── Feature gate ──

describe("syncGithubRepo feature gate", () => {
  test("skips when connector-github flag OFF", async () => {
    const db = await freshDb("gate-off");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://github.com/foo/bar");
      const result = await syncGithubRepo(
        db,
        mockClient([], []),
        repoId,
        org.id,
        "https://github.com/foo/bar",
      );
      expect(result.skipped).toBe(true);
      expect(result.prsUpserted).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("skips invalid GitHub remotes after the flag is enabled without calling the client", async () => {
    process.env.FULCRUM_FEATURES = "connector-github";
    const db = await freshDb("invalid-remote");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://example.com/foo/bar");
      const client: GithubClient = {
        listOpenPrs: async () => {
          throw new Error("client should not be called for invalid remotes");
        },
        listOpenIssues: async () => {
          throw new Error("client should not be called for invalid remotes");
        },
      };

      const result = await syncGithubRepo(
        db,
        client,
        repoId,
        org.id,
        "https://example.com/foo/bar",
      );

      expect(result).toEqual({
        prsUpserted: 0,
        issuesUpserted: 0,
        branchesUpserted: 0,
        skipped: true,
      });
    } finally {
      await db.close();
    }
  });
});

// ── Sync with mock client ──

describe("syncGithubRepo with mock client", () => {
  test("upserts PRs, issues, and branches", async () => {
    process.env.FULCRUM_FEATURES = "connector-github";
    const db = await freshDb("sync-mock");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://github.com/foo/bar");

      const client = mockClient(
        [
          {
            number: 1,
            title: "Add feature",
            state: "open",
            user: { login: "alice" },
            head: { sha: "abc123", ref: "feature-branch" },
            base: { ref: "main" },
            labels: [{ name: "enhancement" }],
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
            merged_at: null,
          },
        ],
        [
          {
            number: 10,
            title: "Bug report",
            state: "open",
            user: { login: "bob" },
            labels: [{ name: "bug" }],
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
            closed_at: null,
          },
          {
            // PR returned as issue — should be skipped
            number: 1,
            title: "Add feature",
            state: "open",
            pull_request: { url: "..." },
          },
        ],
      );

      const result = await syncGithubRepo(
        db,
        client,
        repoId,
        org.id,
        "https://github.com/foo/bar",
      );

      expect(result.skipped).toBe(false);
      expect(result.prsUpserted).toBe(1);
      expect(result.issuesUpserted).toBe(1);
      expect(result.branchesUpserted).toBe(1);

      // Verify DB state
      const prs = await listGithubPrs(db, repoId);
      expect(prs).toHaveLength(1);
      expect(prs[0]!.title).toBe("Add feature");
      expect(prs[0]!.author).toBe("alice");

      const issues = await listGithubIssues(db, repoId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.title).toBe("Bug report");

      const branches = await listRepoBranches(db, repoId);
      expect(branches).toHaveLength(1);
      expect(branches[0]!.name).toBe("feature-branch");
      expect(branches[0]!.is_pr_branch).toBe(true);
      expect(branches[0]!.pr_number).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("upsert is idempotent — re-sync updates existing rows", async () => {
    process.env.FULCRUM_FEATURES = "connector-github";
    const db = await freshDb("sync-idem");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://github.com/foo/bar");

      const prData: GithubPrData = {
        number: 1,
        title: "V1",
        state: "open",
        head: { sha: "aaa", ref: "feat" },
        base: { ref: "main" },
      };
      const client1 = mockClient([prData], []);
      await syncGithubRepo(db, client1, repoId, org.id, "https://github.com/foo/bar");

      // Second sync with updated title
      prData.title = "V2";
      prData.head = { sha: "bbb", ref: "feat" };
      const client2 = mockClient([prData], []);
      await syncGithubRepo(db, client2, repoId, org.id, "https://github.com/foo/bar");

      const prs = await listGithubPrs(db, repoId);
      expect(prs).toHaveLength(1);
      expect(prs[0]!.title).toBe("V2");

      const branches = await listRepoBranches(db, repoId);
      expect(branches).toHaveLength(1);
      expect(branches[0]!.sha).toBe("bbb");
    } finally {
      await db.close();
    }
  });
});

// ── org_settings token storage ──

describe("org_settings github token", () => {
  test("set and get oauth token", async () => {
    const db = await freshDb("token");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      expect(await getGithubOauthToken(db, org.id)).toBeNull();

      await setGithubOauthToken(db, org.id, "ghp_test123");
      expect(await getGithubOauthToken(db, org.id)).toBe("ghp_test123");

      // Update token
      await setGithubOauthToken(db, org.id, "ghp_updated");
      expect(await getGithubOauthToken(db, org.id)).toBe("ghp_updated");
    } finally {
      await db.close();
    }
  });

  test("job handler skips real GitHub sync when no org OAuth token exists", async () => {
    process.env.FULCRUM_FEATURES = "connector-github";
    const db = await freshDb("job-no-token");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://github.com/foo/bar");

      const result = await handleGithubSyncJob(db, {
        repoId,
        orgId: org.id,
        remoteUrl: "https://github.com/foo/bar",
      });

      expect(result).toEqual({
        prsUpserted: 0,
        issuesUpserted: 0,
        branchesUpserted: 0,
        skipped: true,
      });
    } finally {
      await db.close();
    }
  });
});

// ── Cron enqueue ──

describe("enqueueGithubSyncForAllRepos", () => {
  test("enqueues only github-remote repos when flag ON", async () => {
    process.env.FULCRUM_FEATURES = "connector-github";
    const db = await freshDb("cron");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await insertRepo(db, org.id, "gh-repo", "https://github.com/foo/bar");
      await insertRepo(db, org.id, "gl-repo", "https://gitlab.com/foo/bar");
      await insertRepo(db, org.id, "local", "/tmp/local");

      const enqueued: Array<{ orgId: string; repoId: string; remoteUrl: string }> = [];
      const count = await enqueueGithubSyncForAllRepos(db, async (orgId, repoId, remoteUrl) => {
        enqueued.push({ orgId, repoId, remoteUrl });
      });

      expect(count).toBe(1);
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]!.remoteUrl).toContain("github.com");
    } finally {
      await db.close();
    }
  });

  test("returns 0 when flag OFF", async () => {
    const db = await freshDb("cron-off");
    try {
      const count = await enqueueGithubSyncForAllRepos(db, async () => {});
      expect(count).toBe(0);
    } finally {
      await db.close();
    }
  });
});

// ── Migration tables ──

describe("migration 0004 tables", () => {
  test("creates org_settings, github_prs, github_issues, repo_branches", async () => {
    const db = await freshDb("tables");
    try {
      const tables = ["org_settings", "github_prs", "github_issues", "repo_branches"];
      for (const t of tables) {
        const rows = await db.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
          [t],
        );
        expect(rows[0]?.count ?? 0).toBe(1);
      }
    } finally {
      await db.close();
    }
  });
});
