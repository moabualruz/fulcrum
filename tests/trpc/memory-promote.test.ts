import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createTestOrm } from "@test-support/application-database.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function mockSession(): Session {
  return {
    id: "sess-memory-promote",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-memory-promote",
    ipAddress: null,
    userAgent: null,
  } as unknown as Session;
}

function callerFor(em: import("@mikro-orm/postgresql").EntityManager) {
  return createCaller(createContext({
    session: mockSession(),
    orgId: ORG_ID,
    userId: USER_ID,
    em,
    container: null,
  }));
}

describe("memories.promote tRPC", () => {
  test("promotes a project memory to accepted global context without losing source", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const memory = await caller.memories.create({
        projectId: PROJECT_ID,
        body: "Prefer deterministic context preview",
        kind: "decision",
        sourceRef: { kind: "doc", id: "doc-1", key: "context.preview" },
      });

      const promoted = await caller.memories.promote({ id: memory.id });

      expect(promoted).toMatchObject({
        id: memory.id,
        projectId: null,
        global: true,
        importance: "high",
        sourceRef: { kind: "doc", id: "doc-1", key: "context.preview", promotedFromProjectId: PROJECT_ID },
      });
      expect(promoted.tags).toContain("accepted");
    } finally {
      await db.close();
    }
  });
});
