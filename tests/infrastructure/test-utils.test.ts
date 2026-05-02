import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  createTestCaller,
  createTestContainer,
  createTestOrm,
  type TestOrm,
} from "../../src/test-utils/index.ts";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ORG_ID } from "../../src/db/seed.ts";
import { UserRepository } from "../../src/db/db.module.ts";
import { Session, User } from "../../src/db/entities/auth/index.ts";

let testDb: TestOrm;

beforeAll(async () => {
  testDb = await createTestOrm();
});

afterAll(async () => {
  await testDb.close();
});

describe("src/test-utils/createTestOrm", () => {
  it("applies all migration classes and leaves no pending migrations", async () => {
    const pending = await testDb.orm.migrator.getPending();
    const executed = await testDb.orm.migrator.getExecuted();

    expect(pending).toHaveLength(0);
    expect(executed.length).toBeGreaterThanOrEqual(7);
  });

  it("seeds local org, admin user, and session fixture", async () => {
    const em = testDb.orm.em.fork();
    const admin = await em.findOne(User, { email: DEFAULT_ADMIN_EMAIL });
    const session = admin === null
      ? null
      : await em.findOne(Session, { userId: admin.id });

    expect(testDb.seed.orgId).toBe(DEFAULT_ORG_ID);
    expect(admin?.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(session?.orgId).toBe(DEFAULT_ORG_ID);
  });
});

describe("src/test-utils/createTestContainer", () => {
  it("registers repository bindings for P1 surfaces", () => {
    const container = createTestContainer(testDb);
    const userRepo = container.get(UserRepository);

    expect(userRepo).toBeDefined();
    expect(container.__fulcrumTestSeed?.userId).toBe(testDb.seed.userId);
  });
});

describe("src/test-utils/createTestCaller", () => {
  it("creates an authenticated default caller for tRPC tests", async () => {
    const container = createTestContainer(testDb);
    const caller = await createTestCaller(container);
    const whoami = await caller.auth.whoami();

    expect(whoami.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(whoami.orgId).toBe(DEFAULT_ORG_ID);
    expect(whoami.role).toBe("owner");
  });
});
