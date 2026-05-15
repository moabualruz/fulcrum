import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repo-branches-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedBranches(writeOps = false): Promise<string> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS name text not null default ''`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS kind text not null default 'local'`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS current_branch text null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS default_branch text null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_touched_at timestamptz null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS archived boolean not null default false`);
  await db.query(`CREATE TABLE IF NOT EXISTS repo_branches (id uuid primary key, org_id text not null, repo_id text not null, name text not null, sha text null, is_default boolean not null default false)`);
  await db.query(`CREATE TABLE IF NOT EXISTS feature_flags (id uuid primary key, org_id text null, user_id text null, flag text not null, enabled boolean not null default false)`);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, name, kind, current_branch, default_branch, archived)
     VALUES ($1, $2, 'fulcrum', '/workspace/fulcrum', 'Fulcrum', 'local', 'feature/repos', 'main', false)`,
    [repoId, org.id],
  );
  await db.query(
    `INSERT INTO repo_branches (id, org_id, repo_id, name, sha, is_default)
     VALUES ($1, $2, $3, 'main', '1234567890abcdef', true),
            ($4, $2, $3, 'feature/repos', 'abcdef1234567890', false)`,
    [randomUUID(), org.id, repoId, randomUUID()],
  );
  if (writeOps) {
    await db.query(
      `INSERT INTO feature_flags (id, org_id, user_id, flag, enabled) VALUES ($1, $2, null, 'repo-write-ops', true)`,
      [randomUUID(), org.id],
    );
  }
  await db.close();
  return repoId;
}

describe("/repos/[id]/branches +page.server.ts", () => {
  test("load lists branches and reports write gate disabled by default", async () => {
    const repoId = await seedBranches(false);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const payload = await streamedData<{
      repo: { id: string; currentBranch: string | null };
      writeOpsEnabled: boolean;
      branches: Array<{ name: string; headSha: string | null; isCurrent: boolean; isDefault: boolean }>;
    }>(await mod.load({ params: { id: repoId }, locals: {} } as Parameters<typeof mod.load>[0]));
    expect(payload.writeOpsEnabled).toBe(false);
    expect(payload.repo.currentBranch).toBe("feature/repos");
    expect(payload.branches).toEqual([
      { name: "feature/repos", headSha: "abcdef1234567890", isCurrent: true, isDefault: false },
      { name: "main", headSha: "1234567890abcdef", isCurrent: false, isDefault: true },
    ]);
  });

  test("new branch action is feature gated", async () => {
    const repoId = await seedBranches(false);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "new/topic");
    const result = await mod.actions.create({
      params: { id: repoId },
      request: new Request(`http://localhost/repos/${repoId}/branches`, { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);
    expect(result.status).toBe(403);
    expect(result.data.code).toBe("FEATURE_GATED");
  });

  test("checkout action updates current branch when write ops enabled", async () => {
    const repoId = await seedBranches(true);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("name", "main");
    expect(await mod.actions.checkout({
      params: { id: repoId },
      request: new Request(`http://localhost/repos/${repoId}/branches`, { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.checkout>[0])).toEqual({ ok: true });
    const payload = await streamedData<{ repo: { currentBranch: string | null } }>(
      await mod.load({ params: { id: repoId }, locals: {} } as Parameters<typeof mod.load>[0]),
    );
    expect(payload.repo.currentBranch).toBe("main");
  });
});
