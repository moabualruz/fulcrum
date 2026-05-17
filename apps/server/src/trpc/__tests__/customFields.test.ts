import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { CustomFieldDef } from "@work-management/infrastructure/database/entities/tasks/CustomFieldDef.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
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
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

function mockSession(userId: string, orgId: string) {
  return {
    id: `sess-${userId.slice(-8)}`,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-8)}`,
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(repo: TaskRepository, orgId = ORG_ID) {
  const container = createMapContainer();
  container.bind({ provide: TaskRepository, useValue: repo });

  return createCaller(
    createContext({
      session: mockSession(USER_ID, orgId) as unknown as import("better-auth").Session,
      orgId,
      userId: USER_ID,
      em: repo.manager as any,
      container,
    }),
  );
}

async function createField(
  repo: TaskRepository,
  input: {
    slug: string;
    name: string;
    type: CustomFieldDef["type"];
    required?: boolean;
    configJson?: Record<string, unknown>;
    position?: number;
  },
): Promise<CustomFieldDef> {
  const em = repo.manager;
  const field = em.getRepository(CustomFieldDef).create({
    org: { id: ORG_ID } as any,
    projectId: PROJECT_ID,
    slug: input.slug,
    name: input.name,
    type: input.type,
    required: input.required ?? false,
    configJson: input.configJson ?? {},
    archived: false,
    position: input.position ?? 0,
  });
  await em.save(field);
  return field;
}

describe("custom field tRPC procedures", () => {
  test("customFieldDefs.list returns task custom field definitions ordered by position", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.getRepository(Task) as unknown as TaskRepository;
      const caller = callerFor(repo);

      await createField(repo, {
        slug: "story_points",
        name: "Story points",
        type: "number",
        position: 2,
      });
      await createField(repo, {
        slug: "customer",
        name: "Customer",
        type: "text",
        position: 1,
      });

      const fields = await caller.customFieldDefs.list({ entityType: "task" });

      expect(fields.map((field) => field.slug)).toEqual(["customer", "story_points"]);
      expect(fields[0]).toMatchObject({
        projectId: PROJECT_ID,
        entityType: "task",
        type: "text",
        required: false,
      });
    } finally {
      await db.close();
    }
  });

  test("taskCustomFields.set stores validated text, number, date, and select values", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.getRepository(Task) as unknown as TaskRepository;
      const caller = callerFor(repo);
      const task = await caller.tasks.create({ title: "Custom field task" });
      const customer = await createField(repo, { slug: "customer", name: "Customer", type: "text" });
      const points = await createField(repo, {
        slug: "story_points",
        name: "Story points",
        type: "number",
        configJson: { min: 1, max: 8 },
      });
      const dueDate = await createField(repo, { slug: "due_date", name: "Due date", type: "date" });
      const priority = await createField(repo, {
        slug: "priority",
        name: "Priority",
        type: "select",
        configJson: {
          options: [
            { value: "low", label: "Low", color: "#16A34A" },
            { value: "high", label: "High", color: "#EA580C" },
          ],
        },
      });

      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: customer.id, value: "Acme" }),
      ).resolves.toMatchObject({ taskId: task.id, customFields: { customer: "Acme" } });
      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: points.id, value: 5 }),
      ).resolves.toMatchObject({ customFields: { customer: "Acme", story_points: 5 } });
      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: dueDate.id, value: "2026-05-03" }),
      ).resolves.toMatchObject({ customFields: { due_date: "2026-05-03" } });
      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: priority.id, value: "high" }),
      ).resolves.toMatchObject({ customFields: { priority: "high" } });
    } finally {
      await db.close();
    }
  });

  test("taskCustomFields.set rejects invalid type, number constraints, and select options", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.getRepository(Task) as unknown as TaskRepository;
      const caller = callerFor(repo);
      const task = await caller.tasks.create({ title: "Validation task" });
      const requiredText = await createField(repo, {
        slug: "customer",
        name: "Customer",
        type: "text",
        required: true,
      });
      const points = await createField(repo, {
        slug: "story_points",
        name: "Story points",
        type: "number",
        configJson: { min: 1, max: 8 },
      });
      const priority = await createField(repo, {
        slug: "priority",
        name: "Priority",
        type: "select",
        configJson: { options: [{ value: "low", label: "Low", color: "#16A34A" }] },
      });

      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: requiredText.id, value: "" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: points.id, value: 13 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.taskCustomFields.set({ taskId: task.id, fieldDefId: priority.id, value: "urgent" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await db.close();
    }
  });

  test("taskCustomFields.clear removes optional values and rejects required field clearing", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.getRepository(Task) as unknown as TaskRepository;
      const caller = callerFor(repo);
      const task = await caller.tasks.create({ title: "Clear task" });
      const optionalField = await createField(repo, { slug: "tag", name: "Tag", type: "text" });
      const requiredField = await createField(repo, {
        slug: "customer",
        name: "Customer",
        type: "text",
        required: true,
      });

      await caller.taskCustomFields.set({ taskId: task.id, fieldDefId: optionalField.id, value: "ux" });
      await expect(
        caller.taskCustomFields.clear({ taskId: task.id, fieldDefId: optionalField.id }),
      ).resolves.toMatchObject({ taskId: task.id, customFields: {} });

      let error: TRPCError | null = null;
      try {
        await caller.taskCustomFields.clear({ taskId: task.id, fieldDefId: requiredField.id });
      } catch (caught) {
        if (caught instanceof TRPCError) error = caught;
      }
      expect(error).toMatchObject({
        code: "BAD_REQUEST",
        message: "Custom field customer is required.",
      });
    } finally {
      await db.close();
    }
  });
});
