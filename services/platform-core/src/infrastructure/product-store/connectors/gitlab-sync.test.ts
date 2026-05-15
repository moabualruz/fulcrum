import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { _resetFeatureCache } from "../features.ts";
import {
  listGitlabMrs,
  listGitlabIssues,
  setGitlabPat,
  setGitlabOauthToken,
  getGitlabToken,
} from "../store/gitlab.ts";
import { listRepoBranches } from "../store/github.ts";
import {
  parseGitlabRemote,
  syncGitlabRepo,
  enqueueGitlabSyncForAllRepos,
  addGitlabHost,
  removeGitlabHost,
  type GitlabClient,
  type GitlabMrData,
  type GitlabIssueData,
} from "./gitlab-sync.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-gl-sync-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  _resetFeatureCache();
  delete process.env.FULCRUM_FEATURES;
  removeGitlabHost("gitlab.example.com");
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

function mockClient(mrs: GitlabMrData[], issues: GitlabIssueData[]): GitlabClient {
  return {
    async listOpenMrs() {
      return mrs;
    },
    async listOpenIssues() {
      return issues;
    },
  };
}

// ── parseGitlabRemote ──

describe("parseGitlabRemote", () => {
  test("parses HTTPS URL", () => {
    expect(parseGitlabRemote("https://gitlab.com/group/project.git")).toEqual({
      host: "gitlab.com",
      projectPath: "group/project",
    });
  });

  test("parses SSH URL", () => {
    expect(parseGitlabRemote("git@gitlab.com:group/project.git")).toEqual({
      host: "gitlab.com",
      projectPath: "group/project",
    });
  });

  test("parses nested subgroups", () => {
    expect(parseGitlabRemote("https://gitlab.com/group/sub/project.git")).toEqual({
      host: "gitlab.com",
      projectPath: "group/sub/project",
    });
  });

  test("returns null for non-gitlab URL", () => {
    expect(parseGitlabRemote("https://github.com/foo/bar")).toBeNull();
  });

  test("supports self-hosted GitLab host", () => {
    addGitlabHost("gitlab.example.com");
    expect(parseGitlabRemote("https://gitlab.example.com/team/repo.git")).toEqual({
      host: "gitlab.example.com",
      projectPath: "team/repo",
    });
  });
});

// ── Feature gate ──

describe("syncGitlabRepo feature gate", () => {
  test("skips when connector-gitlab flag OFF", async () => {
    const db = await freshDb("gate-off");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://gitlab.com/foo/bar");
      const result = await syncGitlabRepo(
        db,
        mockClient([], []),
        repoId,
        org.id,
        "https://gitlab.com/foo/bar",
      );
      expect(result.skipped).toBe(true);
      expect(result.mrsUpserted).toBe(0);
    } finally {
      await db.close();
    }
  });
});

// ── Sync with mock client ──

describe("syncGitlabRepo with mock client", () => {
  test("upserts MRs, issues, and branches", async () => {
    process.env.FULCRUM_FEATURES = "connector-gitlab";
    const db = await freshDb("sync-mock");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://gitlab.com/foo/bar");

      const client = mockClient(
        [
          {
            iid: 1,
            title: "Add feature",
            state: "opened",
            author: { username: "alice" },
            sha: "abc123",
            source_branch: "feature-branch",
            target_branch: "main",
            labels: ["enhancement"],
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
            merged_at: null,
          },
        ],
        [
          {
            iid: 10,
            title: "Bug report",
            state: "opened",
            author: { username: "bob" },
            labels: ["bug"],
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
            closed_at: null,
          },
        ],
      );

      const result = await syncGitlabRepo(
        db,
        client,
        repoId,
        org.id,
        "https://gitlab.com/foo/bar",
      );

      expect(result.skipped).toBe(false);
      expect(result.mrsUpserted).toBe(1);
      expect(result.issuesUpserted).toBe(1);
      expect(result.branchesUpserted).toBe(1);

      // Verify DB state
      const mrs = await listGitlabMrs(db, repoId);
      expect(mrs).toHaveLength(1);
      expect(mrs[0]!.title).toBe("Add feature");
      expect(mrs[0]!.author).toBe("alice");
      expect(mrs[0]!.mr_iid).toBe(1);

      const issues = await listGitlabIssues(db, repoId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.title).toBe("Bug report");
      expect(issues[0]!.issue_iid).toBe(10);

      const branches = await listRepoBranches(db, repoId);
      expect(branches.some((b) => b.name === "feature-branch" && b.is_pr_branch)).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("upsert is idempotent — re-sync updates existing rows", async () => {
    process.env.FULCRUM_FEATURES = "connector-gitlab";
    const db = await freshDb("sync-idem");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://gitlab.com/foo/bar");

      const mrData: GitlabMrData = {
        iid: 1,
        title: "V1",
        state: "opened",
        sha: "aaa",
        source_branch: "feat",
        target_branch: "main",
      };
      const client1 = mockClient([mrData], []);
      await syncGitlabRepo(db, client1, repoId, org.id, "https://gitlab.com/foo/bar");

      // Second sync with updated title
      mrData.title = "V2";
      mrData.sha = "bbb";
      const client2 = mockClient([mrData], []);
      await syncGitlabRepo(db, client2, repoId, org.id, "https://gitlab.com/foo/bar");

      const mrs = await listGitlabMrs(db, repoId);
      expect(mrs).toHaveLength(1);
      expect(mrs[0]!.title).toBe("V2");

      const branches = await listRepoBranches(db, repoId);
      const featBranch = branches.find((b) => b.name === "feat");
      expect(featBranch?.sha).toBe("bbb");
    } finally {
      await db.close();
    }
  });
});

// ── org_settings token storage ──

describe("org_settings gitlab token", () => {
  test("set and get PAT", async () => {
    const db = await freshDb("token-pat");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      expect(await getGitlabToken(db, org.id)).toBeNull();

      await setGitlabPat(db, org.id, "glpat-test123");
      expect(await getGitlabToken(db, org.id)).toBe("glpat-test123");
    } finally {
      await db.close();
    }
  });

  test("set and get OAuth token", async () => {
    const db = await freshDb("token-oauth");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await setGitlabOauthToken(db, org.id, "oauth-test456");
      expect(await getGitlabToken(db, org.id)).toBe("oauth-test456");
    } finally {
      await db.close();
    }
  });

  test("PAT takes precedence over OAuth token", async () => {
    const db = await freshDb("token-pref");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await setGitlabPat(db, org.id, "glpat-preferred");
      await setGitlabOauthToken(db, org.id, "oauth-fallback");
      expect(await getGitlabToken(db, org.id)).toBe("glpat-preferred");
    } finally {
      await db.close();
    }
  });
});

