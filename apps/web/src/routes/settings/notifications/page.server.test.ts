import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getRetentionPolicy, upsertRetentionPolicy } from "@workflow-coordination/application/audit/web-queries.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

let db: TestOrm;
let orgId: string;

beforeEach(async () => {
  db = await createTestOrm();
  orgId = db.seed.orgId;
});

afterEach(async () => {
  await db.close();
});

describe("/settings/notifications retention policy", () => {
  test("load returns null when no policy set", async () => {
    const result = await getRetentionPolicy(db.em.fork(), orgId);
    expect(result).toBeNull();
  });

  test("save sets retainDays and returns policy", async () => {
    const policy = await upsertRetentionPolicy(db.em.fork(), orgId, 30);
    expect(policy.retain_days).toBe(30);
    expect(policy.org_id).toBe(orgId);
  });

  test("save updates existing policy", async () => {
    await upsertRetentionPolicy(db.em.fork(), orgId, 30);
    const updated = await upsertRetentionPolicy(db.em.fork(), orgId, 90);
    expect(updated.retain_days).toBe(90);
  });

  test("retain_days=0 accepted as keep-forever", async () => {
    const policy = await upsertRetentionPolicy(db.em.fork(), orgId, 0);
    expect(policy.retain_days).toBe(0);
  });

  test("getRetentionPolicy retrieves after upsert", async () => {
    await upsertRetentionPolicy(db.em.fork(), orgId, 60);
    const result = await getRetentionPolicy(db.em.fork(), orgId);
    expect(result).not.toBeNull();
    expect(result!.retain_days).toBe(60);
  });
});
