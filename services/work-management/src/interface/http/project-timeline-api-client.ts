export interface ProjectTimelineApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface ProjectTimelineApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export class ProjectTimelineApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProjectTimelineApiError";
  }
}

export function createProjectTimelineApiCaller(options: ProjectTimelineApiClientOptions) {
  const request = timelineRequest(options);
  return {
    timeline: {
      calendar: async (input: { projectId: string }) =>
        await request(`/api/v1/project-timeline/${encodeURIComponent(input.projectId)}/calendar`, {
          method: "GET",
          query: timelineContextQuery(options),
        }),
      gantt: async (input: { projectId: string }) =>
        await request(`/api/v1/project-timeline/${encodeURIComponent(input.projectId)}/gantt`, {
          method: "GET",
          query: timelineContextQuery(options),
        }),
      reschedule: async (input: {
        projectId: string;
        taskId: string;
        startDate?: string | null;
        dueDate?: string | null;
      }) => {
        const { projectId, ...body } = input;
        return await request(`/api/v1/project-timeline/${encodeURIComponent(projectId)}/reschedule`, {
          method: "POST",
          body: timelineBody(options, body),
        });
      },
    },
  };
}

export function createProjectTimelineApiCallerFromEnv(
  env: ProjectTimelineApiEnvironment = process.env as unknown as ProjectTimelineApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createProjectTimelineApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function timelineRequest(options: ProjectTimelineApiClientOptions) {
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
    if (!response.ok) {
      throw new ProjectTimelineApiError(extractErrorMessage(body, response.status), response.status);
    }
    return body as T;
  };
}

function timelineContextQuery(options: ProjectTimelineApiClientOptions): JsonRecord {
  return { orgId: options.orgId };
}

// `startDate`/`dueDate` may legitimately be sent as `null` to clear a date, so
// the boundary fields pass through verbatim instead of through `compact`.
function timelineBody(options: ProjectTimelineApiClientOptions, input: JsonRecord): JsonRecord {
  return {
    ...input,
    orgId: options.orgId,
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
  return (
    record?.error?.json?.message ??
    record?.error?.message ??
    record?.message ??
    `Project timeline API request failed with ${status}.`
  );
}
