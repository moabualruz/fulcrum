import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RULE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RELATIONSHIP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const em = { marker: "plan28-em" } as never;

function ctx() {
  return createContext({
    session: {
      id: "session-plan28",
      token: "session-plan28",
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
    em,
    container: null,
  });
}

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

describe("Plan 28 tRPC adapter extraction", () => {
  test("recurrence router delegates to application commands", async () => {
    const listRecurrenceRules = mock(async () => [{ id: RULE_ID }]);
    const createRecurrenceRule = mock(async () => ({ id: RULE_ID }));
    const { __setRecurrenceApplicationForTest, recurrenceRouter } = await import("./recurrence.ts");
    restore = __setRecurrenceApplicationForTest({
      listRecurrenceRules: listRecurrenceRules as never,
      createRecurrenceRule: createRecurrenceRule as never,
    });
    const caller = t.createCallerFactory(recurrenceRouter)(ctx());

    await expect(caller.list({ taskId: TASK_ID })).resolves.toEqual([{ id: RULE_ID }] as never);
    await caller.create({ taskId: TASK_ID, triggerType: "schedule", intervalDays: 7 });

    expect(listRecurrenceRules).toHaveBeenCalledWith(em, { orgId: ORG_ID, userId: USER_ID }, TASK_ID);
    expect(createRecurrenceRule).toHaveBeenCalledWith(em, { orgId: ORG_ID, userId: USER_ID }, TASK_ID, {
      triggerType: "schedule",
      cronExpression: undefined,
      intervalDays: 7,
      timezone: undefined,
      includeSubtasks: undefined,
      startDate: undefined,
      endDate: undefined,
      maxOccurrences: undefined,
    });
  });

  test("relationships router delegates to application commands", async () => {
    const createRelationship = mock(async () => ({ id: RELATIONSHIP_ID }));
    const listRelationshipsForTask = mock(async () => [{ id: RELATIONSHIP_ID }]);
    const { __setRelationshipsApplicationForTest, relationshipsRouter } = await import("./relationships.ts");
    restore = __setRelationshipsApplicationForTest({
      createRelationship: createRelationship as never,
      listRelationshipsForTask: listRelationshipsForTask as never,
    });
    const caller = t.createCallerFactory(relationshipsRouter)(ctx());

    await caller.create({ sourceTaskId: TASK_ID, targetTaskId: RULE_ID, type: "blocks" });
    await expect(caller.listForTask({ taskId: TASK_ID })).resolves.toEqual([{ id: RELATIONSHIP_ID }] as never);

    expect(createRelationship).toHaveBeenCalledWith(em, { orgId: ORG_ID, userId: USER_ID }, {
      sourceTaskId: TASK_ID,
      targetTaskId: RULE_ID,
      type: "blocks",
      userId: USER_ID,
    });
    expect(listRelationshipsForTask).toHaveBeenCalledWith(em, { orgId: ORG_ID, userId: USER_ID }, TASK_ID);
  });

  test("import/export router delegates manifest work to application commands", async () => {
    const createExportManifest = mock(async () => ({
      format: "fulcrum.json-export.v1" as const,
      manifest: {
        schema_version: 1 as const,
        fulcrum_version: "0.1.0",
        exported_at: "2026-05-07T00:00:00.000Z",
        counts: { tasks: 1 },
        column_types: {},
      },
      tasks: [{ id: TASK_ID }],
    }));
    const { __setImportExportApplicationForTest, dataExportRouter } = await import("./json-import-export.ts");
    restore = __setImportExportApplicationForTest({ createExportManifest: createExportManifest as never });
    const caller = t.createCallerFactory(dataExportRouter)(ctx());

    const result = await caller.create({ pretty: true });

    expect(createExportManifest).toHaveBeenCalledWith(em, { orgId: ORG_ID, userId: USER_ID });
    expect(result.entityCounts).toEqual({ tasks: 1 });
    expect(JSON.parse(result.json).tasks).toEqual([{ id: TASK_ID }]);
  });
});
