export interface SprintApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface SprintApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createSprintApiCaller(options: SprintApiClientOptions) {
  const request = sprintRequest(options);
  return {
    sprints: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/sprints", { method: "GET", query: sprintQuery(options, input) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/sprints", { method: "POST", body: sprintBody(options, input) }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: sprintContextQuery(options),
        }),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/sprints/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: sprintBody(options, body),
        });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: sprintContextQuery(options),
        }),
      start: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}/start`, {
          method: "POST",
          body: sprintBody(options, input),
        }),
      close: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}/close`, {
          method: "POST",
          body: sprintBody(options, input),
        }),
      addTask: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/sprints/${encodeURIComponent(id)}/tasks`, {
          method: "POST",
          body: sprintBody(options, body),
        });
      },
      removeTask: async (input: JsonRecord & { id: string; taskId: string }) =>
        await request(
          `/api/v1/sprints/${encodeURIComponent(input.id)}/tasks/${encodeURIComponent(input.taskId)}`,
          { method: "DELETE", query: sprintContextQuery(options) },
        ),
      // Project-scoped sprint board: backs the web `/projects/[id]/sprints` and
      // `/sprint/[sprintId]` routes (the `sprints` table, not the cycle model).
      loadProjectSprints: async (input: JsonRecord & { projectId: string }) =>
        await request("/api/v1/sprints/project-board", {
          method: "GET",
          query: projectBoardQuery(options, input),
        }),
      createProjectSprint: async (input: JsonRecord & { projectId: string }) =>
        await request("/api/v1/sprints/project-board", {
          method: "POST",
          body: sprintBody(options, input),
        }),
      loadProjectSprintDetail: async (input: JsonRecord & { id: string; projectId: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}/detail`, {
          method: "GET",
          query: projectBoardQuery(options, input),
        }),
      startProjectSprint: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}/start-board`, {
          method: "POST",
          body: sprintContextQuery(options),
        }),
      completeProjectSprint: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}/complete-board`, {
          method: "POST",
          body: sprintContextQuery(options),
        }),
      updateProjectSprintGoal: async (input: JsonRecord & { id: string; goal: string }) =>
        await request(`/api/v1/sprints/${encodeURIComponent(input.id)}/goal`, {
          method: "PATCH",
          body: sprintBody(options, { goal: input.goal }),
        }),
      createProjectSprintTask: async (input: JsonRecord & { id: string; projectId: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/sprints/${encodeURIComponent(id)}/board-tasks`, {
          method: "POST",
          body: sprintBody(options, body),
        });
      },
      updateProjectSprintTask: async (input: JsonRecord & { taskId: string; projectId: string }) => {
        const { taskId, ...body } = input;
        return await request(`/api/v1/sprints/project-tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: sprintBody(options, body),
        });
      },
    },
  };
}

export function createSprintApiCallerFromEnv(
  env: SprintApiEnvironment = process.env as unknown as SprintApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createSprintApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function sprintRequest(options: SprintApiClientOptions) {
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

function sprintQuery(options: SprintApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    projectId: input.projectId ?? input.project_id,
    status: input.status,
  });
}

function sprintContextQuery(options: SprintApiClientOptions): JsonRecord {
  return { orgId: options.orgId };
}

/** Query carrying org + project scope for the project-scoped sprint board routes. */
function projectBoardQuery(options: SprintApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, projectId: input.projectId });
}

function sprintBody(options: SprintApiClientOptions, input: JsonRecord): JsonRecord {
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Sprint API request failed with ${status}.`;
}
