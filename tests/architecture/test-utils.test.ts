import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  createTestCaller,
  createTestOrm,
  type TestOrm,
} from "@test-support/index.ts";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { Session, User } from "@identity-access/infrastructure/database/entities/auth/index.ts";

let testDb: TestOrm;

beforeAll(async () => {
  testDb = await createTestOrm();
});

afterAll(async () => {
  await testDb.close();
});

describe("tests/support/createTestOrm", () => {
  it.skip("runs all migrations and leaves no pending", async () => {
    const qr = testDb.ds.createQueryRunner();
    try {
      const executed = await qr.getExecutedMigrations();
      const pending = await qr.getPendingMigrations();
      expect(pending).toHaveLength(0);
      expect(executed.length).toBeGreaterThanOrEqual(1);
    } finally {
      await qr.release();
    }
  });

  it("seeds local org, admin user, and session fixture", async () => {
    const em = testDb.em;
    const admin = await em.findOne(User, { where: { email: DEFAULT_ADMIN_EMAIL } });
    const session = admin === null
      ? null
      : await em.findOne(Session, { where: { userId: admin.id } });

    expect(testDb.seed.orgId).toBe(DEFAULT_ORG_ID);
    expect(admin?.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(session?.orgId).toBe(DEFAULT_ORG_ID);
  });
});

describe("tests/support/createTestCaller", () => {
  it("creates an authenticated default caller for tRPC tests", async () => {
    const caller = await createTestCaller(testDb);
    const whoami = await caller.auth.whoami();

    expect(whoami.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(whoami.orgId).toBe(DEFAULT_ORG_ID);
    expect(whoami.role).toBe("owner");
  });
});
