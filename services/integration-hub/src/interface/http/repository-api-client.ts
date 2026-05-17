export interface RepositoryApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface RepositoryApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createRepositoryApiCaller(options: RepositoryApiClientOptions) {
  const request = repositoryRequest(options);
  return {
    repos: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/repos", { method: "GET", query: repositoryQuery(options, input) }),
      register: async (input: JsonRecord) =>
        await request("/api/v1/repos", { method: "POST", body: repositoryBody(options, input) }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/repos/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: repositoryContextQuery(options),
        }),
      sync: async () =>
        await request("/api/v1/repos/sync", { method: "POST", query: repositoryContextQuery(options) }),
      syncRepo: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/repos/${encodeURIComponent(input.id)}/sync`, {
          method: "POST",
          query: repositoryContextQuery(options),
        }),
      statusRepo: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/repos/${encodeURIComponent(input.id)}/status`, {
          method: "GET",
          query: repositoryContextQuery(options),
        }),
      unregister: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/repos/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: repositoryContextQuery(options),
        }),
    },
    repoBranches: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/repo-branches", {
          method: "GET",
          query: repositoryQuery(options, input),
        }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/repo-branches/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: repositoryContextQuery(options),
        }),
    },
    repoCommits: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/repo-commits", {
          method: "GET",
          query: repositoryQuery(options, input),
        }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/repo-commits/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: repositoryContextQuery(options),
        }),
    },
  };
}

export function createRepositoryApiCallerFromEnv(
  env: RepositoryApiEnvironment = process.env as unknown as RepositoryApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createRepositoryApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function repositoryRequest(options: RepositoryApiClientOptions) {
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

function repositoryQuery(options: RepositoryApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    includeArchived: input.includeArchived ?? input.include_archived,
    repoId: input.repoId ?? input.repo_id,
    branch: input.branch,
    limit: input.limit,
  });
}

function repositoryContextQuery(options: RepositoryApiClientOptions): JsonRecord {
  return { orgId: options.orgId };
}

function repositoryBody(options: RepositoryApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    ...input,
    orgId: options.orgId,
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Repository API request failed with ${status}.`;
}
