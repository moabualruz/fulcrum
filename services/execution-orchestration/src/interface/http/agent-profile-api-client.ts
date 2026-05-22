export interface AgentProfileApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface AgentProfileApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId?: string | null;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createAgentProfileApiCaller(options: AgentProfileApiClientOptions) {
  const request = agentProfileRequest(options);
  const context = () => compact({ orgId: options.orgId, userId: options.userId ?? undefined });
  return {
    agents: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/agents", { query: { ...context(), ...compact(input) } }),
      get: async (input: { name: string }) =>
        await request(`/api/v1/agents/${encodeURIComponent(input.name)}`, { query: context() }),
      test: async (input: { name: string }) =>
        await request("/api/v1/agents/test", {
          method: "POST",
          body: { ...context(), name: input.name },
        }),
      startGuidedPlanning: async (input: JsonRecord) =>
        await request("/api/v1/agents/planning/guided/start", {
          method: "POST",
          body: { ...context(), ...compact(input) },
        }),
      dispatchTask: async (input: JsonRecord) =>
        await request("/api/v1/agents/runs/dispatch", {
          method: "POST",
          body: { ...context(), ...compact(input) },
        }),
    },
    sessions: {
      resolvePermission: async (input: { sessionId: string; optionId: string }) =>
        await request("/api/v1/agents/sessions/permissions/resolve", { method: "POST", body: input }),
      updateTraffic: async (input: { action: string; value?: string }) =>
        await request("/api/v1/agents/sessions/traffic", { method: "POST", body: input }),
      reconnect: async () => await request("/api/v1/agents/sessions/reconnect", { method: "POST" }),
      abort: async (input: { reason?: string | null; note?: string | null }) =>
        await request("/api/v1/agents/sessions/abort", { method: "POST", body: compact(input) }),
      pause: async () => await request("/api/v1/agents/sessions/pause", { method: "POST" }),
      resume: async () => await request("/api/v1/agents/sessions/resume", { method: "POST" }),
      restoreCheckpoint: async (input: { checkpointId: string }) =>
        await request("/api/v1/agents/sessions/checkpoints/restore", { method: "POST", body: input }),
      forkFromCheckpoint: async (input: { checkpointId: string }) =>
        await request("/api/v1/agents/sessions/checkpoints/fork", { method: "POST", body: input }),
      resumeSaved: async (input: { savedSessionId: string }) =>
        await request("/api/v1/agents/sessions/saved/resume", { method: "POST", body: input }),
      deleteSaved: async (input: { savedSessionId: string }) =>
        await request("/api/v1/agents/sessions/saved/delete", { method: "POST", body: input }),
      connectBridge: async (input: JsonRecord) =>
        await request("/api/v1/agents/sessions/connect", { method: "POST", body: compact(input) }),
    },
  };
}

export function createAgentProfileApiCallerFromEnv(
  env: AgentProfileApiEnvironment = process.env as unknown as AgentProfileApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl || !env.FULCRUM_ORG_ID) return null;
  return createAgentProfileApiCaller({
    baseUrl,
    orgId: env.FULCRUM_ORG_ID,
    userId: env.FULCRUM_USER_ID ?? null,
    fetch: fetchFn,
  });
}

function agentProfileRequest(options: AgentProfileApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(compact(init.query ?? {}))) {
      url.searchParams.set(key, String(value));
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

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return `Agent profile API request failed (${status})`;
}
