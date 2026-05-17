export interface ArtifactApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
}

export interface ArtifactApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createArtifactApiCaller(options: ArtifactApiClientOptions) {
  const request = artifactRequest(options);
  return {
    artifacts: {
      get: async (input: { id: string }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}`, {
          method: "GET",
        }),
      accept: async (input: { id: string }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}/accept`, {
          method: "POST",
        }),
      reject: async (input: { id: string }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}/reject`, {
          method: "POST",
        }),
      archive: async (input: { id: string }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}/archive`, {
          method: "POST",
        }),
      unarchive: async (input: { id: string }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}/unarchive`, {
          method: "POST",
        }),
      download: async (input: { id: string }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}/download`, {
          method: "GET",
        }),
      delete: async (input: { id: string; hard?: boolean }) =>
        await request(`/api/v1/artifacts/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: compact({ hard: input.hard }),
        }),
      upload: async (input: JsonRecord = {}) =>
        await request("/api/v1/artifacts", {
          method: "POST",
          body: input,
        }),
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/artifacts", {
          method: "GET",
          query: compact({
            projectId: input.projectId ?? input.project_id,
            traceId: input.traceId ?? input.trace_id,
            kind: input.kind,
            runId: input.runId ?? input.run_id,
            taskId: input.taskId ?? input.task_id,
            docId: input.docId ?? input.doc_id,
            mime: input.mime,
            lifecycleState: input.lifecycleState ?? input.lifecycle_state,
            archived: input.archived,
            limit: input.limit,
          }),
        }),
    },
  };
}

export function createArtifactApiCallerFromEnv(
  env: ArtifactApiEnvironment = process.env as unknown as ArtifactApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createArtifactApiCaller({ baseUrl, fetch: fetchFn });
}

function artifactRequest(options: ArtifactApiClientOptions) {
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
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Artifact API request failed with ${status}.`;
}
