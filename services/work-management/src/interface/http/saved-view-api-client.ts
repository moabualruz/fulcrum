export interface SavedViewApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface SavedViewApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createSavedViewApiCaller(options: SavedViewApiClientOptions) {
  const request = savedViewRequest(options);
  return {
    savedViews: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/saved-views", { method: "GET", query: savedViewQuery(options, input) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/saved-views", { method: "POST", body: savedViewBody(options, input) }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/saved-views/${encodeURIComponent(input.id)}`),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/saved-views/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: compact(body),
        });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/saved-views/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
    },
  };
}

export function createSavedViewApiCallerFromEnv(
  env: SavedViewApiEnvironment = process.env as unknown as SavedViewApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createSavedViewApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function savedViewRequest(options: SavedViewApiClientOptions) {
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

function savedViewQuery(options: SavedViewApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    projectId: input.projectId ?? input.project_id,
  });
}

function savedViewBody(options: SavedViewApiClientOptions, input: JsonRecord): JsonRecord {
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Saved-view API request failed with ${status}.`;
}
