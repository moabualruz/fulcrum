import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const AUTOMATION_ID = "44444444-4444-4444-8444-444444444444";

const automationDto = {
  id: AUTOMATION_ID,
  orgId: ORG_ID,
  projectId: PROJECT_ID,
  name: "Close stale tasks",
  triggerType: "schedule",
  triggerConfig: null,
  condition: null,
  actionType: "close_task",
  actionConfig: null,
  enabled: true,
  executionCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as never;

const createAutomation = mock(async () => automationDto);
const updateAutomation = mock(async () => automationDto);
const deleteAutomation = mock(async () => ({ deleted: true }));
const listAutomations = mock(async () => [automationDto]);
const getAutomationTemplates = mock(async () => []);

await mock.module("@work-management/application/automations/commands.ts", () => ({
  createAutomation,
  updateAutomation,
  deleteAutomation,
}));

await mock.module("@work-management/application/automations/queries.ts", () => ({
  listAutomations,
  getAutomationTemplates,
}));

afterEach(() => {
  createAutomation.mockClear();
  updateAutomation.mockClear();
  deleteAutomation.mockClear();
  listAutomations.mockClear();
  getAutomationTemplates.mockClear();
});

async function caller() {
  const { automationsRouter } = await import("./automations.ts");
  const createCaller = t.createCallerFactory(automationsRouter);
  return createCaller(createContext({
    session: {
      id: "session",
      token: "session",
      userId: USER_ID,
      orgId: ORG_ID,
      activeOrganizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    } as never,
    orgId: ORG_ID,
    userId: USER_ID,
    em: { marker: "adapter-em" } as never,
    container: null,
  }));
}

describe("automations tRPC adapter", () => {
  test("list delegates to application layer with the provided project id", async () => {
    const trpc = await caller();
    const result = await trpc.list({ projectId: PROJECT_ID });
    expect(result).toEqual([automationDto]);
    expect(listAutomations).toHaveBeenCalledTimes(1);
  });

  test("create rejects non-uuid project id with a validation error", async () => {
    const trpc = await caller();
    await expect(
      trpc.create({
        projectId: "not-a-uuid",
        name: "x",
        triggerType: "schedule",
        actionType: "close_task",
      } as never),
    ).rejects.toThrow();
    expect(createAutomation).not.toHaveBeenCalled();
  });

  test("create rejects empty name with a validation error", async () => {
    const trpc = await caller();
    await expect(
      trpc.create({
        projectId: PROJECT_ID,
        name: "",
        triggerType: "schedule",
        actionType: "close_task",
      } as never),
    ).rejects.toThrow();
    expect(createAutomation).not.toHaveBeenCalled();
  });

  test("create with valid input delegates to application with normalized null defaults", async () => {
    const trpc = await caller();
    const result = await trpc.create({
      projectId: PROJECT_ID,
      name: "Close stale tasks",
      triggerType: "schedule",
      actionType: "close_task",
    });
    expect(result).toEqual(automationDto);
    expect(createAutomation).toHaveBeenCalledTimes(1);
    const [, , payload] = (createAutomation.mock.calls[0] ?? []) as unknown[];
    expect(payload).toMatchObject({
      projectId: PROJECT_ID,
      name: "Close stale tasks",
      triggerConfig: null,
      condition: null,
      actionConfig: null,
    });
  });

  test("delete rejects non-uuid id with a validation error", async () => {
    const trpc = await caller();
    await expect(trpc.delete({ id: "not-a-uuid" } as never)).rejects.toThrow();
    expect(deleteAutomation).not.toHaveBeenCalled();
  });

  test("templates query delegates without any input", async () => {
    const trpc = await caller();
    await trpc.templates();
    expect(getAutomationTemplates).toHaveBeenCalledTimes(1);
  });
});
