export interface ProjectStatusApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface ProjectStatusApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createProjectStatusApiCaller(options: ProjectStatusApiClientOptions) {
  const request = projectStatusRequest(options);
  return {
    projectStatuses: {
      list: async (input: JsonRecord & { projectId: string }) =>
        await request(`/api/v1/projects/${encodeURIComponent(input.projectId)}/statuses`, {
          method: "GET",
          query: projectStatusQuery(options),
        }),
      create: async (input: JsonRecord & { projectId: string }) =>
        await request(`/api/v1/projects/${encodeURIComponent(input.projectId)}/statuses`, {
          method: "POST",
          body: projectStatusBody(options, input),
        }),
      update: async (input: JsonRecord & { projectId: string; id: string }) => {
        const { id, projectId, ...body } = input;
        return await request(`/api/v1/projects/${encodeURIComponent(projectId)}/statuses/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: projectStatusBody(options, body),
        });
      },
      delete: async (input: JsonRecord & { projectId: string; id: string }) =>
        await request(`/api/v1/projects/${encodeURIComponent(input.projectId)}/statuses/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: projectStatusQuery(options),
        }),
    },
  };
}

export function createProjectStatusApiCallerFromEnv(
  env: ProjectStatusApiEnvironment = process.env as unknown as ProjectStatusApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createProjectStatusApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function projectStatusRequest(options: ProjectStatusApiClientOptions) {
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

function projectStatusQuery(options: ProjectStatusApiClientOptions): JsonRecord {
  return { orgId: options.orgId };
}

function projectStatusBody(options: ProjectStatusApiClientOptions, input: JsonRecord): JsonRecord {
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Project status API request failed with ${status}.`;
}

