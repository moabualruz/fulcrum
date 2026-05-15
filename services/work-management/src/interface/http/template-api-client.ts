export interface TemplateApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface TemplateApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createTemplateApiCaller(options: TemplateApiClientOptions) {
  const request = templateRequest(options);
  return {
    templates: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/templates", { method: "GET", query: templateQuery(options, input) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/templates", { method: "POST", body: templateBody(options, input) }),
      applyTemplate: async (input: JsonRecord) =>
        await request(`/api/v1/templates/${encodeURIComponent(requiredInput(input, "templateId"))}/apply`, {
          method: "POST",
          body: templateBody(options, without(input, "templateId")),
        }),
      setDefault: async (input: JsonRecord) =>
        await request(`/api/v1/templates/${encodeURIComponent(requiredInput(input, "templateId"))}/default`, {
          method: "POST",
          body: templateBody(options, without(input, "templateId")),
        }),
      delete: async (input: JsonRecord) =>
        await request(`/api/v1/templates/${encodeURIComponent(requiredInput(input, "templateId"))}`, {
          method: "DELETE",
          query: templateQuery(options, {}),
        }),
    },
  };
}

export function createTemplateApiCallerFromEnv(
  env: TemplateApiEnvironment = process.env as unknown as TemplateApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createTemplateApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function templateRequest(options: TemplateApiClientOptions) {
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

function templateQuery(options: TemplateApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
    ...input,
  });
}

function templateBody(options: TemplateApiClientOptions, input: JsonRecord): JsonRecord {
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Template API request failed with ${status}.`;
}
