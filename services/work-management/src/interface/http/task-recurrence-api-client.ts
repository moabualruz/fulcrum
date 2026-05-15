export interface TaskRecurrenceApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface TaskRecurrenceApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createTaskRecurrenceApiCaller(options: TaskRecurrenceApiClientOptions) {
  const request = taskRecurrenceRequest(options);
  return {
    recurrence: {
      list: async (input: JsonRecord) =>
        await request("/api/v1/recurrence", {
          method: "GET",
          query: scopedQuery(options, input),
        }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/recurrence", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      delete: async (input: JsonRecord) =>
        await request(`/api/v1/recurrence/${encodeURIComponent(requiredInput(input, "ruleId"))}`, {
          method: "DELETE",
          query: { orgId: options.orgId },
        }),
    },
  };
}

export function createTaskRecurrenceApiCallerFromEnv(
  env: TaskRecurrenceApiEnvironment = process.env as unknown as TaskRecurrenceApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createTaskRecurrenceApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function taskRecurrenceRequest(options: TaskRecurrenceApiClientOptions) {
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

function scopedQuery(options: TaskRecurrenceApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, ...input });
}

function scopedBody(options: TaskRecurrenceApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, ...input });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Task recurrence API request failed with ${status}.`;
}
