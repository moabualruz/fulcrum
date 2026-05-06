// Tests for `fulcrum backup` interactive flow.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TestStore } from "../../test-support/product-fixtures.ts";

async function freshDb(): Promise<{ db: TestStore; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-backup-"));
  const { openIsolatedStore } = await import("../../test-support/product-fixtures.ts");
  const db = await openIsolatedStore(join(dir, "db"));
  const { migrateIsolatedStore } = await import("../../test-support/product-fixtures.ts");
  await migrateIsolatedStore(db);
  return { db, dir };
}

describe("backup — PGlite dump + artifacts manifest tarball", () => {
  let db: TestStore;
  let dir: string;

  beforeEach(async () => {
    ({ db, dir } = await freshDb());
  });

  afterEach(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("backup creates tarball at --output path", async () => {
    // Seed data.
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

    const s = await stat(outPath);
    expect(s.isFile()).toBe(true);
    expect(s.size).toBeGreaterThan(0);
  });

  test("backup --non-interactive exits 7 when output not provided", async () => {
    const { runInteractiveBackup } = await import("./backup.ts");
    try {
      await runInteractiveBackup(db, {
        nonInteractive: true,
        dbDir: join(dir, "db"),
        artifactsDir: join(dir, "artifacts"),
      });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      const err = e as { code?: number };
      expect(err.code).toBe(7);
    }
  });

  test("backup --non-interactive succeeds when --output provided", async () => {
    const { seedOrgAndAdmin } = await import("./init.ts");
    await seedOrgAndAdmin(db);

    const outPath = join(dir, "backup2.tar.gz");
    const artifactsDir = join(dir, "artifacts");
    await mkdir(artifactsDir, { recursive: true });

    const { runInteractiveBackup } = await import("./backup.ts");
    await runInteractiveBackup(db, {
      nonInteractive: true,
      output: outPath,
      dbDir: join(dir, "db"),
      artifactsDir,
    });

    const s = await stat(outPath);
    expect(s.isFile()).toBe(true);
  });
});
