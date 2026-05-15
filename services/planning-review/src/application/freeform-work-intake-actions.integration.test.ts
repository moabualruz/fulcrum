import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { getDoc } from "@knowledge-workspace/application/docs/queries.ts";
import { startFreeformWorkFromDocs } from "@planning-review/application/freeform-doc-actions.ts";

const USER_ID = "user-freeform-work-intake";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("freeform work intake application action", () => {
  test("creates a trace-linked freeform doc and returns it as ACP planning context", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: null };

    const result = await startFreeformWorkFromDocs(em, ctx, {
      title: "Agent OS replacement brief",
      bodyMd: "Preserve knowledge documents, ACP guided planning, and task/dependency flow.",
      userPrompt: "Plan this as prototype-first implementation work.",
      traceId: "trace-freeform-intake",
      acpSessionId: "acp-session-1",
      modeId: "planning",
      modelId: "gpt-5.4",
      maxDocChars: 1000,
    });

    expect(result.status).toBe("ready_for_planning");
    expect(result.document).toMatchObject({
      title: "Agent OS replacement brief",
      bodyMd: "Preserve knowledge documents, ACP guided planning, and task/dependency flow.",
      docType: "scratch",
      scope: "global",
      frontmatter: expect.objectContaining({
        workflowKind: "freeform_work_intake",
        traceId: "trace-freeform-intake",
        acpSessionId: "acp-session-1",
        modeId: "planning",
        modelId: "gpt-5.4",
      }),
    });
    expect(result.context.traceId).toBe("trace-freeform-intake");
    expect(result.context.sourceRefs).toEqual([{ kind: "doc", id: result.document.id }]);
    expect(result.context.selectedDocs).toEqual([
      expect.objectContaining({
        id: result.document.id,
        breadcrumb: "Agent OS replacement brief",
        bodyMd: "Preserve knowledge documents, ACP guided planning, and task/dependency flow.",
      }),
    ]);
    expect(result.prompt).toContain("Plan this as prototype-first implementation work.");
    expect(result.prompt).toContain("Trace ID: trace-freeform-intake");
    expect(result.prompt).toContain("## Freeform Document: Agent OS replacement brief");
    expect(result.prompt).toContain("submit_plan");

    const persisted = await getDoc(em, ctx, result.document.id);
    expect(persisted?.frontmatter).toMatchObject({
      workflowKind: "freeform_work_intake",
      traceId: "trace-freeform-intake",
    });

    const eventRows = await em.getConnection().execute<Array<{ subject_id: string; verb: string; payload: Record<string, unknown> }>>(
      `select subject_id, verb, payload from events where org_id = ? and subject_id = ? and verb = ?`,
      [DEFAULT_ORG_ID, result.document.id, "freeform_work_started"],
    );
    expect(eventRows).toEqual([{
      subject_id: result.document.id,
      verb: "freeform_work_started",
      payload: expect.objectContaining({
        actor: "system",
        traceId: "trace-freeform-intake",
        documentId: result.document.id,
        title: "Agent OS replacement brief",
        acpSessionId: "acp-session-1",
        modeId: "planning",
        modelId: "gpt-5.4",
        sourceRefs: [{ kind: "doc", id: result.document.id }],
      }),
    }]);
  });
});
