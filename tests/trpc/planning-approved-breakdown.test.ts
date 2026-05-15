import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type {
  ApprovedPlanBreakdown,
  ApprovedPlanMaterializationResult,
  BuildApprovedPlanBreakdownInput,
} from "@planning-review/application/approved-plan-breakdown.ts";
import type { ApprovedPlanMaterializeResult } from "@planning-review/application/approved-plan-actions.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "user-planning-trpc";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

const input: BuildApprovedPlanBreakdownInput = {
  planId: "plan-trpc",
  reviewId: "review-trpc",
  traceId: "trace-trpc",
  projectId: PROJECT_ID,
  cycleId: "cycle-trpc",
  moduleId: "module-trpc",
  sourceDocRefs: [{ kind: "doc", id: "freeform-source" }],
  approvedPlanMarkdown: `# Build ACP Planning Workbench

## Success Criteria
- Planning route is shared by web, CLI, and TUI.

## Tasks
- [T1] Persist planning docs
  Depends on: none
  Success: Plan docs are persisted through the shared server adapter.
`,
};

const breakdown: ApprovedPlanBreakdown = {
  title: "Build ACP Planning Workbench",
  docs: [{
    clientKey: "plan-doc",
    input: {
      title: "Build ACP Planning Workbench",
      bodyMd: input.approvedPlanMarkdown,
      projectId: PROJECT_ID,
      scope: "project",
      docType: "spec",
      source: { kind: "plan", id: "plan-trpc" },
      links: [{ kind: "doc", id: "freeform-source", targetKind: "doc", targetId: "freeform-source", linkKind: "mention" }],
      frontmatter: { planId: "plan-trpc", traceId: "trace-trpc" },
    },
  }],
  artifacts: [],
  successCriteria: [{
    id: "plan-trpc:plan:1",
    text: "Planning route is shared by web, CLI, and TUI.",
    scope: "plan",
    traceId: "trace-trpc",
  }],
  taskDrafts: [{
    clientKey: "T1",
    input: {
      title: "Persist planning docs",
      descriptionText: "Plan docs are persisted through the shared server adapter.",
      projectId: PROJECT_ID,
      taskType: "task",
      cycleId: "cycle-trpc",
      moduleId: "module-trpc",
    },
    blockedByClientKeys: [],
    successCriteria: [],
    artifactPaths: [],
    sourcePlanId: "plan-trpc",
    traceId: "trace-trpc",
  }],
  dependencyUpdates: [],
  warnings: [],
};

const materialization: ApprovedPlanMaterializationResult = {
  docs: [{ clientKey: "plan-doc", id: "doc-created" }],
  artifacts: [],
  tasks: [{ clientKey: "T1", id: "task-created" }],
  dependencyUpdates: [],
};

const previewApprovedPlanBreakdown = mock(async (
  _input: BuildApprovedPlanBreakdownInput,
): Promise<ApprovedPlanBreakdown> => breakdown);
const materializeApprovedPlanBreakdown = mock(async (
  _em: unknown,
  _ctx: unknown,
  _input: BuildApprovedPlanBreakdownInput,
): Promise<ApprovedPlanMaterializeResult> => ({ breakdown, materialization }));

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  previewApprovedPlanBreakdown.mockClear();
  materializeApprovedPlanBreakdown.mockClear();
});

async function caller() {
  const { __setPlanningApplicationForTest } = await import("@fulcrum/server/runtime/trpc/routers/planning.ts");
  restoreApplication = __setPlanningApplicationForTest({
    previewApprovedPlanBreakdown,
    materializeApprovedPlanBreakdown,
  });
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(createContext({
    session: {
      id: "session-planning",
      token: "session-planning",
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
    em: { marker: "planning-em" } as never,
    container: null,
  }));
}

describe("planning approved-plan tRPC adapter", () => {
  test("preview exposes approved plan breakdown through the shared app router", async () => {
    const trpc = await caller();
    const result = await trpc.planning.previewApprovedPlanBreakdown(input);

    expect(result.taskDrafts.map((task) => task.clientKey)).toEqual(["T1"]);
    expect(previewApprovedPlanBreakdown).toHaveBeenCalledWith(input);
  });

  test("materialize delegates persistence to application code with project-scoped context", async () => {
    const trpc = await caller();
    const result = await trpc.planning.materializeApprovedPlanBreakdown(input);

    expect(result).toEqual({ breakdown, materialization });
    expect(materializeApprovedPlanBreakdown).toHaveBeenCalledTimes(1);
    const [em, appCtx, receivedInput] = materializeApprovedPlanBreakdown.mock.calls[0] as unknown as [
      { marker: string },
      { orgId: string; userId: string; projectId: string | null },
      typeof input,
    ];
    expect(em.marker).toBe("planning-em");
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(receivedInput).toEqual(input);
  });
});
