export interface CredentialApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface CredentialApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createCredentialApiCaller(options: CredentialApiClientOptions) {
  const request = credentialRequest(options);
  return {
    credentials: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/credentials", { method: "GET", query: scopedQuery(options, input) }),
      set: async (input: JsonRecord) =>
        await request("/api/v1/credentials", { method: "POST", body: scopedBody(options, input) }),
      get: async (input: JsonRecord) =>
        await request(`/api/v1/credentials/${encodeURIComponent(requiredInput(input, "name"))}`, {
          method: "GET",
          query: scopedQuery(options, targetQuery(input)),
        }),
      rotate: async (input: JsonRecord) =>
        await request(`/api/v1/credentials/${encodeURIComponent(requiredInput(input, "name"))}/rotate`, {
          method: "POST",
          body: scopedBody(options, { newValue: input["newValue"], ...targetQuery(input) }),
        }),
      archive: async (input: JsonRecord) =>
        await request(`/api/v1/credentials/${encodeURIComponent(requiredInput(input, "name"))}/archive`, {
          method: "POST",
          body: scopedBody(options, targetQuery(input)),
        }),
      remove: async (input: JsonRecord) =>
        await request(`/api/v1/credentials/${encodeURIComponent(requiredInput(input, "name"))}`, {
          method: "DELETE",
          query: scopedQuery(options, targetQuery(input)),
        }),
    },
  };
}

export function createCredentialApiCallerFromEnv(
  env: CredentialApiEnvironment = process.env as unknown as CredentialApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createCredentialApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function credentialRequest(options: CredentialApiClientOptions) {
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

function scopedQuery(options: CredentialApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function scopedBody(options: CredentialApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function targetQuery(input: JsonRecord): JsonRecord {
  return input["targetUserId"] ? { targetUserId: input["targetUserId"] } : {};
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Credential API request failed with ${status}.`;
}
