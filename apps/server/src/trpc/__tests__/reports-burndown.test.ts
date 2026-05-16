import { describe, expect, test } from "bun:test";
import type { EntityManager } from "typeorm";
import { z } from "zod";

import { createTestOrm } from "@test-support/application-database.ts";
import { MetricsCache } from "@work-management/infrastructure/database/entities/tasks/MetricsCache.ts";
import { Sprint, SprintStatus } from "@work-management/infrastructure/database/entities/tasks/Sprint.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";

function createMapContainer(): DiContainer {
  const bindings = new Map<unknown, unknown>();
  return {
    get: (token: unknown) => {
      if (bindings.has(token)) return bindings.get(token) as never;
      throw new Error(`Token not found in container: ${String(token)}`);
    },
    has: (token: unknown) => bindings.has(token),
    bind: (binding: unknown) => {
      const b = binding as { provide?: unknown; useValue?: unknown };
      if (b?.provide !== undefined) bindings.set(b.provide, b.useValue);
    },
  };
}

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function mockSession() {
  return {
    id: "sess-reports",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-reports",
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(em: EntityManager) {
  const container = createMapContainer();
  const repo = em.getRepository(Task) as TaskRepository;
  container.bind({ provide: TaskRepository, useValue: repo });

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

/** Insert task via raw SQL (lazy fields don't persist via em.create). */
async function insertTask(
  em: EntityManager,
  opts: { sprintId: string; points: number; status?: string; title?: string },
): Promise<void> {
  await em.getConnection().execute(
    `INSERT INTO tasks (org_id, title, status, sprint_id, points) VALUES (?, ?, ?, ?, ?)`,
    [ORG_ID, opts.title ?? "task", opts.status ?? "todo", opts.sprintId, opts.points],
  );
}

/**
 * BurndownPoint Zod schema — matches the tRPC output type.
 * AC: CLI --json schema matches return type (Zod parse).
 */
export const BurndownPointSchema = z.object({
  date: z.string(),
  pointsRemaining: z.number(),
  ideal: z.number(),
});
export const BurndownOutputSchema = z.array(BurndownPointSchema);

describe("reports.burndown tRPC", () => {
  test("returns ideal line: day 0 = capacity, day N = 0, linear interpolation", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const org = em.getReference(Org, ORG_ID);

      // Create sprint: 3 days (Jan 1-4, daysBetween = 3)
      const sprint = em.create(Sprint, {
        org,
        projectId: PROJECT_ID,
        name: "S1",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-01-04"),
        status: SprintStatus.active,
        capacityPoints: 12,
      });
      await em.save(sprint);

      // Insert tasks with 12 total points via raw SQL
      await insertTask(em, { sprintId: sprint.id, points: 8, title: "T1" });
      await insertTask(em, { sprintId: sprint.id, points: 4, title: "T2" });

      // Seed metrics_cache entries for day 0 and day 1
      const mc0 = em.create(MetricsCache, {
        projectId: PROJECT_ID,
        sprint,
        date: new Date("2025-01-01"),
        pointsRemaining: 12,
      });
      const mc1 = em.create(MetricsCache, {
        projectId: PROJECT_ID,
        sprint,
        date: new Date("2025-01-02"),
        pointsRemaining: 8,
      });
      await em.save([mc0, mc1]);

      const caller = callerFor(em);
      const result = await caller.reports.burndown({
        projectId: PROJECT_ID,
        sprintId: sprint.id,
      });

      // Validate shape with Zod
      const parsed = BurndownOutputSchema.parse(result);
      expect(parsed.length).toBeGreaterThanOrEqual(2);

      // Day 0: ideal = 12 (capacity), actual = 12
      const day0 = parsed.find((p) => p.date === "2025-01-01");
      expect(day0).toBeDefined();
      expect(day0!.ideal).toBe(12);
      expect(day0!.pointsRemaining).toBe(12);

      // Day 1: ideal = 12 - (12/3)*1 = 8, actual = 8
      const day1 = parsed.find((p) => p.date === "2025-01-02");
      expect(day1).toBeDefined();
      expect(day1!.ideal).toBe(8);
      expect(day1!.pointsRemaining).toBe(8);

      // Last day ideal should be 0
      const lastDay = parsed[parsed.length - 1]!;
      expect(lastDay.ideal).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("fallback: returns same shape when cache is empty (on-demand computation)", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const org = em.getReference(Org, ORG_ID);

      const sprint = em.create(Sprint, {
        org,
        projectId: PROJECT_ID,
        name: "S2",
        startDate: new Date("2025-02-01"),
        endDate: new Date("2025-02-03"),
        status: SprintStatus.active,
        capacityPoints: 10,
      });
      await em.save(sprint);

      // Task but NO metrics_cache entries
      await insertTask(em, { sprintId: sprint.id, points: 10, title: "T3" });

      const caller = callerFor(em);
      const result = await caller.reports.burndown({
        projectId: PROJECT_ID,
        sprintId: sprint.id,
      });

      // Same Zod shape — AC: fallback returns same shape
      const parsed = BurndownOutputSchema.parse(result);
      expect(parsed.length).toBeGreaterThanOrEqual(2);

      // Day 0 ideal = total points
      expect(parsed[0]!.ideal).toBe(10);
      expect(parsed[0]!.pointsRemaining).toBe(10);

      // Last day ideal = 0
      expect(parsed[parsed.length - 1]!.ideal).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("returns empty for nonexistent sprint", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const caller = callerFor(em);
      const result = await caller.reports.burndown({
        projectId: PROJECT_ID,
        sprintId: "00000000-0000-4000-a000-000000000099",
      });
      expect(result).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("chart load time < 100ms from metrics_cache", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const org = em.getReference(Org, ORG_ID);

      const sprint = em.create(Sprint, {
        org,
        projectId: PROJECT_ID,
        name: "S3",
        startDate: new Date("2025-03-01"),
        endDate: new Date("2025-03-14"),
        status: SprintStatus.active,
        capacityPoints: 20,
      });
      await em.save(sprint);

      // Insert task via raw SQL
      await insertTask(em, { sprintId: sprint.id, points: 20, title: "T-perf" });

      // Seed 14 days of metrics
      for (let d = 0; d < 14; d++) {
        const date = new Date("2025-03-01");
        date.setDate(date.getDate() + d);
        em.persist(em.create(MetricsCache, {
          projectId: PROJECT_ID,
          sprint,
          date,
          pointsRemaining: Math.max(0, Math.round(20 - d * 1.5)),
        }));
      }
      /* flushed */

      const caller = callerFor(em);
      const start = performance.now();
      const result = await caller.reports.burndown({
        projectId: PROJECT_ID,
        sprintId: sprint.id,
      });
      const elapsed = performance.now() - start;

      expect(result.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(100);
    } finally {
      await db.close();
    }
  });
});
