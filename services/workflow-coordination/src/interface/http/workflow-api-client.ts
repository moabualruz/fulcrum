export interface WorkflowApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface WorkflowApiClientOptions {
  baseUrl: string;
  orgId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export class WorkflowApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkflowApiError";
  }
}

export function createWorkflowApiCaller(options: WorkflowApiClientOptions) {
  const request = workflowRequest(options);
  return {
    planning: {
      buildFreeformDocsPlanningPrompt: async (input: JsonRecord) =>
        await request("/workflows/planning/freeform/prompt", { method: "POST", body: input }),
      generateTechnicalPlanningCycle: async (input: JsonRecord) =>
        await request("/workflows/planning/technical-cycle/generate", { method: "POST", body: input }),
      previewApprovedPlanBreakdown: async (input: JsonRecord) =>
        await request("/workflows/planning/approved-plan/preview", { method: "POST", body: input }),
      materializeApprovedPlanBreakdown: async (input: JsonRecord) =>
        await request("/workflows/planning/approved-plan/materialize", { method: "POST", body: input }),
      recordArtifactExecution: async (input: JsonRecord) =>
        await request("/workflows/planning/artifact-execution/record", { method: "POST", body: input }),
      runArtifactExecution: async (input: JsonRecord) =>
        await request("/workflows/planning/artifact-execution/run", { method: "POST", body: input }),
      startFreeformWorkFromDocs: async (input: JsonRecord) =>
        await request("/workflows/planning/freeform/start", { method: "POST", body: input }),
      startGuidedAcpPlanningSession: async (input: JsonRecord) =>
        await request("/workflows/planning/guided-acp/start", { method: "POST", body: input }),
      recordGuidedAcpSessionAction: async (input: JsonRecord) =>
        await request("/workflows/planning/guided-acp/session-action", { method: "POST", body: input }),
      restartPlanningCycleFromUpdates: async (input: JsonRecord) =>
        await request("/workflows/planning/continuous-update/restart", { method: "POST", body: input }),
    },
    workflows: {
      getDefaultWorkflow: async (input: JsonRecord) =>
        await request("/api/v1/workflows/default", { method: "POST", body: input }),
      getEnabledTaskTypes: async (input: JsonRecord) =>
        await request("/api/v1/workflows/task-types/get", { method: "POST", body: workflowBody(options, input) }),
      updateEnabledTaskTypes: async (input: JsonRecord) =>
        await request("/api/v1/workflows/task-types/update", { method: "POST", body: workflowBody(options, input) }),
      getMethodology: async (input: JsonRecord) =>
        await request("/api/v1/workflows/methodology/get", { method: "POST", body: workflowBody(options, input) }),
      updateMethodology: async (input: JsonRecord) =>
        await request("/api/v1/workflows/methodology/update", { method: "POST", body: workflowBody(options, input) }),
      getTransitions: async (input: JsonRecord) =>
        await request("/api/v1/workflows/transitions/get", { method: "POST", body: workflowBody(options, input) }),
      updateTransitions: async (input: JsonRecord) =>
        await request("/api/v1/workflows/transitions/update", { method: "POST", body: workflowBody(options, input) }),
      validateTransition: async (input: JsonRecord) =>
        await request("/api/v1/workflows/transitions/validate", { method: "POST", body: workflowBody(options, input) }),
      runAcceptanceCycle: async (input: JsonRecord) =>
        await request("/workflows/cycles/acceptance-cycle/run", { method: "POST", body: input }),
    },
    reports: {
      reviewWorkbench: async (input: JsonRecord) =>
        await request("/workflows/review/workbench/preview", { method: "POST", body: input }),
      saveReviewWorkbenchSession: async (input: JsonRecord) =>
        await request("/workflows/review/workbench/session/save", { method: "POST", body: input }),
      loadReviewWorkbenchSession: async (input: JsonRecord) =>
        await request("/workflows/review/workbench/session/load", { method: "POST", body: input }),
      appendReviewWorkbenchAnnotation: async (input: JsonRecord) =>
        await request("/workflows/review/workbench/session/annotate", { method: "POST", body: input }),
      finalQa: async (input: JsonRecord) =>
        await request("/workflows/review/final-qa/report", { method: "POST", body: input }),
      finalQaFeedbackGate: async (input: JsonRecord) =>
        await request("/workflows/review/final-qa/feedback-gate", { method: "POST", body: input }),
      uatCodeReviewHandoff: async (input: JsonRecord) =>
        await request("/workflows/review/uat-code-review/handoff", { method: "POST", body: input }),
      recordUatCodeReviewDecision: async (input: JsonRecord) =>
        await request("/workflows/review/uat-code-review/decision/record", { method: "POST", body: input }),
      applyConfiguredUatCodeReviewDecision: async (input: JsonRecord) =>
        await request("/workflows/review/uat-code-review/decision/apply-configured", { method: "POST", body: input }),
      runGeneratedE2eRegressionTests: async (input: JsonRecord) =>
        await request("/workflows/review/generated-e2e/run", { method: "POST", body: input }),
      listGeneratedE2eRuns: async (input: JsonRecord) =>
        await request("/workflows/review/generated-e2e/history", { method: "POST", body: input }),
    },
    tasks: {
      previewDependencyRun: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/preview", { method: "POST", body: input }),
      dispatchDependencyRun: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/dispatch", { method: "POST", body: input }),
      loadDependencyRunLiveFeedback: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/live-feedback", { method: "POST", body: input }),
      dependencyRunLiveFeedback: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/live-feedback", { method: "POST", body: input }),
      recordDependencyRunLifecycleEvent: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/lifecycle-event", { method: "POST", body: input }),
      runDependencyRunWorkerTick: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/worker-tick", { method: "POST", body: input }),
      runAutomatedFeedbackLoop: async (input: JsonRecord) =>
        await request("/workflows/execution/dependency-run/automated-feedback-loop", { method: "POST", body: input }),
      recordTaskQaReview: async (input: JsonRecord) =>
        await request("/workflows/execution/qa-review/record", { method: "POST", body: input }),
      recordQaReview: async (input: JsonRecord) =>
        await request("/workflows/execution/qa-review/record", { method: "POST", body: input }),
    },
  };
}

export function createWorkflowApiCallerFromEnv(
  env: WorkflowApiEnvironment = process.env as unknown as WorkflowApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createWorkflowApiCaller({ baseUrl, orgId: env.FULCRUM_ORG_ID, fetch: fetchFn });
}

function workflowRequest(options: WorkflowApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    const response = await fetchFn(url.toString(), {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compact(init.body)) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new WorkflowApiError(extractErrorMessage(body, response.status), response.status);
    return body as T;
  };
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function workflowBody(options: WorkflowApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: input.orgId ?? options.orgId,
    ...input,
  });
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Workflow API request failed with ${status}.`;
}
