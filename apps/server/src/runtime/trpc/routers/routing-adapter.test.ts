import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { RoutingRuleSource, type RoutingRule } from "@/db/entities/router/RoutingRule.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const RULE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ruleDto = {
  id: RULE_ID,
  orgId: ORG_ID,
  projectId: null,
  name: "Adapter rule",
  conditionsJson: { all: [] },
  actionAgent: "codex",
  actionSkillSet: [],
  priority: 100,
  enabled: true,
  source: RoutingRuleSource.Manual,
  createdAt: new Date("2026-05-07T00:00:00.000Z"),
  updatedAt: new Date("2026-05-07T00:00:00.000Z"),
};

const listRoutingRules = mock(async () => [ruleDto]);
const createRoutingRule = mock(async () => ruleDto);

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  listRoutingRules.mockClear();
  createRoutingRule.mockClear();
});

async function caller() {
  const { __setRoutingApplicationForTest, routingRouter } = await import("./routing.ts");
  restoreApplication = __setRoutingApplicationForTest({ listRoutingRules, createRoutingRule });
  const createCaller = t.createCallerFactory(routingRouter);
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

describe("routing tRPC adapter", () => {
  test("list delegates routing rule query to application", async () => {
    const trpc = await caller();
    const rows = await trpc.list();

    expect(rows).toEqual([ruleDto]);
    expect(listRoutingRules).toHaveBeenCalledTimes(1);
    const [, appCtx] = listRoutingRules.mock.calls[0] as unknown as [unknown, { orgId: string; userId: string }];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
  });

  test("create delegates routing rule persistence to application", async () => {
    const trpc = await caller();
    await trpc.create({
      name: "Adapter rule",
      conditionsJson: { all: [] },
      actionAgent: "codex",
    });

    expect(createRoutingRule).toHaveBeenCalledTimes(1);
    const [, appCtx, input] = createRoutingRule.mock.calls[0] as unknown as [
      unknown,
      { orgId: string; userId: string },
      Partial<RoutingRule>,
    ];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(input).toMatchObject({ name: "Adapter rule", actionAgent: "codex" });
  });
});
