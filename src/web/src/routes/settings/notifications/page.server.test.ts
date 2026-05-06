import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../../test-support/product-fixtures.ts";
import { getRetentionPolicy, upsertRetentionPolicy } from "../../../lib/server/audit.ts";

let scratch: string;
let db: TestStore;
let orgId: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-retention-"));
  const dbDir = join(scratch, "db");
  mkdirSync(dbDir, { recursive: true });
  db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  orgId = org.id;
});

afterEach(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("/settings/notifications retention policy", () => {
  test("load returns null when no policy set", async () => {
    const result = await getRetentionPolicy(db, orgId);
    expect(result).toBeNull();
  });

  test("save sets retainDays and returns policy", async () => {
    const policy = await upsertRetentionPolicy(db, orgId, 30);
    expect(policy.retain_days).toBe(30);
    expect(policy.org_id).toBe(orgId);
  });

  test("save updates existing policy", async () => {
    await upsertRetentionPolicy(db, orgId, 30);
    const updated = await upsertRetentionPolicy(db, orgId, 90);
    expect(updated.retain_days).toBe(90);
  });

  test("retain_days=0 accepted as keep-forever", async () => {
    const policy = await upsertRetentionPolicy(db, orgId, 0);
    expect(policy.retain_days).toBe(0);
  });

  test("getRetentionPolicy retrieves after upsert", async () => {
    await upsertRetentionPolicy(db, orgId, 60);
    const result = await getRetentionPolicy(db, orgId);
    expect(result).not.toBeNull();
    expect(result!.retain_days).toBe(60);
  });
});
