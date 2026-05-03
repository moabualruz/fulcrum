import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPglite } from "../db/pglite.ts";
import { runMigrations } from "../db/migrate.ts";
import { createLocalOrg } from "./repositories.ts";
import {
  registerRepo,
  listRepos,
  getRepo,
  updateSyncStatus,
  updateMirrorSize,
  getReposDoctorStats,
  type RepoRow,
} from "./repos.ts";
import type { ProductDb } from "../db/types.ts";

let db: ProductDb;
let TMP: string;
let orgId: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "repos-store-test-"));
  db = await openPglite(join(TMP, "db"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "test-org", name: "Test Org" });
  orgId = org.id;
});

afterAll(async () => {
  await db.close();
  await rm(TMP, { recursive: true, force: true });
});

describe("registerRepo", () => {
  test("inserts a repo and returns it", async () => {
    const repo = await registerRepo(db, {
      orgId,
      slug: "my-repo",
      rootPath: "/tmp/my-repo",
      defaultBranch: "main",
    });
    expect(repo.id).toBeTruthy();
    expect(repo.org_id).toBe(orgId);
    expect(repo.slug).toBe("my-repo");
    expect(repo.root_path).toBe("/tmp/my-repo");
    expect(repo.default_branch).toBe("main");
    expect(repo.sync_status).toBe("idle");
    expect(repo.sync_error).toBeNull();
    expect(repo.mirror_size_bytes).toBe(0);
  });

  test("registers repo with remote URL", async () => {
    const repo = await registerRepo(db, {
      orgId,
      slug: "remote-repo",
      rootPath: "/tmp/remote-repo",
      remoteUrl: "https://github.com/example/repo.git",
    });
    expect(repo.remote_url).toBe("https://github.com/example/repo.git");
  });
});

describe("listRepos", () => {
  test("returns repos for org ordered by registered_at", async () => {
    const repos = await listRepos(db, orgId);
    expect(repos.length).toBeGreaterThanOrEqual(2);
    expect(repos.map((r) => r.slug)).toContain("my-repo");
    expect(repos.map((r) => r.slug)).toContain("remote-repo");
  });
});

describe("getRepo", () => {
  test("returns repo by id", async () => {
    const repos = await listRepos(db, orgId);
    const repo = await getRepo(db, repos[0]!.id);
    expect(repo).not.toBeNull();
    expect(repo!.slug).toBe(repos[0]!.slug);
  });

  test("returns null for unknown id", async () => {
    const repo = await getRepo(db, "NONEXISTENT00000000000000");
    expect(repo).toBeNull();
  });
});

describe("updateSyncStatus", () => {
  test("sets sync_status to error with message", async () => {
    const repos = await listRepos(db, orgId);
    const id = repos[0]!.id;
    await updateSyncStatus(db, id, "error", "connection refused");
    const repo = await getRepo(db, id);
    expect(repo!.sync_status).toBe("error");
    expect(repo!.sync_error).toBe("connection refused");
    expect(repo!.last_sync_at).toBeTruthy();
  });

  test("sets sync_status back to idle", async () => {
    const repos = await listRepos(db, orgId);
    const id = repos[0]!.id;
    await updateSyncStatus(db, id, "idle");
    const repo = await getRepo(db, id);
    expect(repo!.sync_status).toBe("idle");
    expect(repo!.sync_error).toBeNull();
  });
});

describe("updateMirrorSize", () => {
  test("sets mirror_size_bytes", async () => {
    const repos = await listRepos(db, orgId);
    const id = repos[0]!.id;
    await updateMirrorSize(db, id, 1_073_741_824); // 1 GB
    const repo = await getRepo(db, id);
    expect(repo!.mirror_size_bytes).toBe(1_073_741_824);
  });
});

describe("getReposDoctorStats", () => {
  test("returns aggregate stats", async () => {
    // Set one repo to error state, one with mirror size
    const repos = await listRepos(db, orgId);
    await updateSyncStatus(db, repos[0]!.id, "error", "git fetch failed");
    await updateMirrorSize(db, repos[0]!.id, 5_000_000_000); // 5 GB
    await updateMirrorSize(db, repos[1]!.id, 6_000_000_000); // 6 GB

    const stats = await getReposDoctorStats(db);
    expect(stats.totalRepos).toBeGreaterThanOrEqual(2);
    expect(stats.syncErrors).toBeGreaterThanOrEqual(1);
    expect(stats.mirrorDiskBytes).toBeGreaterThanOrEqual(11_000_000_000);
  });
});
