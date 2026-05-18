import { describe, expect, test } from "bun:test";

import {
  buildTechnicalPlanningCycleDraft,
  type TechnicalPlanningContext,
} from "@planning-review/application/technical-planning-cycle.ts";

const CONTEXT: TechnicalPlanningContext = {
  traceId: "trace-technical-planning",
  sourceRefs: [{ kind: "doc", id: "doc-freeform-1" }],
  selectedDocs: [{
    id: "doc-freeform-1",
    title: "Freeform brief",
    breadcrumb: "Workspace / Freeform brief",
    bodyMd: "Build a guided work intake with dependency-aware execution and review loops.",
    truncated: false,
  }],
  contextMarkdown: "## Freeform Document: Workspace / Freeform brief\n\nBuild a guided work intake.",
};

describe("technical planning cycle", () => {
  test("turns freeform or ACP context into a prototype-first plan review draft", () => {
    const result = buildTechnicalPlanningCycleDraft({
      source: "freeform_docs",
      userPrompt: "Plan a full workflow from docs to UAT.",
      context: CONTEXT,
      planId: "technical-cycle",
      reviewId: "review-technical-cycle",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace-technical-planning",
      prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
      successCriteria: [
        "User can review a generated technical plan before task creation.",
        "Prototype and boilerplate artifacts are visible before approval.",
      ],
      researchQuestions: [
        {
          id: "research-doc-context",
          question: "Which source documents constrain the planning workflow?",
          limit: "Use selected freeform docs only.",
          conclusion: "Planning must preserve source document provenance.",
          sourceIds: ["doc-freeform-1"],
        },
        {
          id: "research-provider-missing",
          question: "Which external planner pattern should be copied?",
          limit: "One provider call or record an assumption.",
        },
      ],
      taskSeeds: [
        {
          clientKey: "T1",
          title: "Generate technical planning workbench",
          success: "Plan output includes source docs and trace IDs.",
        },
        {
          clientKey: "T2",
          title: "Prepare reviewable prototype artifacts",
          dependsOn: ["T1"],
          success: "Prototype and boilerplate paths are attached to the plan.",
        },
      ],
    });

    expect(result.status).toBe("ready_for_plan_review");
    expect(result.plan.planId).toBe("technical-cycle");
    expect(result.plan.reviewId).toBe("review-technical-cycle");
    expect(result.plan.traceId).toBe("trace-technical-planning");
    expect(result.plan.markdown).toContain("# Plan a full workflow from docs to UAT");
    expect(result.plan.markdown).toContain("## Context");
    expect(result.plan.markdown).toContain("doc-freeform-1");
    expect(result.plan.markdown).toContain("## Bounded Research");
    expect(result.plan.markdown).toContain("[research] research-doc-context");
    expect(result.plan.markdown).toContain("Conclusion: Planning must preserve source document provenance.");
    expect(result.plan.markdown).toContain("[research] research-provider-missing");
    expect(result.plan.markdown).toContain("Status: assumption_recorded");
    expect(result.plan.markdown).toContain("## Decision Inputs");
    expect(result.plan.markdown).toContain("research-doc-context, research-provider-missing");
    expect(result.plan.markdown).toContain("## Prototype / Boilerplate");
    expect(result.plan.markdown).toContain("[prototype] apps/web/src/routes/planning/workbench-prototype.tsx");
    expect(result.plan.markdown).toContain("[boilerplate] services/planning-review/src/application/technical-planning-cycle.ts");
    expect(result.plan.markdown).toContain("## Success Criteria");
    expect(result.plan.markdown).toContain("User can review a generated technical plan before task creation.");
    expect(result.plan.markdown).toContain("## Tasks");
    expect(result.plan.markdown).toContain("- [T2] Prepare reviewable prototype artifacts");
    expect(result.plan.markdown).toContain("Depends on: T1");

    expect(result.breakdown.artifacts.map((artifact) => ({
      kind: artifact.kind,
      path: artifact.path,
      traceId: artifact.traceId,
      sourcePlanId: artifact.sourcePlanId,
    }))).toEqual([
      {
        kind: "prototype",
        path: "apps/web/src/routes/planning/workbench-prototype.tsx",
        traceId: "trace-technical-planning",
        sourcePlanId: "technical-cycle",
      },
      {
        kind: "boilerplate",
        path: "services/planning-review/src/application/technical-planning-cycle.ts",
        traceId: "trace-technical-planning",
        sourcePlanId: "technical-cycle",
      },
    ]);
    expect(result.artifactPreviews.map((preview) => ({
      kind: preview.kind,
      path: preview.path,
      mode: preview.mode,
      urlPath: preview.urlPath,
      run: preview.run,
    }))).toEqual([
      {
        kind: "prototype",
        path: "apps/web/src/routes/planning/workbench-prototype.tsx",
        mode: "source-module",
        urlPath: undefined,
        run: {
          command: "bun",
          args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
        },
      },
      {
        kind: "boilerplate",
        path: "services/planning-review/src/application/technical-planning-cycle.ts",
        mode: "source-module",
        urlPath: undefined,
        run: {
          command: "bun",
          args: ["-e", 'await import("./services/planning-review/src/application/technical-planning-cycle.ts")'],
        },
      },
    ]);
    expect(result.artifactPreviews[0]?.reviewChecks.join("\n")).toContain("Prototype demonstrates the intended user flow");
    expect(result.researchArtifacts).toEqual([
      {
        id: "research-doc-context",
        question: "Which source documents constrain the planning workflow?",
        limit: "Use selected freeform docs only.",
        conclusion: "Planning must preserve source document provenance.",
        sourceIds: ["doc-freeform-1"],
        status: "recorded",
      },
      {
        id: "research-provider-missing",
        question: "Which external planner pattern should be copied?",
        limit: "One provider call or record an assumption.",
        conclusion: "Assumption recorded because no research provider is configured for: Which external planner pattern should be copied?",
        sourceIds: [],
        status: "assumption_recorded",
      },
    ]);
    expect(result.plan.researchArtifactIds).toEqual(["research-doc-context", "research-provider-missing"]);
    expect(result.prompt).toContain("Persist bounded research conclusions as artifact ids");
    expect(result.prompt).toContain("Research artifact research-doc-context");
    expect(result.breakdown.taskDrafts.map((task) => ({
      key: task.clientKey,
      title: task.input.title,
      blockedBy: task.blockedByClientKeys,
    }))).toEqual([
      { key: "T1", title: "Generate technical planning workbench", blockedBy: [] },
      { key: "T2", title: "Prepare reviewable prototype artifacts", blockedBy: ["T1"] },
      { key: "verify-end-to-end", title: "Verify end-to-end", blockedBy: ["T2"] },
    ]);
    expect(result.reviewPrompt).toContain("Review this generated technical plan");
    expect(result.reviewPrompt).toContain("trace-technical-planning");
    expect(result.reviewPrompt).toContain("Prototype / Boilerplate");
  });
});
