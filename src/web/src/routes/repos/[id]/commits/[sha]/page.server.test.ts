import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../../../../test-support/product-fixtures.ts";
import { makeId } from "../../../../../../../test-support/product-fixtures.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repo-commit-diff-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedCommitDiff(): Promise<{ repoId: string; sha: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS name text not null default ''`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS kind text not null default 'local'`);
  await db.query(`ALTER TABLE repos ADD COLUMN IF NOT EXISTS archived boolean not null default false`);
  await db.query(`CREATE TABLE IF NOT EXISTS repo_commits (id uuid primary key, org_id text not null, repo_id text not null, sha text not null, message text null, author text null, committed_at timestamptz null, diff text null)`);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = makeId();
  const sha = "abcdef1234567890abcdef1234567890abcdef12";
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, name, kind, archived) VALUES ($1, $2, 'fulcrum', '/workspace/fulcrum', 'Fulcrum', 'local', false)`,
    [repoId, org.id],
  );
  await db.query(
    `INSERT INTO repo_commits (id, org_id, repo_id, sha, message, author, committed_at, diff)
     VALUES ($1, $2, $3, $4, 'feat: diff view', 'M <m@example.test>', $5, $6)`,
    [
      randomUUID(),
      org.id,
      repoId,
      sha,
      "2026-05-03T10:00:00.000Z",
      "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line\n",
    ],
  );
  await db.close();
  return { repoId, sha };
}

describe("/repos/[id]/commits/[sha] +page.server.ts", () => {
  test("load returns commit diff, rendered diff html, and stat summary", async () => {
    const { repoId, sha } = await seedCommitDiff();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const payload = await streamedData<{
      commit: { sha: string; subject: string };
      diff: { raw: string; html: string; filesChanged: number; insertions: number; deletions: number };
    }>(await mod.load({
      params: { id: repoId, sha },
      url: new URL(`http://localhost/repos/${repoId}/commits/${sha}?view=split`),
      locals: {},
    } as Parameters<typeof mod.load>[0]));
    expect(payload.commit.subject).toBe("feat: diff view");
    expect(payload.diff.filesChanged).toBe(1);
    expect(payload.diff.insertions).toBe(2);
    expect(payload.diff.deletions).toBe(1);
    expect(payload.diff.html).toContain("data-diff2html");
    expect(payload.diff.html).toContain("src/a.ts");
    expect(payload.diff.html).toContain("data-shiki-line");
  });
});
