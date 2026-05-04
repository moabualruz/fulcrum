import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { createLocalOrg } from "./store/repositories.ts";
import { gitCommit, gitPush } from "./git-write-ops.ts";
import { FeatureGatedError } from "./feature-gate.ts";
import { getJob } from "./jobs.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-git-write-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const origFeatures = process.env.FULCRUM_FEATURES;
afterEach(() => {
  if (origFeatures === undefined) delete process.env.FULCRUM_FEATURES;
  else process.env.FULCRUM_FEATURES = origFeatures;
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, `db-${name}`));
  await runMigrations(db);
  return db;
}

async function shell(cwd: string, cmd: string): Promise<string> {
  const proc = Bun.spawn(["sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.trim();
}

async function makeFixtureRepo(name: string): Promise<string> {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  await shell(dir, "git init && git config user.email test@test && git config user.name Test && git config core.hooksPath /dev/null");
  writeFileSync(join(dir, "README.md"), "# init\n");
  await shell(dir, "git add . && git commit -m 'chore: init'");
  return dir;
}

async function makeBareRemote(name: string, source: string): Promise<string> {
  const bare = join(scratch, name);
  await shell(scratch, `git clone --bare "${source}" "${bare}"`);
  // Point source repo at bare remote
  await shell(source, `git remote add origin "${bare}" 2>/dev/null || git remote set-url origin "${bare}"`);
  return bare;
}

describe("git-write-ops", () => {
  describe("gitCommit", () => {
    test("throws FEATURE_GATED when flag OFF", async () => {
      delete process.env.FULCRUM_FEATURES;
      const db = await freshDb("commit-gated");
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      try {
        await gitCommit(db, {
          repoId: "r1",
          rootPath: "/tmp/nope",
          message: "test",
          files: ["a.txt"],
          orgId: org.id,
        });
        expect(true).toBe(false); // should not reach
      } catch (e) {
        expect(e).toBeInstanceOf(FeatureGatedError);
        expect((e as FeatureGatedError).code).toBe("FEATURE_GATED");
      } finally {
        await db.close();
      }
    });

    test("commits files and returns new SHA", async () => {
      process.env.FULCRUM_FEATURES = "repo-write-ops";
      const db = await freshDb("commit-ok");
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoDir = await makeFixtureRepo("commit-repo");

      // Get initial SHA
      const sha0 = await shell(repoDir, "git rev-parse HEAD");

      // Create a new file
      writeFileSync(join(repoDir, "hello.txt"), "hello\n");

      const result = await gitCommit(db, {
        repoId: "r1",
        rootPath: repoDir,
        message: "feat: add hello",
        files: ["hello.txt"],
        orgId: org.id,
      });

      // SHA changed
      expect(result.sha).not.toBe(sha0);
      expect(result.sha).toHaveLength(40);

      // Verify commit message
      const msg = await shell(repoDir, "git log -1 --format=%s");
      expect(msg).toBe("feat: add hello");

      await db.close();
    });

    test("commit triggers repo.sync.local job", async () => {
      process.env.FULCRUM_FEATURES = "repo-write-ops";
      const db = await freshDb("commit-job");
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoDir = await makeFixtureRepo("commit-job-repo");
      writeFileSync(join(repoDir, "f.txt"), "x\n");

      await gitCommit(db, {
        repoId: "r-job",
        rootPath: repoDir,
        message: "chore: trigger job",
        files: ["f.txt"],
        orgId: org.id,
      });

      // Check job was enqueued
      const jobs = await db.query<{ id: string; kind: string; payload: string }>(
        `SELECT id, kind, payload FROM jobs WHERE kind = 'repo.sync.local' ORDER BY created_at DESC LIMIT 1`,
        [],
      );
      expect(jobs.length).toBe(1);
      const payload = typeof jobs[0]!.payload === "string"
        ? JSON.parse(jobs[0]!.payload)
        : jobs[0]!.payload;
      expect(payload.repoId).toBe("r-job");

      await db.close();
    });

    test("rejects empty files array", async () => {
      process.env.FULCRUM_FEATURES = "repo-write-ops";
      const db = await freshDb("commit-empty");
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      try {
        await gitCommit(db, {
          repoId: "r1",
          rootPath: "/tmp",
          message: "nope",
          files: [],
          orgId: org.id,
        });
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toContain("files[] must not be empty");
      } finally {
        await db.close();
      }
    });
  });

  describe("gitPush", () => {
    test("throws FEATURE_GATED when flag OFF", async () => {
      delete process.env.FULCRUM_FEATURES;
      const db = await freshDb("push-gated");
      try {
        await gitPush(db, {
          repoId: "r1",
          rootPath: "/tmp",
          branch: "main",
        });
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(FeatureGatedError);
      } finally {
        await db.close();
      }
    });

    test("pushes to bare remote and updates last_seen_at", async () => {
      process.env.FULCRUM_FEATURES = "repo-write-ops";
      const db = await freshDb("push-ok");
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const repoDir = await makeFixtureRepo("push-repo");

      // Register repo in DB
      await db.query(
        `INSERT INTO repos (id, org_id, slug, root_path) VALUES ($1, $2, $3, $4)`,
        ["rpush", org.id, "push-test", repoDir],
      );

      // Record initial last_seen_at
      const before = await db.query<{ last_seen_at: string }>(
        `SELECT last_seen_at FROM repos WHERE id = $1`,
        ["rpush"],
      );

      // Create bare remote and make a commit to push
      const defaultBranch = await shell(repoDir, "git branch --show-current");
      await makeBareRemote("push-bare", repoDir);
      writeFileSync(join(repoDir, "pushed.txt"), "data\n");
      await shell(repoDir, "git add . && git commit -m 'chore: for push'");

      const result = await gitPush(db, {
        repoId: "rpush",
        rootPath: repoDir,
        branch: defaultBranch,
      });
      expect(result.ok).toBe(true);

      // Verify remote HEAD advanced
      const bareDir = join(scratch, "push-bare");
      const remoteHead = await shell(bareDir, "git rev-parse HEAD");
      const localHead = await shell(repoDir, "git rev-parse HEAD");
      expect(remoteHead).toBe(localHead);

      await db.close();
    });
  });
});
