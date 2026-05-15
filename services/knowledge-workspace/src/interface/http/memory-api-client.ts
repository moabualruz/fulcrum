export interface MemoryApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_API_TOKEN?: string;
  FULCRUM_PUBLIC_API_TOKEN?: string;
}

export interface MemoryApiClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createMemoryApiCaller(options: MemoryApiClientOptions) {
  const request = memoryRequest(options);
  return {
    memories: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/memory", { method: "GET", query: memoryQuery(input) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/memory", { method: "POST", body: memoryBody(input) }),
      search: async (input: JsonRecord & { query: string }) =>
        await request("/api/v1/memory/search", { method: "GET", query: memoryQuery(input) }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/memory/${encodeURIComponent(input.id)}`),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/memory/${encodeURIComponent(id)}`, { method: "PATCH", body: memoryBody(body) });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/memory/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: { confirm: "true" },
        }),
      promote: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/memory/${encodeURIComponent(input.id)}/promote`, { method: "POST" }),
      digest: async (input: JsonRecord & { projectId: string }) =>
        await request("/api/v1/memory/digest", { method: "POST", body: memoryBody(input) }),
    },
    context: {
      preview: async (input: JsonRecord & { taskId?: string; task?: string }) =>
        await request("/api/v1/context/preview", { method: "GET", query: contextPreviewQuery(input) }),
    },
  };
}

export function createMemoryApiCallerFromEnv(
  env: MemoryApiEnvironment = process.env as unknown as MemoryApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const token = env.FULCRUM_API_TOKEN ?? env.FULCRUM_PUBLIC_API_TOKEN;
  if (!baseUrl || !token) return null;
  return createMemoryApiCaller({ baseUrl, token, fetch: fetchFn });
}

function memoryRequest(options: MemoryApiClientOptions) {
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

function memoryQuery(input: JsonRecord): JsonRecord {
  return compact({
    projectId: input.projectId ?? input.project_id,
    global: input.global,
    kind: input.kind,
    tags: input.tags,
    importance: input.importance,
    archived: input.archived,
    source: input.source,
    limit: input.limit,
    offset: input.offset,
    query: input.query,
  });
}

function memoryBody(input: JsonRecord): JsonRecord {
  return compact(input);
}

function contextPreviewQuery(input: JsonRecord): JsonRecord {
  return compact({
    taskId: input.taskId ?? input.task_id ?? input.task,
    budget: input.budget,
    includeGlobal: input.includeGlobal ?? input.include_global,
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Memory API request failed with ${status}.`;
}
