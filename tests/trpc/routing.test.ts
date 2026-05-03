import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { Event } from "../../src/db/entities/core/Event.ts";
import { RoutingRule, RoutingRuleSource } from "../../src/db/entities/router/RoutingRule.ts";
import { RoutingRuleRepository } from "../../src/db/repositories/router/RoutingRuleRepository.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function mockSession() {
  return {
    id: "session-routing",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "token-routing",
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(em: import("@mikro-orm/postgresql").EntityManager) {
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

describe("routing tRPC router", () => {
  test("create, list, get, update, and delete rules inside the caller org", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const createdLow = await caller.routing.create({
        projectId: PROJECT_ID,
        name: "Low priority docs",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "docs" }] },
        actionAgent: "claude-code",
        actionSkillSet: ["docs"],
        priority: 20,
        enabled: true,
        source: RoutingRuleSource.Manual,
      });
      const createdHigh = await caller.routing.create({
        name: "High priority bugs",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
        actionAgent: "codex",
        priority: 5,
      });

      expect(createdLow).toMatchObject({
        orgId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Low priority docs",
        actionAgent: "claude-code",
        actionSkillSet: ["docs"],
        priority: 20,
        enabled: true,
        source: "manual",
      });

      expect((await caller.routing.list()).map((rule) => rule.id)).toEqual([
        createdHigh.id,
        createdLow.id,
      ]);
      expect((await caller.routing.list({ projectId: PROJECT_ID })).map((rule) => rule.id)).toEqual([
        createdLow.id,
      ]);
      expect(await caller.routing.list({ projectId: OTHER_PROJECT_ID })).toEqual([]);

      expect(await caller.routing.get({ id: createdLow.id })).toMatchObject({
        id: createdLow.id,
        name: "Low priority docs",
      });

      const updated = await caller.routing.update({
        id: createdLow.id,
        projectId: null,
        name: "Updated docs",
        conditionsJson: { any: [{ fact: "task.priority", operator: "equal", value: "high" }] },
        actionAgent: "gemini",
        actionSkillSet: ["docs", "review"],
        priority: 1,
        enabled: false,
        source: RoutingRuleSource.Imported,
      });

      expect(updated).toMatchObject({
        id: createdLow.id,
        projectId: null,
        name: "Updated docs",
        actionAgent: "gemini",
        actionSkillSet: ["docs", "review"],
        priority: 1,
        enabled: false,
        source: "imported",
      });

      expect(await caller.routing.delete({ id: createdLow.id })).toEqual({ ok: true });
      expect((await caller.routing.list()).map((rule) => rule.id)).toEqual([createdHigh.id]);
      expect(await caller.routing.get({ id: createdLow.id })).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("test returns autoAssign decision for saved task and records one event", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const rule = await caller.routing.create({
        name: "Route bugs",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
        actionAgent: "codex",
        priority: 1,
      });
      const task = em.create(Task, {
        org: ORG_ID,
        title: "Fix routing tRPC",
        status: "bug",
        priority: 1,
        customFields: { tags: ["backend"] },
      } as never);
      em.persist(task);
      await em.flush();

      const decision = await caller.routing.test({ taskId: task.id });

      expect(decision).toEqual({
        ruleId: rule.id,
        source: "rule",
        agent: "codex",
        confidence: 1,
      });
      expect(await em.count(Event, { org: ORG_ID, verb: "routed", subjectId: task.id })).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("dryRun returns autoAssign decision for task JSON without recording events", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);

      const rule = await caller.routing.create({
        name: "Route docs",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "docs" }] },
        actionAgent: "claude-code",
        priority: 1,
      });

      const decision = await caller.routing.dryRun({
        taskJson: {
          title: "Write router docs",
          kind: "docs",
          priority: "normal",
          tags: ["docs"],
        },
      });

      expect(decision).toEqual({
        ruleId: rule.id,
        source: "rule",
        agent: "claude-code",
        confidence: 1,
      });
      expect(await em.count(Event, { org: ORG_ID, verb: "routed" })).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("create and update reject conditions with unknown operators", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const badConditions = {
        all: [{ fact: "task.kind", operator: "not-a-json-rules-engine-operator", value: "bug" }],
      };

      await expect(caller.routing.create({
        name: "Bad create",
        conditionsJson: badConditions,
        actionAgent: "codex",
      })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);

      const valid = await caller.routing.create({
        name: "Valid before bad update",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
        actionAgent: "codex",
      });

      await expect(caller.routing.update({
        id: valid.id,
        conditionsJson: badConditions,
      })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    } finally {
      await db.close();
    }
  });
});
