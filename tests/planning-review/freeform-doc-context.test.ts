import { describe, expect, test } from "bun:test";

import {
  buildAcpPlanningPromptWithFreeformDocs,
  buildFreeformDocsPlanningContext,
  type FreeformPlanningContextDoc,
} from "@planning-review/application/freeform-doc-context.ts";

function doc(
  id: string,
  overrides: Partial<FreeformPlanningContextDoc> = {},
): FreeformPlanningContextDoc {
  return {
    id,
    title: id,
    bodyMd: `Body for ${id}`,
    parentId: null,
    sortPosition: "0",
    projectId: "project-1",
    ...overrides,
  };
}

describe("freeform docs to ACP planning context", () => {
  test("builds document breadcrumb context for selected freeform docs", () => {
    const context = buildFreeformDocsPlanningContext({
      traceId: "trace-ctx",
      docs: [
        doc("root", { title: "Project Brief", sortPosition: "1" }),
        doc("child", { title: "Constraints", parentId: "root", sortPosition: "2", bodyMd: "Keep Bun and Postgres/PGlite." }),
        doc("other", { title: "Unselected", sortPosition: "3" }),
      ],
      selectedDocIds: ["child"],
    });

    expect(context.traceId).toBe("trace-ctx");
    expect(context.sourceRefs).toEqual([{ kind: "doc", id: "child" }]);
    expect(context.selectedDocs).toEqual([
      expect.objectContaining({
        id: "child",
        breadcrumb: "Project Brief / Constraints",
        bodyMd: "Keep Bun and Postgres/PGlite.",
      }),
    ]);
    expect(context.contextMarkdown).toContain("## Freeform Document: Project Brief / Constraints");
    expect(context.contextMarkdown).toContain("- doc_id: child");
    expect(context.contextMarkdown).toContain("Keep Bun and Postgres/PGlite.");
    expect(context.contextMarkdown).not.toContain("Unselected");
  });

  test("uses all docs when no selection is provided and preserves document tree order", () => {
    const context = buildFreeformDocsPlanningContext({
      docs: [
        doc("later", { title: "Later", sortPosition: "z" }),
        doc("first", { title: "First", sortPosition: "a" }),
      ],
    });

    expect(context.selectedDocs.map((item) => item.id)).toEqual(["first", "later"]);
    expect(context.sourceRefs).toEqual([{ kind: "doc", id: "first" }, { kind: "doc", id: "later" }]);
  });

  test("truncates long context without losing source metadata", () => {
    const context = buildFreeformDocsPlanningContext({
      maxDocChars: 12,
      docs: [
        doc("long", {
          title: "Long",
          bodyMd: "12345678901234567890",
          versionId: "version-1",
          updatedAt: "2026-05-13T10:00:00.000Z",
        }),
      ],
    });

    expect(context.selectedDocs[0]?.truncated).toBe(true);
    expect(context.contextMarkdown).toContain("- version_id: version-1");
    expect(context.contextMarkdown).toContain("- updated_at: 2026-05-13T10:00:00.000Z");
    expect(context.contextMarkdown).toContain("123456789012");
    expect(context.contextMarkdown).toContain("[truncated]");
  });

  test("builds an ACP prompt that carries freeform docs into plan review planning", () => {
    const prompt = buildAcpPlanningPromptWithFreeformDocs({
      userPrompt: "Plan the implementation",
      runtime: "codex",
      context: buildFreeformDocsPlanningContext({
        traceId: "trace-plan",
        docs: [doc("brief", { title: "Brief", bodyMd: "Prototype first, then break down tasks." })],
      }),
    });

    expect(prompt).toContain("Plan the implementation");
    expect(prompt).toContain("Trace ID: trace-plan");
    expect(prompt).toContain("## Freeform Document: Brief");
    expect(prompt).toContain("Prototype first, then break down tasks.");
    expect(prompt).toContain("You have a plan submission tool");
    expect(prompt).toContain("submit_plan");
  });
});
