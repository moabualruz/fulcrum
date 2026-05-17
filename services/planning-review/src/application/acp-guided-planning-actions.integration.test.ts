import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createDoc } from "@knowledge-workspace/application/docs/commands.ts";
import { startGuidedAcpPlanningSession } from "@planning-review/application/acp-guided-planning-actions.ts";

const USER_ID = "user-guided-acp-planning";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("guided ACP planning application action", () => {
  test("starts a trace-linked guided planning session from selected docs and records ACP traffic", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: null };
    const sourceDoc = await createDoc(em, ctx, {
      title: "Replacement workflow brief",
      bodyMd: "Use ACP selectors, prompt templates, permission review, and traffic visibility.",
      scope: "global",
      docType: "scratch",
      source: { kind: "trace", id: "trace-guided-acp" },
    });

    const result = await startGuidedAcpPlanningSession(em, ctx, {
      acpSessionId: "acp-guided-session-1",
      agentName: "codex",
      cwd: "/Users/mkh/workspace/fulcrum",
      userPrompt: "Plan the guided ACP workflow.",
      promptTemplateId: "prototype-first",
      selectedDocIds: [sourceDoc.id],
      traceId: "trace-guided-acp",
      modeId: "planning",
      modelId: "gpt-5.5",
      permissionMode: "review_each_tool",
      maxDocChars: 1000,
    });

    expect(result.status).toBe("ready_for_acp_prompt");
    expect(result.session).toMatchObject({
      acpSessionId: "acp-guided-session-1",
      agentName: "codex",
      cwd: "/Users/mkh/workspace/fulcrum",
      promptTemplateId: "prototype-first",
      traceId: "trace-guided-acp",
      modeId: "planning",
      modelId: "gpt-5.5",
      permissionMode: "review_each_tool",
    });
    expect(result.session.availableModes).toEqual([
      expect.objectContaining({ id: "planning", name: "Planning" }),
      expect.objectContaining({ id: "review", name: "Review" }),
    ]);
    expect(result.session.availableModels).toEqual([
      expect.objectContaining({ modelId: "gpt-5.5", name: "gpt-5.5" }),
    ]);
    expect(result.permissionOptions.map((option) => option.optionId)).toEqual([
      "allow_once",
      "allow_session",
      "deny",
    ]);
    expect(result.context.sourceRefs).toEqual([{ kind: "doc", id: sourceDoc.id }]);
    expect(result.prompt).toContain("Plan the guided ACP workflow.");
    expect(result.prompt).toContain("Trace ID: trace-guided-acp");
    expect(result.prompt).toContain("## Freeform Document: Replacement workflow brief");
    expect(result.prompt).toContain("submit_plan");
    expect(result.prompt).toContain("ACP guided session");
    expect(result.traffic.entries).toEqual([
      expect.objectContaining({
        direction: "out",
        type: "request",
        method: "session/new",
        payload: expect.objectContaining({
          cwd: "/Users/mkh/workspace/fulcrum",
          modeId: "planning",
          modelId: "gpt-5.5",
        }),
      }),
      expect.objectContaining({
        direction: "out",
        type: "request",
        method: "session/prompt",
        payload: expect.objectContaining({
          traceId: "trace-guided-acp",
          promptTemplateId: "prototype-first",
        }),
      }),
    ]);

    const eventRows = await em.getConnection().execute<Array<{
      subject_id: string;
      verb: string;
      payload: Record<string, unknown>;
    }>>(
      `select subject_id, verb, payload from events where org_id = ? and subject_id = ? and verb = ?`,
      [DEFAULT_ORG_ID, "acp-guided-session-1", "acp_guided_planning_started"],
    );
    expect(eventRows).toEqual([{
      subject_id: "acp-guided-session-1",
      verb: "acp_guided_planning_started",
      payload: expect.objectContaining({
        actor: "system",
        traceId: "trace-guided-acp",
        agentName: "codex",
        cwd: "/Users/mkh/workspace/fulcrum",
        modeId: "planning",
        modelId: "gpt-5.5",
        permissionMode: "review_each_tool",
        sourceRefs: [{ kind: "doc", id: sourceDoc.id }],
      }),
    }]);
  });
});
