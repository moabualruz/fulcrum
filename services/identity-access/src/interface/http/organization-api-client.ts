export interface OrganizationApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface OrganizationApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createOrganizationApiCaller(options: OrganizationApiClientOptions) {
  const request = organizationRequest(options);
  return {
    orgs: {
      get: async () =>
        await request("/api/v1/organizations/current", { method: "GET", query: scope(options) }),
      update: async (input: JsonRecord) =>
        await request("/api/v1/organizations/current", { method: "PATCH", body: scopedBody(options, input) }),
      members: {
        list: async () =>
          await request("/api/v1/organizations/members", { method: "GET", query: scope(options) }),
        updateRole: async (input: JsonRecord) =>
          await request(`/api/v1/organizations/members/${encodeURIComponent(requiredInput(input, "userId"))}/role`, {
            method: "PATCH",
            body: scopedBody(options, without(input, "userId")),
          }),
        remove: async (input: JsonRecord) =>
          await request(`/api/v1/organizations/members/${encodeURIComponent(requiredInput(input, "userId"))}`, {
            method: "DELETE",
            query: scope(options),
          }),
      },
    },
  };
}

export function createOrganizationApiCallerFromEnv(
  env: OrganizationApiEnvironment = process.env as unknown as OrganizationApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createOrganizationApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function organizationRequest(options: OrganizationApiClientOptions) {
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

function scope(options: OrganizationApiClientOptions): JsonRecord {
  return { orgId: options.orgId, userId: options.userId };
}

function scopedBody(options: OrganizationApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ ...scope(options), ...input });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Organization API request failed with ${status}.`;
}
