import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createDoc } from "@knowledge-workspace/application/docs/commands.ts";
import { buildFreeformPlanningPromptFromDocs } from "@planning-review/application/freeform-doc-actions.ts";

const USER_ID = "user-freeform-planning";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("freeform docs planning prompt application action", () => {
  test("loads persisted freeform docs into ACP planning context with document workspace breadcrumbs", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: null };
    const root = await createDoc(em, ctx, {
      title: "Project Brief",
      bodyMd: "Root constraints",
      sortPosition: 1,
    });
    const selected = await createDoc(em, ctx, {
      title: "Delivery Constraints",
      bodyMd: "Use guided ACP planning. Keep PGlite local and Postgres production.",
      parentId: root.id,
      sortPosition: 2,
    });
    await createDoc(em, ctx, {
      title: "Unselected Scratch",
      bodyMd: "This scratch note must not enter the prompt.",
      sortPosition: 3,
    });

    const result = await buildFreeformPlanningPromptFromDocs(em, ctx, {
      userPrompt: "Plan the implementation with prototype-first tasks.",
      selectedDocIds: [selected.id],
      traceId: "trace-freeform",
      maxDocChars: 500,
    });

    expect(result.context.traceId).toBe("trace-freeform");
    expect(result.context.sourceRefs).toEqual([{ kind: "doc", id: selected.id }]);
    expect(result.context.selectedDocs).toEqual([
      expect.objectContaining({
        id: selected.id,
        breadcrumb: "Project Brief / Delivery Constraints",
        bodyMd: "Use guided ACP planning. Keep PGlite local and Postgres production.",
      }),
    ]);
    expect(result.prompt).toContain("Plan the implementation with prototype-first tasks.");
    expect(result.prompt).toContain("Trace ID: trace-freeform");
    expect(result.prompt).toContain("## Freeform Document: Project Brief / Delivery Constraints");
    expect(result.prompt).toContain("Use guided ACP planning. Keep PGlite local and Postgres production.");
    expect(result.prompt).toContain("submit_plan");
    expect(result.prompt).not.toContain("This scratch note must not enter the prompt.");
  });
});
