import { describe, expect, test } from "bun:test";

import {
  buildApprovedPlanBreakdown,
  mergeApprovedPlanTaskDrafts,
  materializeApprovedPlanBreakdown,
} from "@planning-review/application/approved-plan-breakdown.ts";

const APPROVED_PLAN = `# Build ACP Planning Workbench

## Prototype / Boilerplate
- [prototype] apps/web/src/features/acp/PlanningWorkbench.tsx
- [boilerplate] apps/server/src/planning/planning.controller.ts

## Success Criteria
- User can start from freeform docs or guided ACP planning.
- Dependency disclosure is shown before any board or task run starts.

## Tasks
- [T1] Create planning context service
  Depends on: none
  Success: Freeform docs appear in the ACP prompt with trace IDs.
- [T2] Build dependency preview UI
  Depends on: T1
  Success: User sees the full dependency tree before approving a run.
`;

describe("approved plan breakdown ported behavior", () => {
  test("turns an approved plan review plan into document workspace, task drafts, dependency graph, and trace-linked criteria", () => {
    const breakdown = buildApprovedPlanBreakdown({
      planId: "plan-123",
      reviewId: "review-456",
      traceId: "trace-789",
      projectId: "project-1",
      cycleId: "cycle-q2",
      moduleId: "module-planning",
      approvedPlanMarkdown: APPROVED_PLAN,
      sourceDocRefs: [
        { kind: "doc", id: "freeform-doc-1" },
        { kind: "doc", id: "freeform-doc-2" },
      ],
    });

    expect(breakdown.title).toBe("Build ACP Planning Workbench");
    expect(breakdown.docs[0]).toMatchObject({
      clientKey: "plan-doc",
      input: {
        title: "Build ACP Planning Workbench",
        projectId: "project-1",
        scope: "project",
        docType: "spec",
        source: { kind: "plan", id: "plan-123" },
      },
    });
    expect(breakdown.docs[0]?.input.bodyMd).toBe(APPROVED_PLAN);
    expect(breakdown.docs[0]?.input.frontmatter).toMatchObject({
      traceId: "trace-789",
      planId: "plan-123",
      reviewId: "review-456",
      workflowStage: "approved_plan",
    });
    expect(breakdown.docs[0]?.input.links).toEqual([
      { kind: "doc", id: "freeform-doc-1", targetKind: "doc", targetId: "freeform-doc-1", linkKind: "mention" },
      { kind: "doc", id: "freeform-doc-2", targetKind: "doc", targetId: "freeform-doc-2", linkKind: "mention" },
      { kind: "review", id: "review-456", targetKind: "review", targetId: "review-456", linkKind: "mention" },
    ]);

    expect(breakdown.artifacts).toEqual([
      {
        kind: "prototype",
        path: "apps/web/src/features/acp/PlanningWorkbench.tsx",
        title: "PlanningWorkbench.tsx",
        traceId: "trace-789",
        sourcePlanId: "plan-123",
      },
      {
        kind: "boilerplate",
        path: "apps/server/src/planning/planning.controller.ts",
        title: "planning.controller.ts",
        traceId: "trace-789",
        sourcePlanId: "plan-123",
      },
    ]);

    expect(breakdown.successCriteria.map((criterion) => criterion.text)).toEqual([
      "User can start from freeform docs or guided ACP planning.",
      "Dependency disclosure is shown before any board or task run starts.",
      "Freeform docs appear in the ACP prompt with trace IDs.",
      "User sees the full dependency tree before approving a run.",
      "Verify the full plan end-to-end against all success criteria and approved artifacts.",
    ]);

    expect(breakdown.taskDrafts.map((task) => ({
      clientKey: task.clientKey,
      title: task.input.title,
      blockedByClientKeys: task.blockedByClientKeys,
      cycleId: task.input.cycleId,
      moduleId: task.input.moduleId,
    }))).toEqual([
      {
        clientKey: "T1",
        title: "Create planning context service",
        blockedByClientKeys: [],
        cycleId: "cycle-q2",
        moduleId: "module-planning",
      },
      {
        clientKey: "T2",
        title: "Build dependency preview UI",
        blockedByClientKeys: ["T1"],
        cycleId: "cycle-q2",
        moduleId: "module-planning",
      },
      {
        clientKey: "verify-end-to-end",
        title: "Verify end-to-end",
        blockedByClientKeys: ["T2"],
        cycleId: "cycle-q2",
        moduleId: "module-planning",
      },
    ]);
    expect(breakdown.taskDrafts[0]?.input.descriptionText).toContain("## Success Criteria");
    expect(breakdown.taskDrafts[0]?.input.descriptionText).toContain("Freeform docs appear in the ACP prompt with trace IDs.");
    expect(breakdown.taskDrafts[0]?.input.descriptionText).toContain("## Prototype / Boilerplate Artifacts");
    expect(breakdown.taskDrafts[0]?.input.descriptionText).toContain("apps/web/src/features/acp/PlanningWorkbench.tsx");
    expect(breakdown.taskDrafts[0]?.input.taskType).toBe("task");

    expect(breakdown.dependencyUpdates).toEqual([
      { taskClientKey: "T2", blockedByClientKeys: ["T1"] },
      { taskClientKey: "verify-end-to-end", blockedByClientKeys: ["T2"] },
    ]);
    expect(breakdown.warnings).toEqual([]);
  });

  test("merges reviewed task edits while preserving generated subtasks and rejecting untitled additions", () => {
    const generated = buildApprovedPlanBreakdown({
      planId: "plan-123",
      traceId: "trace-789",
      approvedPlanMarkdown: APPROVED_PLAN,
    });

    const merged = mergeApprovedPlanTaskDrafts(generated.taskDrafts, [
      { clientKey: "T1" },
      {
        clientKey: "T2",
        title: "Edited dependency preview",
        descriptionText: "Edited task text",
        points: 5,
        blockedByClientKeys: ["T1"],
      },
      {
        clientKey: "T-extra",
        title: "Write rollout notes",
        descriptionText: "Capture docs and release notes",
        blockedByClientKeys: ["T2"],
      },
    ]);

    expect(merged[0]).toEqual(generated.taskDrafts[0]);
    expect(merged[1]).toMatchObject({
      clientKey: "T2",
      input: {
        title: "Edited dependency preview",
        descriptionText: "Edited task text",
        points: 5,
      },
      blockedByClientKeys: ["T1"],
    });
    expect(merged[2]).toMatchObject({
      clientKey: "T-extra",
      input: {
        title: "Write rollout notes",
        descriptionText: "Capture docs and release notes",
        taskType: "task",
      },
      blockedByClientKeys: ["T2"],
    });

    expect(() => mergeApprovedPlanTaskDrafts(generated.taskDrafts, [
      { clientKey: "T-missing-title" },
    ])).toThrow("Client-added task draft must have a title: T-missing-title");
  });

  test("materializes generated doc and task drafts before applying dependency updates with real task ids", async () => {
    const breakdown = buildApprovedPlanBreakdown({
      planId: "plan-123",
      traceId: "trace-789",
      approvedPlanMarkdown: APPROVED_PLAN,
    });
    const calls: string[] = [];

    const result = await materializeApprovedPlanBreakdown(breakdown, {
      createDoc: async (draft) => {
        calls.push(`doc:${draft.clientKey}`);
        return { id: `doc-id:${draft.clientKey}` };
      },
      createTask: async (draft) => {
        calls.push(`task:${draft.clientKey}`);
        return { id: `task-id:${draft.clientKey}` };
      },
      createArtifact: async (artifact) => {
        calls.push(`artifact:${artifact.kind}:${artifact.path}`);
        return { id: `artifact-id:${artifact.kind}:${artifact.title}` };
      },
      setTaskDependencies: async (update) => {
        calls.push(`deps:${update.taskClientKey}:${update.blockedByTaskIds.join(",")}`);
      },
    });

    expect(calls).toEqual([
      "doc:plan-doc",
      "doc:success-criteria-doc",
      "doc:prototype-1-doc",
      "doc:boilerplate-2-doc",
      "artifact:prototype:apps/web/src/features/acp/PlanningWorkbench.tsx",
      "artifact:boilerplate:apps/server/src/planning/planning.controller.ts",
      "task:T1",
      "task:T2",
      "task:verify-end-to-end",
      "deps:T2:task-id:T1",
      "deps:verify-end-to-end:task-id:T2",
    ]);
    expect(result.docs.map((doc) => doc.id)).toEqual([
      "doc-id:plan-doc",
      "doc-id:success-criteria-doc",
      "doc-id:prototype-1-doc",
      "doc-id:boilerplate-2-doc",
    ]);
    expect(result.tasks.map((task) => task.id)).toEqual([
      "task-id:T1",
      "task-id:T2",
      "task-id:verify-end-to-end",
    ]);
    expect(result.artifacts).toEqual([
      {
        id: "artifact-id:prototype:PlanningWorkbench.tsx",
        kind: "prototype",
        path: "apps/web/src/features/acp/PlanningWorkbench.tsx",
        title: "PlanningWorkbench.tsx",
        traceId: "trace-789",
        sourcePlanId: "plan-123",
      },
      {
        id: "artifact-id:boilerplate:planning.controller.ts",
        kind: "boilerplate",
        path: "apps/server/src/planning/planning.controller.ts",
        title: "planning.controller.ts",
        traceId: "trace-789",
        sourcePlanId: "plan-123",
      },
    ]);
    expect(result.dependencyUpdates).toEqual([
      {
        taskClientKey: "T2",
        taskId: "task-id:T2",
        blockedByClientKeys: ["T1"],
        blockedByTaskIds: ["task-id:T1"],
      },
      {
        taskClientKey: "verify-end-to-end",
        taskId: "task-id:verify-end-to-end",
        blockedByClientKeys: ["T2"],
        blockedByTaskIds: ["task-id:T2"],
      },
    ]);
  });

  test("preserves explicit verification tasks without adding a self dependency", () => {
    const breakdown = buildApprovedPlanBreakdown({
      planId: "plan-explicit-verify",
      traceId: "trace-explicit-verify",
      approvedPlanMarkdown: [
        "# Manual Smoke Workflow",
        "",
        "## Tasks",
        "- [context] Preserve freeform context",
        "  Depends on: none",
        "- [planning] Build prototype-first planning flow",
        "  Depends on: context",
        "- [execution] Execute dependency-aware task run",
        "  Depends on: planning",
        "- [verify-end-to-end] Prove final UI/API path",
        "  Depends on: execution",
      ].join("\n"),
    });

    expect(breakdown.taskDrafts.map((task) => task.clientKey)).toEqual([
      "context",
      "planning",
      "execution",
      "verify-end-to-end",
    ]);
    expect(breakdown.dependencyUpdates).toContainEqual({
      taskClientKey: "verify-end-to-end",
      blockedByClientKeys: ["execution"],
    });
    expect(breakdown.dependencyUpdates).not.toContainEqual({
      taskClientKey: "verify-end-to-end",
      blockedByClientKeys: ["verify-end-to-end"],
    });
    expect(breakdown.taskDrafts.find((task) => task.clientKey === "verify-end-to-end")?.successCriteria.map((criterion) => criterion.text)).toEqual([
      "Verify the full plan end-to-end against all success criteria and approved artifacts.",
    ]);
  });
});
