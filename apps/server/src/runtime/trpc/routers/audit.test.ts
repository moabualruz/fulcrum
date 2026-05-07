import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type { AuditQueryResult } from "@/application/audit/types.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

const auditResult: AuditQueryResult = {
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
};

const queryAuditEvents = mock(async () => auditResult);
const exportAuditEvents = mock(async () => ({ format: "json" as const, rows: [] }));

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  queryAuditEvents.mockClear();
  exportAuditEvents.mockClear();
});

async function caller() {
  const { __setAuditApplicationForTest, auditRouter } = await import("./audit.ts");
  restoreApplication = __setAuditApplicationForTest({ queryAuditEvents, exportAuditEvents });
  const createCaller = t.createCallerFactory(auditRouter);
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

describe("audit tRPC adapter", () => {
  test("query delegates audit filtering to application", async () => {
    const trpc = await caller();
    const result = await trpc.query({ subjectKind: "task" });

    expect(result).toEqual(auditResult);
    expect(queryAuditEvents).toHaveBeenCalledTimes(1);
    const [, appCtx, input] = queryAuditEvents.mock.calls[0] as unknown as [
      unknown,
      { orgId: string; userId: string },
      { subjectKind: string },
    ];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(input).toMatchObject({ subjectKind: "task" });
  });

  test("export delegates shaping to application", async () => {
    const trpc = await caller();
    await trpc.export({ format: "json", subjectKind: "task" });

    expect(exportAuditEvents).toHaveBeenCalledTimes(1);
    const [, appCtx, input] = exportAuditEvents.mock.calls[0] as unknown as [
      unknown,
      { orgId: string; userId: string },
      { format: string; subjectKind: string },
    ];
    expect(appCtx).toMatchObject({ orgId: ORG_ID, userId: USER_ID });
    expect(input).toMatchObject({ format: "json", subjectKind: "task" });
  });
});
