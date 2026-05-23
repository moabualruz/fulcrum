export interface AgentRunApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface AgentRunApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId?: string | null;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface AgentRunListInput {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AgentRunDispatchInput {
  projectId?: string;
  taskId?: string;
  agent?: string;
  agentName?: string;
  traceId?: string;
  dependencyTree?: string[];
}

export function createAgentRunApiCaller(options: AgentRunApiClientOptions) {
  const request = agentRunRequest(options);
  const runs = {
    list: async (input: AgentRunListInput = {}) =>
      await request<unknown[]>("/api/v1/runs", { query: { ...input } }),
    get: async (input: { id: string }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}`),
    dispatch: async (input: AgentRunDispatchInput) =>
      await request("/api/v1/runs", {
        method: "POST",
        body: {
          projectId: input.projectId,
          taskId: input.taskId,
          agent: input.agent ?? input.agentName,
          traceId: input.traceId,
          dependencyTree: input.dependencyTree,
        },
      }),
    cancel: async (input: { id: string }) =>
      await request<{ ok: true }>(`/api/v1/runs/${encodeURIComponent(input.id)}/cancel`, { method: "POST" }),
    retry: async (input: { id: string }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}/retry`, { method: "POST" }),
    pageData: async (input: Record<string, unknown> = {}) =>
      await request("/api/v1/runs/page-data", {
        query: compact({
          contextProjectId: input.contextProjectId,
          filterProjectId: input.filterProjectId ?? input.projectId,
          hasProjectFilter: input.hasProjectFilter,
          range: input.range,
          agent: input.agent,
          status: input.status,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        }),
      }),
    projectRuns: async (input: { projectId: string }) =>
      await request("/api/v1/runs/project", { query: { projectId: input.projectId } }),
    pageDetail: async (input: { id: string; projectId?: string | null }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}/page-data`, {
        query: compact({ projectId: input.projectId }),
      }),
    dispatchPrompt: async (input: { projectId?: string | null; agentName: string; prompt: string }) =>
      await request("/api/v1/runs/prompt-dispatch", {
        method: "POST",
        body: {
          orgId: options.orgId,
          userId: options.userId ?? null,
          projectId: input.projectId ?? null,
          agentName: input.agentName,
          prompt: input.prompt,
        },
      }),
    recordApprovalDecision: async (input: {
      id: string;
      projectId?: string | null;
      approvalId: string;
      decision: "approve" | "deny" | "request_info";
      note?: string | null;
    }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}/approval-decision`, {
        method: "POST",
        body: {
          orgId: options.orgId,
          userId: options.userId ?? null,
          projectId: input.projectId ?? null,
          approvalId: input.approvalId,
          decision: input.decision,
          note: input.note ?? null,
        },
      }),
    archiveArtifact: async (input: { id: string; artifactId: string; projectId?: string | null }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}/artifacts/${encodeURIComponent(input.artifactId)}/archive`, {
        method: "POST",
        body: { orgId: options.orgId, userId: options.userId ?? null, projectId: input.projectId ?? null },
      }),
    linkArtifactToDoc: async (input: { id: string; artifactId: string; docId: string; projectId?: string | null }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}/artifacts/${encodeURIComponent(input.artifactId)}/link-doc`, {
        method: "POST",
        body: {
          orgId: options.orgId,
          userId: options.userId ?? null,
          projectId: input.projectId ?? null,
          docId: input.docId,
        },
      }),
    promoteArtifactToMemory: async (input: { id: string; artifactId: string; projectId?: string | null }) =>
      await request(`/api/v1/runs/${encodeURIComponent(input.id)}/artifacts/${encodeURIComponent(input.artifactId)}/promote-memory`, {
        method: "POST",
        body: { orgId: options.orgId, userId: options.userId ?? null, projectId: input.projectId ?? null },
      }),
    status: async () =>
      await request("/api/v1/symphony/state"),
    refresh: async () =>
      await request<{ runs: unknown[]; count: number }>("/api/v1/symphony/refresh", { method: "POST" }),
  };
  return {
    runs,
    agent_runs: {
      list: runs.list,
      get: runs.get,
      create: runs.dispatch,
      cancel: runs.cancel,
      retry: runs.retry,
    },
    orchestration: {
      getRun: async (input: { runId: string }) => await runs.get({ id: input.runId }),
      fetchCandidateIssues: async (input: { orgId?: string; limit: number }) =>
        normalizeCandidates(await request<unknown[]>("/api/v1/symphony/candidates", {
          query: { orgId: input.orgId, limit: input.limit },
        })),
      fetchIssuesByStates: async (input: { orgId?: string; states: string[]; limit: number }) =>
        normalizeIssues(await request<unknown[]>("/api/v1/symphony/issues", {
          query: { orgId: input.orgId, states: input.states.join(","), limit: input.limit },
        })),
      dispatchRun: async (input: { taskId: string; agentName?: string; projectId?: string; traceId?: string }) =>
        await runs.dispatch(input),
    },
  };
}

export function createAgentRunApiCallerFromEnv(
  env: AgentRunApiEnvironment = process.env as unknown as AgentRunApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createAgentRunApiCaller({ baseUrl, orgId, userId: env.FULCRUM_USER_ID ?? null, fetch: fetchFn });
}

function agentRunRequest(options: AgentRunApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T>(
    path: string,
    init: { method?: string; query?: Record<string, unknown>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    url.searchParams.set("orgId", options.orgId);
    if (options.userId) url.searchParams.set("userId", options.userId);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

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
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function normalizeCandidates(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    return {
      ...record,
      createdAt: dateValue(record["createdAt"]),
    };
  });
}

function normalizeIssues(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    const task = record["task"] && typeof record["task"] === "object"
      ? {
        ...(record["task"] as Record<string, unknown>),
        createdAt: dateValue((record["task"] as Record<string, unknown>)["createdAt"]),
      }
      : record["task"];
    return {
      ...record,
      task,
      startedAt: dateValue(record["startedAt"]),
      nextRetryAt: record["nextRetryAt"] ? dateValue(record["nextRetryAt"]) : null,
    };
  });
}

function dateValue(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return new Date(0);
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Agent-run API request failed with ${status}.`;
}
