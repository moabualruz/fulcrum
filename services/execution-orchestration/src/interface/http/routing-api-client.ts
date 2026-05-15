export interface RoutingApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface RoutingApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createRoutingApiCaller(options: RoutingApiClientOptions) {
  const request = routingRequest(options);
  return {
    routing: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/routing/rules", { method: "GET", query: routingQuery(options, input) }),
      get: async (input: JsonRecord) =>
        await request(`/api/v1/routing/rules/${encodeURIComponent(requiredInput(input, "id"))}`, {
          method: "GET",
          query: routingQuery(options, {}),
        }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/routing/rules/create", { method: "POST", body: routingBody(options, input) }),
      update: async (input: JsonRecord) =>
        await request(`/api/v1/routing/rules/${encodeURIComponent(requiredInput(input, "id"))}/update`, {
          method: "POST",
          body: routingBody(options, without(input, "id")),
        }),
      delete: async (input: JsonRecord) =>
        await request(`/api/v1/routing/rules/${encodeURIComponent(requiredInput(input, "id"))}/delete`, {
          method: "POST",
          body: routingBody(options, {}),
        }),
      dryRun: async (input: JsonRecord) =>
        await request("/api/v1/routing/dry-run", { method: "POST", body: routingBody(options, input) }),
      test: async (input: JsonRecord) =>
        await request("/api/v1/routing/test", { method: "POST", body: routingBody(options, input) }),
      updateLlmGate: async (input: JsonRecord) =>
        await request("/api/v1/routing/config/llm-gate", { method: "POST", body: routingBody(options, input) }),
      listDrafts: async (input: JsonRecord = {}) =>
        await request("/api/v1/routing/drafts", { method: "GET", query: routingQuery(options, input) }),
      updateDraft: async (input: JsonRecord) =>
        await request(`/api/v1/routing/drafts/${encodeURIComponent(requiredInput(input, "draftId"))}/update`, {
          method: "POST",
          body: routingBody(options, without(input, "draftId")),
        }),
      approveDraft: async (input: JsonRecord) =>
        await request(`/api/v1/routing/drafts/${encodeURIComponent(requiredInput(input, "draftId"))}/approve`, {
          method: "POST",
          body: routingBody(options, {}),
        }),
      deleteDraft: async (input: JsonRecord) =>
        await request(`/api/v1/routing/drafts/${encodeURIComponent(requiredInput(input, "draftId"))}/delete`, {
          method: "POST",
          body: routingBody(options, {}),
        }),
    },
  };
}

export function createRoutingApiCallerFromEnv(
  env: RoutingApiEnvironment = process.env as unknown as RoutingApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createRoutingApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function routingRequest(options: RoutingApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
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

function routingQuery(options: RoutingApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
    ...input,
  });
}

function routingBody(options: RoutingApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
    ...input,
  });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function without(input: JsonRecord, key: string): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([entryKey]) => entryKey !== key));
}

function requiredInput(input: JsonRecord, key: string): string {
  const value = input[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Routing API request failed with ${status}.`;
}
