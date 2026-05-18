import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "user-planning-freeform-trpc";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

const input = {
  userPrompt: "Plan the implementation",
  selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  traceId: "trace-freeform-trpc",
  projectId: PROJECT_ID,
  maxDocChars: 2500,
};

const startInput = {
  title: "Freeform work brief",
  bodyMd: "Prototype before planning docs.",
  userPrompt: "Turn this into an ACP planning session.",
  traceId: "trace-freeform-start-trpc",
  projectId: PROJECT_ID,
  acpSessionId: "acp-session-trpc",
  modeId: "planning",
  modelId: "gpt-5.4",
  maxDocChars: 2400,
};

const guidedAcpInput = {
  acpSessionId: "acp-guided-session-trpc",
  agentName: "codex",
  cwd: "/repo",
  userPrompt: "Plan the guided ACP session.",
  promptTemplateId: "prototype-first",
  selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  traceId: "trace-guided-acp-trpc",
  projectId: PROJECT_ID,
  modeId: "planning",
  modelId: "gpt-5.5",
  permissionMode: "review_each_tool" as const,
  maxDocChars: 1200,
};

const continuousUpdateInput = {
  trigger: "acp_session_update" as const,
  userPrompt: "Replan from the updated ACP session.",
  traceId: "trace-continuous-trpc",
  projectId: PROJECT_ID,
  acpSessionId: "acp-continuous-trpc",
  modeId: "planning",
  modelId: "gpt-5.5",
  selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  targetTaskIds: ["task-1", "task-2"],
  changedDocs: [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    bodyMd: "Updated ACP/freeform context.",
  }],
  maxDocChars: 1600,
};

const technicalPlanningInput = {
  source: "freeform_docs" as const,
  userPrompt: "Plan the generated workflow.",
  selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  traceId: "trace-technical-planning-trpc",
  projectId: PROJECT_ID,
  planId: "technical-plan-trpc",
  reviewId: "technical-review-trpc",
  prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
  boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
  successCriteria: ["Prototype and boilerplate artifacts are visible before approval."],
  taskSeeds: [{
    clientKey: "T1",
    title: "Generate technical plan",
    success: "Trace IDs are preserved.",
  }],
  maxDocChars: 1600,
};

const output = {
  traceId: "trace-freeform-trpc",
  context: {
    traceId: "trace-freeform-trpc",
    sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    selectedDocs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Brief",
      breadcrumb: "Brief",
      bodyMd: "Prototype first.",
      truncated: false,
    }],
    contextMarkdown: "## Freeform Document: Brief\n- doc_id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\n\nPrototype first.",
  },
  prompt: "Use docs\n\nPrototype first.\n\nsubmit_plan",
};

const startOutput = {
  status: "ready_for_planning" as const,
  traceId: "trace-freeform-start-trpc",
  eventId: "event-freeform-start",
  document: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    orgId: ORG_ID,
    title: "Freeform work brief",
    slug: "freeform-work-brief",
    parentId: null,
    projectId: PROJECT_ID,
    scope: "project" as const,
    docType: "scratch" as const,
    frontmatter: {
      workflowKind: "freeform_work_intake",
      traceId: "trace-freeform-start-trpc",
    },
    bodyMd: "Prototype before planning docs.",
    contentJson: {},
    sortPosition: 0,
    archived: false,
    externalId: null,
    updatedAt: new Date("2026-05-13T00:00:00.000Z"),
  },
  context: {
    traceId: "trace-freeform-start-trpc",
    sourceRefs: [{ kind: "doc" as const, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
    selectedDocs: [{
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Freeform work brief",
      breadcrumb: "Freeform work brief",
      bodyMd: "Prototype before planning docs.",
      truncated: false,
    }],
    contextMarkdown: "## Freeform Document: Freeform work brief\n\nPrototype before planning docs.",
  },
  prompt: "Turn this into an ACP planning session.\n\nsubmit_plan",
};

const guidedAcpOutput = {
  status: "ready_for_acp_prompt" as const,
  traceId: "trace-guided-acp-trpc",
  eventId: "event-guided-acp-start",
  session: {
    acpSessionId: "acp-guided-session-trpc",
    agentName: "codex",
    cwd: "/repo",
    promptTemplateId: "prototype-first",
    projectId: PROJECT_ID,
    traceId: "trace-guided-acp-trpc",
    modeId: "planning",
    modelId: "gpt-5.5",
    permissionMode: "review_each_tool" as const,
    availableModes: [{ id: "planning", name: "Planning", description: "Plan first" }],
    availableModels: [{ modelId: "gpt-5.5", name: "gpt-5.5" }],
  },
  permissionOptions: [
    { optionId: "allow_once", kind: "allow", name: "Allow once" },
    { optionId: "allow_session", kind: "allow", name: "Allow for session" },
    { optionId: "deny", kind: "reject", name: "Deny" },
  ],
  traffic: {
    entries: [{
      id: "traffic-1",
      timestamp: 1,
      direction: "out" as const,
      type: "request" as const,
      method: "session/new",
      requestId: 1,
      payload: { cwd: "/repo" },
    }],
  },
  context: {
    traceId: "trace-guided-acp-trpc",
    sourceRefs: [{ kind: "doc" as const, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    selectedDocs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Brief",
      breadcrumb: "Brief",
      bodyMd: "Prototype first.",
      truncated: false,
    }],
    contextMarkdown: "## Freeform Document: Brief\n\nPrototype first.",
  },
  prompt: "Plan the guided ACP session.\n\nACP guided session\n\nsubmit_plan",
};

const continuousUpdateOutput = {
  status: "ready_for_replanning" as const,
  trigger: "acp_session_update" as const,
  eventId: "event-continuous-trpc",
  traceId: "trace-continuous-trpc",
  acpSessionId: "acp-continuous-trpc",
  modeId: "planning",
  modelId: "gpt-5.5",
  targetTaskIds: ["task-1", "task-2"],
  changedDocs: [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    orgId: ORG_ID,
    title: "Brief",
    slug: "brief",
    parentId: null,
    projectId: PROJECT_ID,
    scope: "project" as const,
    docType: "scratch" as const,
    frontmatter: {
      workflowKind: "continuous_update_replan",
      traceId: "trace-continuous-trpc",
    },
    bodyMd: "Updated ACP/freeform context.",
    contentJson: {},
    sortPosition: 0,
    archived: false,
    externalId: null,
    updatedAt: new Date("2026-05-13T00:00:00.000Z"),
  }],
  context: {
    traceId: "trace-continuous-trpc",
    sourceRefs: [{ kind: "doc" as const, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    selectedDocs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Brief",
      breadcrumb: "Brief",
      bodyMd: "Updated ACP/freeform context.",
      truncated: false,
    }],
    contextMarkdown: "## Freeform Document: Brief\n\nUpdated ACP/freeform context.",
  },
  prompt: "Replan from the updated ACP session.\n\nContinuous update / replanning cycle\n\nsubmit_plan",
};

