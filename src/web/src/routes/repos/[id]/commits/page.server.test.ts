import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../../../product-kernel/ids.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repo-commits-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedCommits(): Promise<string> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS name text not null default ''`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS kind text not null default 'local'`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS archived boolean not null default false`);
  await db.query(`CREATE TABLE IF NOT EXISTS repo_commits (id uuid primary key, org_id text not null, repo_id text not null, sha text not null, message text null, author text null, committed_at timestamptz null, parents text[] null)`);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = newUlid();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, name, kind, archived) VALUES ($1, $2, 'fulcrum', '/workspace/fulcrum', 'Fulcrum', 'local', false)`,
    [repoId, org.id],
  );
  for (let index = 0; index < 25; index += 1) {
    await db.query(
      `INSERT INTO repo_commits (id, org_id, repo_id, sha, message, author, committed_at, parents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        org.id,
        repoId,
        `${String(index).padStart(2, "0")}abcdef1234567890`,
        `feat: commit ${index}\n\nBody`,
        `Author ${index} <a${index}@example.test>`,
        `2026-05-03T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
        index === 0 ? [] : [`${String(index - 1).padStart(2, "0")}parent`],
      ],
    );
  }
  await db.close();
  return repoId;
}

describe("/repos/[id]/commits +page.server.ts", () => {
  test("load returns page-sized commits and persists page param", async () => {
    const repoId = await seedCommits();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const payload = await streamedData<{
      page: number;
      pageSize: number;
      hasMore: boolean;
      commits: Array<{ sha: string; subject: string; authorName: string; avatarInitials: string; parents: string[] }>;
    }>(await mod.load({
      params: { id: repoId },
      url: new URL(`http://localhost/repos/${repoId}/commits?page=2`),
      locals: {},
    } as Parameters<typeof mod.load>[0]));
    expect(payload.page).toBe(2);
    expect(payload.pageSize).toBe(20);
    expect(payload.hasMore).toBe(false);
    expect(payload.commits).toHaveLength(5);
    expect(payload.commits[0]).toMatchObject({
      subject: "feat: commit 3",
      authorName: "Author 3",
      avatarInitials: "A3",
    });
    expect(payload.commits[0]?.parents).toEqual(["02parent"]);
  });
});
