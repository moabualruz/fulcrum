// Tests for `fulcrum init` interactive flow — org + admin@local user seeding.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TestStore } from "../../test-support/product-fixtures.ts";

async function freshDb(): Promise<{ db: TestStore; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-init-interactive-"));
  const { openIsolatedStore } = await import("../../test-support/product-fixtures.ts");
  const db = await openIsolatedStore(join(dir, "db"));
  const { migrateIsolatedStore } = await import("../../test-support/product-fixtures.ts");
  await migrateIsolatedStore(db);
  return { db, dir };
}

describe("interactive init — seed org + admin@local", () => {
  let db: TestStore;
  let dir: string;

  beforeEach(async () => {
    ({ db, dir } = await freshDb());
  });

  afterEach(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("creates org + admin@local user on first run", async () => {
    const { seedOrgAndAdmin } = await import("./init.ts");
    const result = await seedOrgAndAdmin(db);
    expect(result.created).toBe(true);

    const orgs = await db.query<{ slug: string }>("SELECT slug FROM orgs");
    expect(orgs.length).toBe(1);
    expect(orgs[0]!.slug).toBe("default");

    const users = await db.query<{ handle: string }>("SELECT handle FROM users");
    expect(users.length).toBe(1);
    expect(users[0]!.handle).toBe("admin@local");
  });

  test("idempotent — second run exits 0, single org + user row", async () => {
    const { seedOrgAndAdmin } = await import("./init.ts");
    const r1 = await seedOrgAndAdmin(db);
    expect(r1.created).toBe(true);

    const r2 = await seedOrgAndAdmin(db);
    expect(r2.created).toBe(false);

    const orgs = await db.query("SELECT id FROM orgs");
    expect(orgs.length).toBe(1);

    const users = await db.query("SELECT id FROM users");
    expect(users.length).toBe(1);
  });

  test("--non-interactive exits with code 7 when prompt would appear", async () => {
    const { runInteractiveInit } = await import("./init.ts");
    // nonInteractive mode with no existing org — should throw INTERACTIVE_REQUIRED
    try {
      await runInteractiveInit(db, { nonInteractive: true });
      // If no prompt needed (org exists), it should succeed silently.
      // But first run needs confirmation, so this should throw.
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      const err = e as { code?: number; message?: string };
      expect(err.code).toBe(7);
    }
  });

  test("--non-interactive succeeds if org already exists (no prompt needed)", async () => {
    const { seedOrgAndAdmin, runInteractiveInit } = await import("./init.ts");
    await seedOrgAndAdmin(db);

    // No prompt needed — should succeed.
    await runInteractiveInit(db, { nonInteractive: true });
    // No throw = pass.
  });
});
