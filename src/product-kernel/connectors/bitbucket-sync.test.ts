import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../test-support/product-fixtures.ts";
import { _resetFeatureCache } from "../features.ts";
import {
  listBbPrs,
  listBbIssues,
  setBitbucketAppPassword,
  setBitbucketOauthToken,
  getBitbucketAppPassword,
  getBitbucketOauthToken,
  getBitbucketAuth,
} from "../store/bitbucket.ts";
import { listRepoBranches } from "../store/github.ts";
import {
  parseBitbucketRemote,
  syncBitbucketRepo,
  enqueueBitbucketSyncForAllRepos,
  type BitbucketClient,
  type BitbucketPrData,
  type BitbucketIssueData,
} from "./bitbucket-sync.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-bb-sync-"));

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
  const { makeId } = await import("../../test-support/product-fixtures.ts");
  const id = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, remote_url) VALUES ($1, $2, $3, $4, $5)`,
    [id, orgId, slug, `/tmp/${slug}`, remoteUrl],
  );
  return id;
}

function mockClient(prs: BitbucketPrData[], issues: BitbucketIssueData[]): BitbucketClient {
  return {
    async listOpenPrs() {
      return prs;
    },
    async listOpenIssues() {
      return issues;
    },
  };
}

// ── parseBitbucketRemote ──

describe("parseBitbucketRemote", () => {
  test("parses HTTPS URL", () => {
    expect(parseBitbucketRemote("https://bitbucket.org/acme/my-repo.git")).toEqual({
      workspace: "acme",
      repoSlug: "my-repo",
    });
  });

  test("parses SSH URL", () => {
    expect(parseBitbucketRemote("git@bitbucket.org:acme/my-repo.git")).toEqual({
      workspace: "acme",
      repoSlug: "my-repo",
    });
  });

  test("returns null for non-bitbucket URL", () => {
    expect(parseBitbucketRemote("https://github.com/foo/bar")).toBeNull();
  });
});

// ── Feature gate ──

describe("syncBitbucketRepo feature gate", () => {
  test("skips when connector-bitbucket flag OFF", async () => {
    const db = await freshDb("gate-off");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://bitbucket.org/foo/bar");
      const result = await syncBitbucketRepo(
        db,
        mockClient([], []),
        repoId,
        org.id,
        "https://bitbucket.org/foo/bar",
      );
      expect(result.skipped).toBe(true);
      expect(result.prsUpserted).toBe(0);
    } finally {
      await db.close();
    }
  });
});

// ── Sync with mock client ──

describe("syncBitbucketRepo with mock client", () => {
  test("upserts PRs, issues, and branches", async () => {
    process.env.FULCRUM_FEATURES = "connector-bitbucket";
    const db = await freshDb("sync-mock");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://bitbucket.org/acme/repo");

      const client = mockClient(
        [
          {
            id: 1,
            title: "Add feature",
            state: "OPEN",
            author: { display_name: "Alice", nickname: "alice" },
            source: {
              branch: { name: "feature-branch" },
              commit: { hash: "abc123" },
            },
            destination: { branch: { name: "main" } },
            created_on: "2025-01-01T00:00:00Z",
            updated_on: "2025-01-02T00:00:00Z",
          },
        ],
        [
          {
            id: 10,
            title: "Bug report",
            state: "new",
            reporter: { display_name: "Bob" },
            kind: "bug",
            created_on: "2025-01-01T00:00:00Z",
            updated_on: "2025-01-02T00:00:00Z",
            closed_on: null,
          },
        ],
      );

      const result = await syncBitbucketRepo(
        db,
        client,
        repoId,
        org.id,
        "https://bitbucket.org/acme/repo",
      );

      expect(result.skipped).toBe(false);
      expect(result.prsUpserted).toBe(1);
      expect(result.issuesUpserted).toBe(1);
      expect(result.branchesUpserted).toBe(1);

      // Verify DB state
      const prs = await listBbPrs(db, repoId);
      expect(prs).toHaveLength(1);
      expect(prs[0]!.title).toBe("Add feature");
      expect(prs[0]!.author).toBe("Alice");
      expect(prs[0]!.state).toBe("OPEN");

      const issues = await listBbIssues(db, repoId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.title).toBe("Bug report");
      expect(issues[0]!.author).toBe("Bob");

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
    process.env.FULCRUM_FEATURES = "connector-bitbucket";
    const db = await freshDb("sync-idem");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://bitbucket.org/acme/repo");

      const prData: BitbucketPrData = {
        id: 1,
        title: "V1",
        state: "OPEN",
        source: {
          branch: { name: "feat" },
          commit: { hash: "aaa" },
        },
        destination: { branch: { name: "main" } },
      };
      const client1 = mockClient([prData], []);
      await syncBitbucketRepo(db, client1, repoId, org.id, "https://bitbucket.org/acme/repo");

      // Second sync with updated title
      prData.title = "V2";
      prData.source = { branch: { name: "feat" }, commit: { hash: "bbb" } };
      const client2 = mockClient([prData], []);
      await syncBitbucketRepo(db, client2, repoId, org.id, "https://bitbucket.org/acme/repo");

      const prs = await listBbPrs(db, repoId);
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

describe("org_settings bitbucket auth", () => {
  test("set and get app password", async () => {
    const db = await freshDb("token-app");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      expect(await getBitbucketAppPassword(db, org.id)).toBeNull();

      await setBitbucketAppPassword(db, org.id, "bbp_test123");
      expect(await getBitbucketAppPassword(db, org.id)).toBe("bbp_test123");

      await setBitbucketAppPassword(db, org.id, "bbp_updated");
      expect(await getBitbucketAppPassword(db, org.id)).toBe("bbp_updated");
    } finally {
      await db.close();
    }
  });

  test("set and get oauth token", async () => {
    const db = await freshDb("token-oauth");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      expect(await getBitbucketOauthToken(db, org.id)).toBeNull();

      await setBitbucketOauthToken(db, org.id, "oauth_test");
      expect(await getBitbucketOauthToken(db, org.id)).toBe("oauth_test");
    } finally {
      await db.close();
    }
  });

  test("getBitbucketAuth prefers oauth over app_password", async () => {
    const db = await freshDb("token-pref");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      expect(await getBitbucketAuth(db, org.id)).toBeNull();

      await setBitbucketAppPassword(db, org.id, "pw123");
      const auth1 = await getBitbucketAuth(db, org.id);
      expect(auth1).toEqual({ kind: "app_password", password: "pw123" });

      await setBitbucketOauthToken(db, org.id, "oauth_tok");
      const auth2 = await getBitbucketAuth(db, org.id);
      expect(auth2).toEqual({ kind: "oauth", token: "oauth_tok" });
    } finally {
      await db.close();
    }
  });
});

// ── Cron enqueue ──

describe("enqueueBitbucketSyncForAllRepos", () => {
  test("enqueues only bitbucket-remote repos when flag ON", async () => {
    process.env.FULCRUM_FEATURES = "connector-bitbucket";
    const db = await freshDb("cron");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await insertRepo(db, org.id, "bb-repo", "https://bitbucket.org/acme/repo");
      await insertRepo(db, org.id, "gh-repo", "https://github.com/foo/bar");
      await insertRepo(db, org.id, "local", "/tmp/local");

      const enqueued: Array<{ orgId: string; repoId: string; remoteUrl: string }> = [];
      const count = await enqueueBitbucketSyncForAllRepos(db, async (orgId, repoId, remoteUrl) => {
        enqueued.push({ orgId, repoId, remoteUrl });
      });

      expect(count).toBe(1);
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]!.remoteUrl).toContain("bitbucket.org");
    } finally {
      await db.close();
    }
  });

  test("returns 0 when flag OFF", async () => {
    const db = await freshDb("cron-off");
    try {
      const count = await enqueueBitbucketSyncForAllRepos(db, async () => {});
      expect(count).toBe(0);
    } finally {
      await db.close();
    }
  });
});

// ── Migration tables ──

describe("migration 0005 tables", () => {
  test("creates bb_prs and bb_issues tables", async () => {
    const db = await freshDb("tables");
    try {
      const tables = ["bb_prs", "bb_issues"];
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

  test("org_settings has bitbucket columns", async () => {
    const db = await freshDb("columns");
    try {
      const rows = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'org_settings'`,
      );
      const cols = new Set(rows.map((r) => r.column_name));
      expect(cols.has("bitbucket_app_password")).toBe(true);
      expect(cols.has("bitbucket_oauth_token")).toBe(true);
    } finally {
      await db.close();
    }
  });
});
