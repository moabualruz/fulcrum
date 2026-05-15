export interface SearchApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
  FULCRUM_API_TOKEN?: string;
  FULCRUM_PUBLIC_API_TOKEN?: string;
}

export interface SearchApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  token: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createSearchApiCaller(options: SearchApiClientOptions) {
  const request = searchRequest(options);
  return {
    search: {
      query: async (input: JsonRecord = {}) =>
        await request("/api/v1/search", { method: "GET", query: searchQuery(options, input) }),
      suggest: async (input: JsonRecord = {}) =>
        await request("/api/v1/search/suggest", { method: "GET", query: suggestQuery(options, input) }),
      savedList: async () =>
        await request("/api/v1/search/saved", {
          method: "GET",
          query: { org_id: options.orgId, user_id: options.userId },
        }),
      savedCreate: async (input: JsonRecord) =>
        await request("/api/v1/search/saved", { method: "POST", body: savedSearchBody(options, input) }),
      savedUpdate: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/search/saved/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: savedSearchBody(options, body),
        });
      },
      savedDelete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/search/saved/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: { org_id: options.orgId, user_id: options.userId },
        }),
      recordClick: async (input: JsonRecord) =>
        await request("/api/v1/search/click", { method: "POST", body: clickBody(options, input) }),
      snapshot: async (input: JsonRecord = {}) =>
        await request("/api/v1/search/snapshot", { method: "GET", query: snapshotQuery(options, input) }),
    },
  };
}

export function createSearchApiCallerFromEnv(
  env: SearchApiEnvironment = process.env as unknown as SearchApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  const token = env.FULCRUM_API_TOKEN ?? env.FULCRUM_PUBLIC_API_TOKEN;
  if (!baseUrl || !orgId || !userId || !token) return null;
  return createSearchApiCaller({ baseUrl, orgId, userId, token, fetch: fetchFn });
}

function searchRequest(options: SearchApiClientOptions) {
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
        authorization: `Bearer ${options.token}`,
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compact(init.body)) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function searchQuery(options: SearchApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    q: input.term ?? input.q,
    org_id: options.orgId,
    project_id: mapProjectFilter(input.filtersScope ?? input.project ?? input.projectId ?? input.project_id),
    kind: input.kind,
    limit: input.limit,
    offset: input.offset,
  });
}

function suggestQuery(options: SearchApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    prefix: input.term ?? input.partial ?? input.prefix,
    org_id: options.orgId,
    kind: input.kind,
    limit: input.limit,
  });
}

function savedSearchBody(options: SearchApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    org_id: options.orgId,
    user_id: options.userId,
    name: input.name,
    query_json: input.queryJson ?? input.query_json,
    scope: input.scope,
    project_id: input.projectId ?? input.project_id,
  });
}

function clickBody(options: SearchApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    org_id: options.orgId,
    user_id: options.userId,
    project_id: input.projectId ?? input.project_id,
    query: input.query,
    result_id: input.resultId ?? input.result_id,
    result_kind: input.resultKind ?? input.result_kind,
    position: input.position,
  });
}

function snapshotQuery(options: SearchApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    org_id: options.orgId,
    project_id: input.projectId ?? input.project_id,
  });
}

function mapProjectFilter(value: unknown): unknown {
  if (value === "all" || value === "global") return undefined;
  return value;
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && value !== ""
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Search API request failed with ${status}.`;
}