const technicalPlanningOutput = {
  status: "ready_for_plan_review" as const,
  traceId: "trace-technical-planning-trpc",
  eventId: "event-technical-planning-trpc",
  context: {
    traceId: "trace-technical-planning-trpc",
    sourceRefs: [{ kind: "doc" as const, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    selectedDocs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Brief",
      breadcrumb: "Brief",
      bodyMd: "Prototype first.",
      truncated: false,
    }],
    contextMarkdown: "## Freeform Document: Brief\n\nPrototype first.",
  },
  prompt: "Plan the generated workflow.\n\nsubmit_plan",
  reviewPrompt: "Review this generated technical plan before materializing tasks.\nTrace ID: trace-technical-planning-trpc",
  plan: {
    planId: "technical-plan-trpc",
    reviewId: "technical-review-trpc",
    title: "Plan the generated workflow",
    traceId: "trace-technical-planning-trpc",
    source: "freeform_docs" as const,
    markdown: "# Plan the generated workflow\n\n## Prototype / Boilerplate\n- [prototype] apps/web/src/routes/planning/workbench-prototype.tsx\n\n## Tasks\n- [T1] Generate technical plan",
    prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
    boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
    sourceDocRefs: [{ kind: "doc" as const, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
  },
  breakdown: {
    title: "Plan the generated workflow",
    docs: [],
    artifacts: [{
      kind: "prototype" as const,
      path: "apps/web/src/routes/planning/workbench-prototype.tsx",
      title: "workbench-prototype.tsx",
      traceId: "trace-technical-planning-trpc",
      sourcePlanId: "technical-plan-trpc",
    }],
    successCriteria: [],
    taskDrafts: [{
      clientKey: "T1",
      input: {
        title: "Generate technical plan",
        descriptionText: "Trace IDs are preserved.",
        taskType: "task" as const,
      },
      blockedByClientKeys: [],
      successCriteria: [],
      artifactPaths: [],
      sourcePlanId: "technical-plan-trpc",
      traceId: "trace-technical-planning-trpc",
    }],
    dependencyUpdates: [],
    warnings: [],
  },
};

const buildFreeformPlanningPromptFromDocs = mock(async (
  _em: unknown,
  _ctx: unknown,
  _input: typeof input,
): Promise<typeof output> => output);
const startFreeformWorkFromDocs = mock(async (
  _em: unknown,
  _ctx: unknown,
  _input: typeof startInput,
): Promise<typeof startOutput> => startOutput);
const startGuidedAcpPlanningSession = mock(async (
  _em: unknown,
  _ctx: unknown,
  _input: typeof guidedAcpInput,
): Promise<typeof guidedAcpOutput> => guidedAcpOutput);
const restartPlanningCycleFromUpdates = mock(async (
  _em: unknown,
  _ctx: unknown,
  _input: typeof continuousUpdateInput,
): Promise<typeof continuousUpdateOutput> => continuousUpdateOutput);
const generateTechnicalPlanningCycle = mock(async (
  _em: unknown,
  _ctx: unknown,
  _input: typeof technicalPlanningInput,
): Promise<typeof technicalPlanningOutput> => technicalPlanningOutput);

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  buildFreeformPlanningPromptFromDocs.mockClear();
  startFreeformWorkFromDocs.mockClear();
  startGuidedAcpPlanningSession.mockClear();
  restartPlanningCycleFromUpdates.mockClear();
  generateTechnicalPlanningCycle.mockClear();
});