// ── Cron enqueue ──

describe("enqueueGitlabSyncForAllRepos", () => {
  test("enqueues only gitlab-remote repos when flag ON", async () => {
    process.env.FULCRUM_FEATURES = "connector-gitlab";
    const db = await freshDb("cron");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await insertRepo(db, org.id, "gl-repo", "https://gitlab.com/foo/bar");
      await insertRepo(db, org.id, "gh-repo", "https://github.com/foo/bar");
      await insertRepo(db, org.id, "local", "/tmp/local");

      const enqueued: Array<{ orgId: string; repoId: string; remoteUrl: string }> = [];
      const count = await enqueueGitlabSyncForAllRepos(db, async (orgId, repoId, remoteUrl) => {
        enqueued.push({ orgId, repoId, remoteUrl });
      });

      expect(count).toBe(1);
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]!.remoteUrl).toContain("gitlab.com");
    } finally {
      await db.close();
    }
  });

  test("includes self-hosted GitLab repos", async () => {
    process.env.FULCRUM_FEATURES = "connector-gitlab";
    addGitlabHost("gitlab.example.com");
    const db = await freshDb("cron-self");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await insertRepo(db, org.id, "gl1", "https://gitlab.com/foo/bar");
      await insertRepo(db, org.id, "gl2", "https://gitlab.example.com/team/repo");

      const enqueued: string[] = [];
      const count = await enqueueGitlabSyncForAllRepos(db, async (_o, _r, url) => {
        enqueued.push(url);
      });

      expect(count).toBe(2);
      expect(enqueued).toHaveLength(2);
    } finally {
      await db.close();
    }
  });

  test("returns 0 when flag OFF", async () => {
    const db = await freshDb("cron-off");
    try {
      const count = await enqueueGitlabSyncForAllRepos(db, async () => {});
      expect(count).toBe(0);
    } finally {
      await db.close();
    }
  });
});

// ── Migration tables ──

describe("migration 0005 tables", () => {
  test("creates gitlab_mrs, gitlab_issues and adds org_settings columns", async () => {
    const db = await freshDb("tables");
    try {
      const tables = ["gitlab_mrs", "gitlab_issues"];
      for (const t of tables) {
        const rows = await db.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
          [t],
        );
        expect(rows[0]?.count ?? 0).toBe(1);
      }

      // Verify org_settings has gitlab columns
      const cols = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'org_settings' AND column_name LIKE 'gitlab%'`,
      );
      const colNames = cols.map((c) => c.column_name).sort();
      expect(colNames).toEqual(["gitlab_oauth_token", "gitlab_pat"]);
    } finally {
      await db.close();
    }
  });
});

// ── Flag OFF: zero @gitbeaker calls ──

describe("flag OFF behavior", () => {
  test("no tables written when flag OFF", async () => {
    // Flag is OFF by default (no FULCRUM_FEATURES)
    const db = await freshDb("flag-off-no-writes");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoId = await insertRepo(db, org.id, "r", "https://gitlab.com/foo/bar");

      let clientCalled = false;
      const client: GitlabClient = {
        async listOpenMrs() { clientCalled = true; return []; },
        async listOpenIssues() { clientCalled = true; return []; },
      };

      const result = await syncGitlabRepo(db, client, repoId, org.id, "https://gitlab.com/foo/bar");
      expect(result.skipped).toBe(true);
      expect(clientCalled).toBe(false);

      const mrs = await listGitlabMrs(db, repoId);
      expect(mrs).toHaveLength(0);
      const issues = await listGitlabIssues(db, repoId);
      expect(issues).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
