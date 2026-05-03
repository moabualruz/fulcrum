import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repos-list-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedRepos() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  await ensureRepoColumns(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const localId = newUlid();
  const remoteId = newUlid();
  await db.query(
    `INSERT INTO repos (id, org_id, project_id, slug, root_path, default_branch, remote_url, name, kind, local_path, current_branch, last_sync_at, sync_status, last_touched_at)
     VALUES
       ($1, $2, $3, 'fulcrum', '/workspace/fulcrum', 'main', null, 'Fulcrum', 'local', '/workspace/fulcrum', 'main', $4, 'idle', $4),
       ($5, $2, $3, 'remote-ui', '', 'main', 'https://example.test/ui.git', 'Remote UI', 'remote', null, 'main', $6, 'error', $6)`,
    [
      localId,
      org.id,
      project.id,
      "2026-05-03T10:00:00.000Z",
      remoteId,
      "2026-05-02T10:00:00.000Z",
    ],
  );
  await db.close();
  return { localId, remoteId, projectId: project.id };
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
}

describe("/repos +page.server.ts load()", () => {
  test("returns repo list with dashboard summary fields", async () => {
    const { localId, remoteId } = await seedRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL("http://localhost/repos"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repos: Array<{ id: string; name: string; kind: string; syncStatus: string; lastSyncAt: string | null }> }>(result);
    expect(payload.repos.map((repo) => repo.id)).toEqual([localId, remoteId]);
    expect(payload.repos[0]).toMatchObject({
      name: "Fulcrum",
      kind: "local",
      syncStatus: "idle",
      lastSyncAt: "2026-05-03T10:00:00.000Z",
    });
  });

  test("add action registers a remote repo without full page navigation state", async () => {
    await seedRepos();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const request = new Request("http://localhost/repos", {
      method: "POST",
      body: new URLSearchParams({
        kind: "remote",
        url: "https://example.test/new.git",
        name: "New Repo",
        projectId: "",
      }),
    });
    const result = await mod.actions.add({ request } as Parameters<typeof mod.actions.add>[0]);
    expect(result).toEqual({ ok: true });

    const loadResult = await mod.load({
      url: new URL("http://localhost/repos"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repos: Array<{ name: string; kind: string; remoteUrl: string | null }> }>(loadResult);
    expect(payload.repos).toContainEqual(expect.objectContaining({
      name: "New Repo",
      kind: "remote",
      remoteUrl: "https://example.test/new.git",
    }));
  });
});
