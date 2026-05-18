import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createDoc, updateDoc } from "@knowledge-workspace/application/docs/commands.ts";
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
      bodyMd: [
        "# Constraints",
        "Use guided AI Assist planning.",
        "# Storage",
        "Keep PGlite local and Postgres production.",
      ].join("\n"),
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
    expect(result.context.sourceRefs).toEqual([
      expect.objectContaining({ kind: "doc", id: selected.id, sourceId: expect.stringContaining(`doc:${selected.id}@v`) }),
    ]);
    expect(result.context.selectedDocs).toEqual([
      expect.objectContaining({
        id: selected.id,
        sourceId: expect.stringContaining(`doc:${selected.id}@v`),
        breadcrumb: "Project Brief / Delivery Constraints",
        sections: [
          expect.objectContaining({ heading: "Constraints", excerpt: "Use guided AI Assist planning." }),
          expect.objectContaining({ heading: "Storage", excerpt: "Keep PGlite local and Postgres production." }),
        ],
      }),
    ]);
    expect(result.prompt).toContain("Plan the implementation with prototype-first tasks.");
    expect(result.prompt).toContain("Trace ID: trace-freeform");
    expect(result.prompt).toContain("## Freeform Document: Project Brief / Delivery Constraints");
    expect(result.prompt).toContain("Cite context with the listed source_id values");
    expect(result.prompt).toContain("source_id: doc:");
    expect(result.prompt).toContain("section_id: doc:");
    expect(result.prompt).toContain("Use guided AI Assist planning.");
    expect(result.prompt).toContain("submit_plan");
    expect(result.prompt).not.toContain("This scratch note must not enter the prompt.");
  });

  test("creates a new context source version after a selected document edit", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: null };
    const selected = await createDoc(em, ctx, {
      title: "Planning brief",
      bodyMd: "# Baseline\nInitial constraint.",
      sortPosition: 1,
    });

    const first = await buildFreeformPlanningPromptFromDocs(em, ctx, {
      userPrompt: "Plan from current document.",
      selectedDocIds: [selected.id],
      traceId: "trace-versioned-context",
    });
    const updated = await updateDoc(em, ctx, {
      id: selected.id,
      bodyMd: "# Baseline\nUpdated constraint.",
    });
    expect(updated).not.toBeNull();

    const second = await buildFreeformPlanningPromptFromDocs(em, ctx, {
      userPrompt: "Plan from current document.",
      selectedDocIds: [selected.id],
      traceId: "trace-versioned-context",
    });

    expect(first.context.sourceRefs[0]?.sourceId).not.toBe(second.context.sourceRefs[0]?.sourceId);
    expect(first.context.sourceRefs[0]?.versionNum).toBe(1);
    expect(second.context.sourceRefs[0]?.versionNum).toBe(2);
    expect(second.context.selectedDocs[0]?.sections[0]?.excerpt).toBe("Updated constraint.");
  });
});
