export interface ErrorLogApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface ErrorLogApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createErrorLogApiCaller(options: ErrorLogApiClientOptions) {
  const request = errorLogRequest(options);
  return {
    errorLogs: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/error-logs", {
          method: "GET",
          query: scopedQuery(options, input),
        }),
      get: async (input: JsonRecord) =>
        await request(`/api/v1/error-logs/${encodeURIComponent(requiredInput(input, "id"))}`, {
          method: "GET",
          query: scopedQuery(options, {}),
        }),
      clear: async () =>
        await request("/api/v1/error-logs", {
          method: "DELETE",
          query: scopedQuery(options, {}),
        }),
    },
  };
}

export function createErrorLogApiCallerFromEnv(
  env: ErrorLogApiEnvironment = process.env as unknown as ErrorLogApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createErrorLogApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function errorLogRequest(options: ErrorLogApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, queryValue(value));
    }
    const response = await fetchFn(url.toString(), {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function queryValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function scopedQuery(options: ErrorLogApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Error log API request failed with ${status}.`;
}
