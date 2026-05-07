// Tests for `fulcrum restore` interactive flow.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TestStore } from "@/test-support/product-fixtures.ts";

async function freshDb(): Promise<{ db: TestStore; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-restore-"));
  const { openIsolatedStore } = await import("@/test-support/product-fixtures.ts");
  const db = await openIsolatedStore(join(dir, "db"));
  const { migrateIsolatedStore } = await import("@/test-support/product-fixtures.ts");
  await migrateIsolatedStore(db);
  return { db, dir };
}

describe("restore — round-trip backup → restore", () => {
  let db: TestStore;
  let dir: string;

  beforeEach(async () => {
    ({ db, dir } = await freshDb());
  });

  afterEach(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("restore from backup restores org + user rows", async () => {
    // Seed, backup, wipe, restore.
    const { seedOrgAndAdmin } = await import("./init.ts");
    await seedOrgAndAdmin(db);

    const outPath = join(dir, "backup.tar.gz");
    const artifactsDir = join(dir, "artifacts");
    await mkdir(artifactsDir, { recursive: true });

    const { createBackup } = await import("./backup.ts");
    await createBackup(db, {
      output: outPath,
      dbDir: join(dir, "db"),
      artifactsDir,
    });

    // Wipe data.
    await db.exec("DELETE FROM users");
    await db.exec("DELETE FROM orgs");
    const orgsBefore = await db.query("SELECT id FROM orgs");
    expect(orgsBefore.length).toBe(0);

    // Restore.
    const { restoreBackup } = await import("./restore.ts");
    await restoreBackup(db, { input: outPath, dbDir: join(dir, "db"), artifactsDir });

    const orgs = await db.query<{ slug: string }>("SELECT slug FROM orgs");
    expect(orgs.length).toBe(1);
    expect(orgs[0]!.slug).toBe("default");

    const users = await db.query<{ handle: string }>("SELECT handle FROM users");
    expect(users.length).toBe(1);
    expect(users[0]!.handle).toBe("admin@local");
  });

  test("restore --non-interactive exits 7 (confirmation prompt needed)", async () => {
    const { seedOrgAndAdmin } = await import("./init.ts");
    await seedOrgAndAdmin(db);

    const outPath = join(dir, "backup.tar.gz");
    const artifactsDir = join(dir, "artifacts");
    await mkdir(artifactsDir, { recursive: true });

    const { createBackup } = await import("./backup.ts");
    await createBackup(db, {
      output: outPath,
      dbDir: join(dir, "db"),
      artifactsDir,
    });

    const { runInteractiveRestore } = await import("./restore.ts");
    try {
      await runInteractiveRestore(db, {
        nonInteractive: true,
        input: outPath,
        dbDir: join(dir, "db"),
        artifactsDir,
      });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      const err = e as { code?: number };
      expect(err.code).toBe(7);
    }
  });
});
