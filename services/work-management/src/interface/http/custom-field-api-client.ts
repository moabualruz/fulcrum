export interface CustomFieldApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface CustomFieldApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createCustomFieldApiCaller(options: CustomFieldApiClientOptions) {
  const request = customFieldRequest(options);
  const customFields = {
    list: async (input: JsonRecord = {}) =>
      await request("/api/v1/custom-fields", { method: "GET", query: scopedQuery(options, input) }),
    create: async (input: JsonRecord) =>
      await request("/api/v1/custom-fields", { method: "POST", body: scopedBody(options, input) }),
    update: async (input: JsonRecord) =>
      await request(`/api/v1/custom-fields/${encodeURIComponent(requiredInput(input, "id"))}`, {
        method: "PATCH",
        body: scopedBody(options, without(input, "id")),
      }),
    delete: async (input: JsonRecord) =>
      await request(`/api/v1/custom-fields/${encodeURIComponent(requiredInput(input, "id"))}`, {
        method: "DELETE",
        query: scopedQuery(options, {}),
      }),
    reorder: async (input: JsonRecord) =>
      await request("/api/v1/custom-fields/reorder", { method: "POST", body: scopedBody(options, input) }),
  };
  return {
    customFields,
    custom_fields: customFields,
    customFieldDefs: {
      list: customFields.list,
    },
    taskCustomFields: {
      set: async (input: JsonRecord) =>
        await request("/api/v1/task-custom-fields/set", { method: "POST", body: scopedBody(options, input) }),
      clear: async (input: JsonRecord) =>
        await request("/api/v1/task-custom-fields/clear", { method: "POST", body: scopedBody(options, input) }),
    },
  };
}

export function createCustomFieldApiCallerFromEnv(
  env: CustomFieldApiEnvironment = process.env as unknown as CustomFieldApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createCustomFieldApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function customFieldRequest(options: CustomFieldApiClientOptions) {
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

function scopedQuery(options: CustomFieldApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function scopedBody(options: CustomFieldApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Custom field API request failed with ${status}.`;
}
