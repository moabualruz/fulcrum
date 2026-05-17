import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type {
  WorkflowAcceptanceCycleInput,
  WorkflowAcceptanceCycleResult,
} from "@workflow-coordination/application/workflow-acceptance-cycle.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "user-workflows-trpc";

const cycleInput: WorkflowAcceptanceCycleInput = {
  workspace: {
    id: "workspace-workflow-trpc",
    slug: "workflow-trpc",
    name: "Workflow tRPC",
  },
  project: {
    id: "project-workflow-trpc",
    slug: "workflow-trpc",
    name: "Workflow tRPC",
    traceId: "trace-workflow-trpc",
  },
  freeform: {
    documentId: "doc-workflow-trpc",
    title: "Workflow tRPC brief",
    bodyMd: "Run a full acceptance cycle through tRPC.",
    userPrompt: "Plan, execute, review, approve, and codify.",
  },
  guidedPlanning: {
    acpSessionId: "acp-workflow-trpc",
    agentName: "codex",
    cwd: "/repo",
    modeId: "planning",
    modelId: "gpt-5.5",
    permissionMode: "review_each_tool",
  },
  approvedPlan: {
    planId: "plan-workflow-trpc",
    reviewId: "review-workflow-trpc",
    markdown: "# Workflow tRPC plan",
  },
  execution: {
    agent: "codex",
    prompt: "Run dependency tree.",
    lifecycleSummary: "Dependency tree completed.",
    qaReviewText: "### Verdict: APPROVE\nApproved.",
  },
  uat: {
    decision: "approve_without_manual_review",
    reviewType: "uat",
    e2eRunner: "bun",
  },
};

const cycleResult = {
  traceId: "trace-workflow-trpc",
  finalQa: {
    projectId: "project-workflow-trpc",
    traceId: "trace-workflow-trpc",
    status: "passed",
    readyForUserAcceptance: true,
    nextAction: "prompt_uat_code_review",
    summary: {
      taskCount: 1,
      docCount: 1,
      runCount: 1,
      artifactCount: 0,
      successCriteriaCount: 1,
      approvedTaskCount: 1,
      blockedTaskCount: 0,
      openFeedbackRunCount: 0,
    },
    checks: [],
    taskResults: [],
    markdown: "Final QA passed.",
  },
  generatedE2e: {
    projectId: "project-workflow-trpc",
    traceId: "trace-workflow-trpc",
    runner: "bun",
    status: "planned",
    command: ["bun", "test"],
    testFiles: ["tests/e2e/generated/workflow-trpc.test.ts"],
    artifactIds: [],
    stdout: "",
    stderr: "",
    exitCode: null,
    ciCommand: ["bun", "test"],
    ciEnv: {},
    eventId: "event-workflow-trpc",
  },
} as unknown as WorkflowAcceptanceCycleResult;

const runAcceptanceCycle = mock(async (
  _input: WorkflowAcceptanceCycleInput,
): Promise<WorkflowAcceptanceCycleResult> => cycleResult);

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  runAcceptanceCycle.mockClear();
});

async function caller() {
  const { __setWorkflowsApplicationForTest } = await import("./workflows.ts");
  restoreApplication = __setWorkflowsApplicationForTest({ runAcceptanceCycle });
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(createContext({
    session: {
      id: "session-workflows",
      token: "session-workflows",
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
    em: null,
    container: null,
  }));
}

describe("workflows tRPC adapter", () => {
  test("runAcceptanceCycle delegates the full-cycle payload to the workflow service boundary", async () => {
    const trpc = await caller();
    const result = await trpc.workflows.runAcceptanceCycle(cycleInput);

    expect(result).toEqual(cycleResult);
    expect(runAcceptanceCycle).toHaveBeenCalledTimes(1);
    expect(runAcceptanceCycle).toHaveBeenCalledWith(cycleInput);
  });
});
