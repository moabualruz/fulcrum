export interface ProjectApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface ProjectApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export class ProjectApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

export function createProjectApiCaller(options: ProjectApiClientOptions) {
  const request = projectRequest(options);
  return {
    projects: {
      list: async () => await request("/api/v1/projects", { method: "GET", query: projectContextQuery(options) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/projects", { method: "POST", body: projectBody(options, input) }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/projects/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: projectContextQuery(options),
        }),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/projects/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: projectBody(options, body),
        });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/projects/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: projectContextQuery(options),
        }),
      stats: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/projects/${encodeURIComponent(input.id)}/stats`, {
          method: "GET",
          query: projectContextQuery(options),
        }),
      dashboard: async (input: JsonRecord = {}) =>
        await request("/api/v1/projects/dashboard", {
          method: "GET",
          query: { ...projectContextQuery(options), projectId: input.projectId, project_id: input.project_id },
        }),
    },
  };
}

export function createProjectApiCallerFromEnv(
  env: ProjectApiEnvironment = process.env as unknown as ProjectApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createProjectApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function projectRequest(options: ProjectApiClientOptions) {
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
    if (!response.ok) throw new ProjectApiError(extractErrorMessage(body, response.status), response.status);
    return body as T;
  };
}

function projectContextQuery(options: ProjectApiClientOptions): JsonRecord {
  return { orgId: options.orgId };
}

function projectBody(options: ProjectApiClientOptions, input: JsonRecord): JsonRecord {
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Project API request failed with ${status}.`;
}