async function caller() {
  const { __setPlanningApplicationForTest } = await import("@fulcrum/server/trpc/routers/planning.ts");
  restoreApplication = __setPlanningApplicationForTest({
    buildFreeformPlanningPromptFromDocs,
    startFreeformWorkFromDocs,
    startGuidedAcpPlanningSession,
    restartPlanningCycleFromUpdates,
    generateTechnicalPlanningCycle,
  } as never);
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(createContext({
    session: {
      id: "session-planning-freeform",
      token: "session-planning-freeform",
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
    em: { marker: "planning-freeform-em" } as never,
    container: null,
  }));
}

describe("planning freeform-doc tRPC adapter", () => {
  test("delegates persisted freeform doc context building to application code with project context", async () => {
    const trpc = await caller();
    const result = await (trpc.planning as unknown as {
      buildFreeformDocsPlanningPrompt: (payload: typeof input) => Promise<typeof output>;
    }).buildFreeformDocsPlanningPrompt(input);

    expect(result).toEqual(output);
    expect(buildFreeformPlanningPromptFromDocs).toHaveBeenCalledTimes(1);
    const [em, appCtx, receivedInput] = buildFreeformPlanningPromptFromDocs.mock.calls[0] as unknown as [
      { marker: string },
      { orgId: string; userId: string; projectId: string | null },
      typeof input,
    ];
    expect(em.marker).toBe("planning-freeform-em");
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(receivedInput).toEqual(input);
  });

  test("delegates freeform work start to application code with project context", async () => {
    const trpc = await caller();
    const result = await (trpc.planning as unknown as {
      startFreeformWorkFromDocs: (payload: typeof startInput) => Promise<typeof startOutput>;
    }).startFreeformWorkFromDocs(startInput);

    expect(result).toEqual(startOutput);
    expect(startFreeformWorkFromDocs).toHaveBeenCalledTimes(1);
    const [em, appCtx, receivedInput] = startFreeformWorkFromDocs.mock.calls[0] as unknown as [
      { marker: string },
      { orgId: string; userId: string; projectId: string | null },
      typeof startInput,
    ];
    expect(em.marker).toBe("planning-freeform-em");
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(receivedInput).toEqual(startInput);
  });

  test("delegates guided ACP planning start to application code with project context", async () => {
    const trpc = await caller();
    const result = await (trpc.planning as unknown as {
      startGuidedAcpPlanningSession: (payload: typeof guidedAcpInput) => Promise<typeof guidedAcpOutput>;
    }).startGuidedAcpPlanningSession(guidedAcpInput);

    expect(result).toEqual(guidedAcpOutput);
    expect(startGuidedAcpPlanningSession).toHaveBeenCalledTimes(1);
    const [em, appCtx, receivedInput] = startGuidedAcpPlanningSession.mock.calls[0] as unknown as [
      { marker: string },
      { orgId: string; userId: string; projectId: string | null },
      typeof guidedAcpInput,
    ];
    expect(em.marker).toBe("planning-freeform-em");
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(receivedInput).toEqual(guidedAcpInput);
  });

  test("delegates continuous planning updates to application code with project context", async () => {
    const trpc = await caller();
    const result = await (trpc.planning as unknown as {
      restartPlanningCycleFromUpdates: (payload: typeof continuousUpdateInput) => Promise<typeof continuousUpdateOutput>;
    }).restartPlanningCycleFromUpdates(continuousUpdateInput);

    expect(result).toEqual(continuousUpdateOutput);
    expect(restartPlanningCycleFromUpdates).toHaveBeenCalledTimes(1);
    const [em, appCtx, receivedInput] = restartPlanningCycleFromUpdates.mock.calls[0] as unknown as [
      { marker: string },
      { orgId: string; userId: string; projectId: string | null },
      typeof continuousUpdateInput,
    ];
    expect(em.marker).toBe("planning-freeform-em");
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(receivedInput).toEqual(continuousUpdateInput);
  });

  test("delegates technical planning generation to application code with project context", async () => {
    const trpc = await caller();
    const result = await (trpc.planning as unknown as {
      generateTechnicalPlanningCycle: (payload: typeof technicalPlanningInput) => Promise<typeof technicalPlanningOutput>;
    }).generateTechnicalPlanningCycle(technicalPlanningInput);

    expect(result).toEqual(technicalPlanningOutput);
    expect(generateTechnicalPlanningCycle).toHaveBeenCalledTimes(1);
    const [em, appCtx, receivedInput] = generateTechnicalPlanningCycle.mock.calls[0] as unknown as [
      { marker: string },
      { orgId: string; userId: string; projectId: string | null },
      typeof technicalPlanningInput,
    ];
    expect(em.marker).toBe("planning-freeform-em");
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(receivedInput).toEqual(technicalPlanningInput);
  });
});
