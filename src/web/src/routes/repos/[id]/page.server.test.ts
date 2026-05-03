import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../../product-kernel/ids.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repo-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedRepoDetail() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  await ensureRepoColumns(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const repoId = newUlid();
  await db.query(
    `INSERT INTO repos (id, org_id, project_id, slug, root_path, default_branch, remote_url, name, kind, local_path, current_branch, last_sync_at, sync_status, last_touched_at)
     VALUES ($1, $2, $3, 'fulcrum', '/workspace/fulcrum', 'main', null, 'Fulcrum', 'local', '/workspace/fulcrum', 'feature/repos', $4, 'error', $4)`,
    [repoId, org.id, project.id, "2026-05-03T10:00:00.000Z"],
  );
  for (let index = 0; index < 6; index += 1) {
    await db.query(
      `INSERT INTO repo_commits (id, org_id, repo_id, sha, message, author, committed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        org.id,
        repoId,
        `abcdef${index}`,
        `feat: commit ${index}\n\nBody`,
        `Author ${index}`,
        `2026-05-03T0${index}:00:00.000Z`,
      ],
    );
  }
  await db.query(
    `INSERT INTO tasks (id, org_id, repo_id, title, status) VALUES ($1, $2, $3, 'Open repo task', 'todo')`,
    [randomUUID(), org.id, repoId],
  );
  await db.query(
    `INSERT INTO agent_runs (id, org_id, task_id, agent, agent_name, status, started_at) VALUES ($1, $2, $3, 'codex', 'codex', 'succeeded', $4)`,
    [randomUUID(), org.id, null, "2026-05-03T09:00:00.000Z"],
  );
  await db.close();
  return repoId;
}

async function ensureRepoColumns(db: Awaited<ReturnType<typeof openPglite>>): Promise<void> {
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS name varchar(255) not null default ''`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS kind varchar(10) not null default 'local'`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS local_path text null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS current_branch varchar(255) null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_sync_at timestamptz null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS sync_status varchar(10) not null default 'idle'`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS last_touched_at timestamptz null`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS archived boolean not null default false`);
  await db.query(`CREATE TABLE IF NOT EXISTS repo_commits (id uuid not null default gen_random_uuid(), org_id uuid not null, repo_id uuid not null, sha varchar(255) not null, message text null, author varchar(255) null, committed_at timestamptz null, primary key (id))`);
  await db.query(`ALTER TABLE repo_commits ALTER COLUMN org_id TYPE text USING org_id::text`);
  await db.query(`ALTER TABLE repo_commits ALTER COLUMN repo_id TYPE text USING repo_id::text`);
  await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repo_id text null`);
  await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title text null`);
  await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status text null`);
  await db.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check`);
  await db.query(`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS task_id text null`);
  await db.query(`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS agent_name text null`);
  await db.query(`ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS status text null`);
}

describe("/repos/[id] +page.server.ts load()", () => {
  test("returns repo detail, latest five commits, open task count, and run count", async () => {
    const repoId = await seedRepoDetail();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL(`http://localhost/repos/${repoId}`),
      params: { id: repoId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{
      repo: { id: string; currentBranch: string | null; syncStatus: string };
      commits: Array<{ sha: string; subject: string; author: string | null }>;
      openTaskCount: number;
      recentRunCount: number;
    }>(result);
    expect(payload.repo).toMatchObject({ id: repoId, currentBranch: "feature/repos", syncStatus: "error" });
    expect(payload.commits).toHaveLength(5);
    expect(payload.commits[0]?.subject).toBe("feat: commit 5");
    expect(payload.openTaskCount).toBe(1);
    expect(payload.recentRunCount).toBe(1);
  });

  test("sync action marks repo syncing", async () => {
    const repoId = await seedRepoDetail();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.sync({
      params: { id: repoId },
      request: new Request(`http://localhost/repos/${repoId}`, { method: "POST" }),
    } as Parameters<typeof mod.actions.sync>[0]);
    expect(result).toEqual({ ok: true });
    const loadResult = await mod.load({
      url: new URL(`http://localhost/repos/${repoId}`),
      params: { id: repoId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repo: { syncStatus: string } }>(loadResult);
    expect(payload.repo.syncStatus).toBe("syncing");
  });
});
