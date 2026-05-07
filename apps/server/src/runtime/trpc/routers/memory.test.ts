import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type { MemoryDto } from "@/application/memory/types.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const MEMORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const memoryDto: MemoryDto = {
  id: MEMORY_ID,
  orgId: ORG_ID,
  projectId: null,
  global: false,
  kind: "note",
  body: "Adapter memory",
  tags: [],
  importance: "medium",
  source: "manual",
  sourceRef: {},
  createdAt: new Date("2026-05-07T00:00:00.000Z"),
  updatedAt: new Date("2026-05-07T00:00:00.000Z"),
  archived: false,
};

const createMemory = mock(async () => memoryDto);
const listMemories = mock(async () => [memoryDto]);

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  createMemory.mockClear();
  listMemories.mockClear();
});

async function caller() {
  const { __setMemoryApplicationForTest, memoryRouter } = await import("./memory.ts");
  restoreApplication = __setMemoryApplicationForTest({ createMemory, listMemories });
  const createCaller = t.createCallerFactory(memoryRouter);
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

describe("memory tRPC adapter", () => {
  test("create delegates memory persistence to application", async () => {
    const trpc = await caller();
    await trpc.create({ body: "Adapter memory" });

    expect(createMemory).toHaveBeenCalledTimes(1);
    const [, appCtx, input] = createMemory.mock.calls[0] as unknown as [
      unknown,
      { orgId: string; userId: string },
      { body: string },
    ];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(input).toMatchObject({ body: "Adapter memory" });
  });

  test("list delegates memory filters to application", async () => {
    const trpc = await caller();
    const rows = await trpc.list();

    expect(rows).toEqual([memoryDto]);
    expect(listMemories).toHaveBeenCalledTimes(1);
    const [, appCtx] = listMemories.mock.calls[0] as unknown as [unknown, { orgId: string; userId: string }];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
  });
});
