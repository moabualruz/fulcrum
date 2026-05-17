export interface RelationshipApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface RelationshipApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createRelationshipApiCaller(options: RelationshipApiClientOptions) {
  const request = relationshipRequest(options);
  return {
    relationships: {
      create: async (input: JsonRecord) =>
        await request("/api/v1/relationships/create", { method: "POST", body: relationshipBody(options, input) }),
      delete: async (input: JsonRecord) =>
        await request("/api/v1/relationships/delete", { method: "POST", body: relationshipBody(options, input) }),
      listForTask: async (input: JsonRecord) =>
        await request("/api/v1/relationships/list-for-task", { method: "POST", body: relationshipBody(options, input) }),
      blockers: async (input: JsonRecord) =>
        await request("/api/v1/relationships/blockers", { method: "POST", body: relationshipBody(options, input) }),
      blockedItems: async (input: JsonRecord) =>
        await request("/api/v1/relationships/blocked-items", { method: "POST", body: relationshipBody(options, input) }),
      listBlockedBy: async (input: JsonRecord) =>
        await request("/api/v1/relationships/list-blocked-by", { method: "POST", body: relationshipBody(options, input) }),
      markAsDuplicate: async (input: JsonRecord) =>
        await request("/api/v1/relationships/mark-as-duplicate", { method: "POST", body: relationshipBody(options, input) }),
      summary: async (input: JsonRecord) =>
        await request("/api/v1/relationships/summary", { method: "POST", body: relationshipBody(options, input) }),
    },
  };
}

export function createRelationshipApiCallerFromEnv(
  env: RelationshipApiEnvironment = process.env as unknown as RelationshipApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createRelationshipApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function relationshipRequest(options: RelationshipApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
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

function relationshipBody(options: RelationshipApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Relationship API request failed with ${status}.`;
}
