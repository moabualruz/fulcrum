import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createDoc } from "@knowledge-workspace/application/docs/commands.ts";
import { getDoc } from "@knowledge-workspace/application/docs/queries.ts";
import { createTask, setDependencies } from "@work-management/application/work-item-commands.ts";
import { restartPlanningCycleFromUpdates } from "@planning-review/application/continuous-update-actions.ts";

const USER_ID = "user-continuous-update";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("continuous update planning application action", () => {
  test("persists manual freeform doc edits and restarts the ACP planning cycle with trace/task context", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: null };
    const sourceDoc = await createDoc(em, ctx, {
      title: "Original workflow brief",
      bodyMd: "Old workflow context.",
      scope: "global",
      docType: "scratch",
      frontmatter: {
        workflowKind: "freeform_work_intake",
        traceId: "trace-continuous-update",
      },
      source: { kind: "trace", id: "trace-continuous-update" },
    });
    const prerequisite = await createTask(em, ctx, {
      title: "Prepare API contract",
      status: "done",
      descriptionText: "Existing dependency success: API trace ids are stable.",
    });
    const implementation = await createTask(em, ctx, {
      title: "Update planning workbench",
      status: "pending",
      descriptionText: "Success: updated UX trace IDs are preserved.",
    });
    await setDependencies(em, ctx, implementation.id, {
      blocks: [],
      blocked_by: [prerequisite.id],
    });

    const result = await restartPlanningCycleFromUpdates(em, ctx, {
      trigger: "manual_doc_edit",
      userPrompt: "Replan after the user changed the workflow brief.",
      traceId: "trace-continuous-update",
      acpSessionId: "acp-session-continuation",
      modeId: "planning",
      modelId: "gpt-5.5",
      selectedDocIds: [sourceDoc.id],
      targetTaskIds: [implementation.id, "task-missing"],
      changedDocs: [{
        id: sourceDoc.id,
        title: "Updated workflow brief",
        bodyMd: "New context: keep ACP edits, PM dependencies, QA loops, and generated E2E in the next cycle.",
      }],
      maxDocChars: 2000,
    });

    expect(result.status).toBe("ready_for_replanning");
    expect(result.trigger).toBe("manual_doc_edit");
    expect(result.traceId).toBe("trace-continuous-update");
    expect(result.changedDocs).toEqual([
      expect.objectContaining({
        id: sourceDoc.id,
        title: "Updated workflow brief",
        bodyMd: "New context: keep ACP edits, PM dependencies, QA loops, and generated E2E in the next cycle.",
      }),
    ]);
    expect(result.targetTaskIds).toEqual([implementation.id, "task-missing"]);
    expect(result.targetTasks).toEqual([expect.objectContaining({
      id: implementation.id,
      title: "Update planning workbench",
      status: "pending",
      descriptionText: "Success: updated UX trace IDs are preserved.",
      blockedByTaskIds: [prerequisite.id],
      blocksTaskIds: [],
    })]);
    expect(result.missingTargetTaskIds).toEqual(["task-missing"]);
    expect(result.context.sourceRefs).toEqual([{ kind: "doc", id: sourceDoc.id }]);
    expect(result.prompt).toContain("Continue the Fulcrum workflow cycle");
    expect(result.prompt).toContain("Replan after the user changed the workflow brief.");
    expect(result.prompt).toContain("New context: keep ACP edits");
    expect(result.prompt).toContain("acp-session-continuation");
    expect(result.prompt).toContain("Update planning workbench");
    expect(result.prompt).toContain("Prepare API contract");
    expect(result.prompt).toContain("task-missing");
    expect(result.prompt).toContain("submit_plan");

    const persisted = await getDoc(em, ctx, sourceDoc.id);
    expect(persisted?.title).toBe("Updated workflow brief");
    expect(persisted?.bodyMd).toContain("New context: keep ACP edits");

    const eventRows = await em.getConnection().execute<Array<{
      subject_id: string;
      verb: string;
      payload: Record<string, unknown>;
    }>>(
      `select subject_id, verb, payload from events where org_id = ? and subject_id = ? and verb = ?`,
      [DEFAULT_ORG_ID, "trace-continuous-update", "planning_cycle_restarted"],
    );
    expect(eventRows).toEqual([{
      subject_id: "trace-continuous-update",
      verb: "planning_cycle_restarted",
      payload: expect.objectContaining({
        actor: "system",
        traceId: "trace-continuous-update",
        trigger: "manual_doc_edit",
        acpSessionId: "acp-session-continuation",
        modeId: "planning",
        modelId: "gpt-5.5",
        changedDocIds: [sourceDoc.id],
        selectedDocIds: [sourceDoc.id],
        targetTaskIds: [implementation.id, "task-missing"],
        targetTasks: [expect.objectContaining({
          id: implementation.id,
          title: "Update planning workbench",
          blockedByTaskIds: [prerequisite.id],
        })],
        missingTargetTaskIds: ["task-missing"],
        sourceRefs: [{ kind: "doc", id: sourceDoc.id }],
      }),
    }]);
  });
});
