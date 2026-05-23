export interface WorkflowSettingsApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface WorkflowSettingsApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId?: string | null;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createWorkflowSettingsApiCaller(options: WorkflowSettingsApiClientOptions) {
  const request = workflowSettingsRequest(options);
  return {
    orchestration: {
      getConfig: async (input: JsonRecord = {}) =>
        await request("/api/v1/workflows/orchestration/config/get", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      saveConfig: async (input: JsonRecord) =>
        await request("/api/v1/workflows/orchestration/config/update", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      dashboard: async (input: JsonRecord = {}) =>
        await request("/api/v1/workflows/orchestration/dashboard", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      projects: async (input: JsonRecord = {}) =>
        await request("/api/v1/workflows/orchestration/projects", {
          method: "POST",
          body: scopedBody(options, input),
        }),
    },
    workflows: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/workflows/orchestration/definitions/list", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      get: async (input: JsonRecord & { id: string }) =>
        await request("/api/v1/workflows/orchestration/definitions/get", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      save: async (input: JsonRecord) =>
        await request("/api/v1/workflows/orchestration/definitions/upsert", {
          method: "POST",
          body: scopedBody(options, input),
        }),
    },
  };
}

export function createWorkflowSettingsApiCallerFromEnv(
  env: WorkflowSettingsApiEnvironment = process.env as unknown as WorkflowSettingsApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createWorkflowSettingsApiCaller({
    baseUrl,
    orgId,
    userId: env.FULCRUM_USER_ID,
    fetch: fetchFn,
  });
}

function workflowSettingsRequest(options: WorkflowSettingsApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
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

function scopedBody(options: WorkflowSettingsApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ ...input, orgId: options.orgId, userId: options.userId });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Workflow settings API request failed with ${status}.`;
}
