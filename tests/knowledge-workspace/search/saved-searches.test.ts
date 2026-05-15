import { afterEach, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";

import { OrgMember, User } from "@platform-core/infrastructure/application-database/entities/auth/index.ts";
import { SavedView } from "@platform-core/infrastructure/application-database/entities/tasks/SavedView.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const MEMBER_USER_ID = "6acb6d91-483f-484a-8a0c-27148c353284";
const OUTSIDER_USER_ID = "cf37a660-75d6-426e-a6b5-b27e7d5fb53f";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function setupDb() {
  db = await createTestOrm();
  const em = db.em.fork();
  const now = new Date();
  const member = em.create(User, {
    id: MEMBER_USER_ID,
    orgId: DEFAULT_ORG_ID,
    email: "saved-search-member@local",
    role: "member",
    createdAt: now,
    updatedAt: now,
  });
  const membership = em.create(OrgMember, {
    orgId: DEFAULT_ORG_ID,
    userId: MEMBER_USER_ID,
    role: "member",
    joinedAt: now,
  });
  const outsider = em.create(User, {
    id: OUTSIDER_USER_ID,
    orgId: DEFAULT_ORG_ID,
    email: "saved-search-outsider@local",
    role: "member",
    createdAt: now,
    updatedAt: now,
  });
  em.persist([member, membership, outsider]);
  await em.flush();
  return db;
}

function caller(testDb: TestOrm, userId: string) {
  return createCaller(
    createContext({
      session: {
        id: `session-${userId}`,
        userId,
        token: `token-${userId}`,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      } as import("better-auth").Session,
      orgId: DEFAULT_ORG_ID,
      userId,
      em: testDb.em.fork(),
      container: null,
    }),
  );
}

describe("saved searches", () => {
  test("private saved search is visible only to creator", async () => {
    const testDb = await setupDb();
    const owner = caller(testDb, testDb.seed.userId);
    const member = caller(testDb, MEMBER_USER_ID);

    const created = await owner.search.savedCreate({
      name: "Mine",
      queryJson: {
        text: "foo",
        filters: { kind: "task" },
        facets: { status: ["open"] },
      },
      scope: "private",
    });

    expect(created.viewType).toBe("search");
    expect(created.createdById).toBe(testDb.seed.userId);
    expect((await owner.search.savedList({})).map((view) => view.id)).toContain(created.id);
    expect((await member.search.savedList({})).map((view) => view.id)).not.toContain(created.id);
  });

  test("project and org saved searches are visible to org members", async () => {
    const testDb = await setupDb();
    const owner = caller(testDb, testDb.seed.userId);
    const member = caller(testDb, MEMBER_USER_ID);

    const project = await owner.search.savedCreate({
      name: "Project search",
      scope: "project",
      projectId: randomUUID(),
      queryJson: { text: "project", filters: {}, facets: {} },
    });
    const org = await owner.search.savedCreate({
      name: "Org search",
      scope: "org",
      queryJson: { text: "org", filters: {}, facets: {} },
    });

    expect((await member.search.savedList({})).map((view) => view.id).sort()).toEqual(
      [org.id, project.id].sort(),
    );
  });

  test("query_json round-trips through create and update", async () => {
    const testDb = await setupDb();
    const owner = caller(testDb, testDb.seed.userId);
    const initialQuery = {
      text: "alpha",
      filters: { kind: "task", project_id: "proj-1" },
      facets: { status: ["open", "blocked"] },
    };
    const updatedQuery = {
      text: "beta",
      filters: { kind: "doc" },
      facets: { tag: ["architecture"] },
    };

    const created = await owner.search.savedCreate({
      name: "Round trip",
      queryJson: initialQuery,
    });
    const updated = await owner.search.savedUpdate({
      id: created.id,
      name: "Round trip updated",
      queryJson: updatedQuery,
    });

    expect(created.queryJson).toEqual(initialQuery);
    expect(updated.name).toBe("Round trip updated");
    expect(updated.queryJson).toEqual(updatedQuery);
  });

  test("delete removes saved search", async () => {
    const testDb = await setupDb();
    const owner = caller(testDb, testDb.seed.userId);
    const created = await owner.search.savedCreate({
      name: "Delete me",
      queryJson: { text: "remove", filters: {}, facets: {} },
    });

    await owner.search.savedDelete({ id: created.id });

    expect((await owner.search.savedList({})).map((view) => view.id)).not.toContain(created.id);
  });

  test("non-creator update is mapped to forbidden tRPC error", async () => {
    const testDb = await setupDb();
    const owner = caller(testDb, testDb.seed.userId);
    const member = caller(testDb, MEMBER_USER_ID);
    const created = await owner.search.savedCreate({
      name: "Private owner search",
      queryJson: { text: "private", filters: {}, facets: {} },
      scope: "private",
    });

    let error: TRPCError | null = null;
    try {
      await member.search.savedUpdate({ id: created.id, name: "Hijacked" });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error?.code).toBe("FORBIDDEN");
  });

  test("missing saved search is mapped to not-found tRPC error", async () => {
    const testDb = await setupDb();
    const owner = caller(testDb, testDb.seed.userId);

    let error: TRPCError | null = null;
    try {
      await owner.search.savedDelete({ id: randomUUID() });
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }

    expect(error?.code).toBe("NOT_FOUND");
  });

  test("view_type constraint accepts search and still rejects wrong types", async () => {
    const testDb = await setupDb();
    const em = testDb.em.fork();
    const valid = em.create(SavedView, {
      org: em.getReference(
        (await import("@platform-core/infrastructure/application-database/entities/auth/Org.ts")).Org,
        DEFAULT_ORG_ID,
      ),
      name: "Direct search",
      scope: "private",
      viewType: "search",
      createdById: testDb.seed.userId,
    });
    em.persist(valid);
    await expect(em.flush()).resolves.toBeUndefined();

    const owner = caller(testDb, testDb.seed.userId);
    let error: TRPCError | null = null;
    try {
      await owner.search.savedCreate({
        name: "Bad type",
        viewType: "grid",
        queryJson: { text: "", filters: {}, facets: {} },
      } as never);
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error?.code).toBe("BAD_REQUEST");
  });
});
