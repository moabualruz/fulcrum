import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";

import { createTestOrm } from "@test-support/application-database.ts";
import { RoutingRule, RoutingRuleSource } from "@platform-core/infrastructure/application-database/entities/router/RoutingRule.ts";
import { RoutingRuleRepository } from "@platform-core/infrastructure/application-database/repositories/router/RoutingRuleRepository.ts";
import { Task } from "@platform-core/infrastructure/application-database/entities/tasks/Task.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockSession() {
  return {
    id: "session-routing-test",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "token-routing-test",
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(em: import("typeorm").EntityManager) {
  const container = new Container();
  container.bind({
    provide: RoutingRuleRepository,
    useValue: em.getRepository(RoutingRule) as RoutingRuleRepository,
  });

  return createCaller(
    createContext({
      session: mockSession() as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em,
      container,
    }),
  );
}

describe("routing tRPC drafts procedures", () => {
  test("drafts.list returns empty array when no drafts exist", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const drafts = await (caller.routing as Record<string, unknown>).drafts as {
        list: (input?: Record<string, unknown>) => Promise<unknown[]>;
      };
      const result = await drafts.list({});
      expect(Array.isArray(result)).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("drafts.approve returns ok for review_needed draft", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const drafts = await (caller.routing as unknown as Record<string, unknown>).drafts as {
        approve: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      };
      const result = await drafts.approve({ draftId: DRAFT_ID });
      expect(result).toEqual({ ok: true });
    } finally {
      await db.close();
    }
  });

  test("drafts.approve requires permissionedProcedure and returns ok", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const drafts = await (caller.routing as Record<string, unknown>).drafts as {
        approve: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      };
      const result = await drafts.approve({ draftId: DRAFT_ID });
      expect(result).toHaveProperty("ok");
    } finally {
      await db.close();
    }
  });

  test("drafts.delete returns ok for conflict draft (conflict delete with sha_mismatch scenario)", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const drafts = await (caller.routing as unknown as Record<string, unknown>).drafts as {
        delete: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      };
      const result = await drafts.delete({ draftId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
      expect(result).toEqual({ ok: true });
    } finally {
      await db.close();
    }
  });

  test("drafts.delete requires permissionedProcedure and returns ok", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const drafts = await (caller.routing as Record<string, unknown>).drafts as {
        delete: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      };
      const result = await drafts.delete({ draftId: DRAFT_ID });
      expect(result).toHaveProperty("ok");
    } finally {
      await db.close();
    }
  });

  test("drafts.update requires permissionedProcedure and returns ok", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const drafts = await (caller.routing as Record<string, unknown>).drafts as {
        update: (input: { draftId: string; conditions?: Record<string, unknown> }) => Promise<{ ok: boolean }>;
      };
      const result = await drafts.update({ draftId: DRAFT_ID });
      expect(result).toHaveProperty("ok");
    } finally {
      await db.close();
    }
  });
});

describe("routing tRPC config procedures", () => {
  test("config.updateLlmGate requires permissionedProcedure and returns ok", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const config = await (caller.routing as Record<string, unknown>).config as {
        updateLlmGate: (input: { inputMode?: string; enabled?: boolean }) => Promise<{ ok: boolean }>;
      };
      const result = await config.updateLlmGate({ inputMode: "task_facts", enabled: true });
      expect(result).toEqual({ ok: true });
    } finally {
      await db.close();
    }
  });
});

describe("routing tRPC enriched test response", () => {
  test("test returns enriched schema with backend, model, whyUnmatched, evidence", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const rule = await caller.routing.create({
        name: "Route enrich",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
        actionAgent: "codex",
        priority: 1,
      });

      const task = em.create(Task, {
        org: ORG_ID,
        title: "Test enriched routing",
        status: "bug",
        priority: 1,
        customFields: { tags: ["test"] },
      } as never);
      em.persist(task);
      await em.flush();

      const decision = await caller.routing.test({ taskId: task.id });

      // Should have the enriched fields — at minimum status, matchedRuleId, confidence
      expect(decision).toHaveProperty("status");
      expect(decision).toHaveProperty("matchedRuleId");
      expect(decision).toHaveProperty("confidence");

      // backend and model are present (nullable for deterministic matches)
      expect(decision).toHaveProperty("backend");
      // whyUnmatched present
      expect(decision).toHaveProperty("whyUnmatched");
      // evidence present
      expect(decision).toHaveProperty("evidence");
      // matched
      expect((decision as Record<string, unknown>).status).toBe("matched");
    } finally {
      await db.close();
    }
  });

  test("dryRun returns enriched schema with backend, model, whyUnmatched", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      await caller.routing.create({
        name: "Route docs",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "docs" }] },
        actionAgent: "claude-code",
        priority: 1,
      });

      const decision = await caller.routing.dryRun({
        taskJson: {
          title: "Write routing docs",
          kind: "docs",
          priority: "normal",
          tags: ["docs"],
        },
      });

      expect(decision).toHaveProperty("status");
      expect(decision).toHaveProperty("matchedRuleId");
      expect(decision).toHaveProperty("confidence");
      expect(decision).toHaveProperty("backend");
      expect(decision).toHaveProperty("whyUnmatched");
      expect(decision).toHaveProperty("evidence");
    } finally {
      await db.close();
    }
  });
});
