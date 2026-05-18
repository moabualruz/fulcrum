export interface TaskApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface TaskApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createTaskApiCaller(options: TaskApiClientOptions) {
  const request = taskRequest(options);
  return {
    tasks: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/tasks", { method: "GET", query: taskQuery(input) }),
      exportCsv: async (input: JsonRecord & { projectId: string }) =>
        await request<string>("/api/v1/connectors/export-csv", {
          method: "GET",
          query: { entity: "tasks", projectId: input.projectId },
        }),
      importCsv: async (input: JsonRecord & { projectId: string; csv: string }) =>
        await request("/api/v1/connectors/import-csv", {
          method: "POST",
          body: { entity: "tasks", projectId: input.projectId, csv: input.csv, columnMap: input.columnMap },
        }),
      bulkCreate: async (input: JsonRecord & { projectId: string; tasks: JsonRecord[] }) => {
        const csv = tasksToCsv(input.tasks);
        return await request("/api/v1/connectors/import-csv", {
          method: "POST",
          body: { entity: "tasks", projectId: input.projectId, csv },
        });
      },
      manualWorkbench: async (input: JsonRecord = {}) =>
        await request("/api/v1/tasks/manual-workbench", { method: "GET", query: taskManualWorkbenchQuery(input) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/tasks", { method: "POST", body: taskBody(options, input) }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/tasks/${encodeURIComponent(input.id)}`, { method: "GET", query: taskQuery(input) }),
      listChildren: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/tasks/${encodeURIComponent(input.id)}/children`, { method: "GET", query: taskQuery(input) }),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: taskBody(options, body) });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/tasks/${encodeURIComponent(input.id)}`, { method: "DELETE", query: taskQuery(input) }),
      setDependencies: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/tasks/${encodeURIComponent(id)}/dependencies`, {
          method: "PATCH",
          body: taskBody(options, body),
        });
      },
      setParent: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/tasks/${encodeURIComponent(id)}/parent`, {
          method: "PATCH",
          body: taskBody(options, body),
        });
      },
    },
  };
}

export function createTaskApiCallerFromEnv(
  env: TaskApiEnvironment = process.env as unknown as TaskApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createTaskApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function taskRequest(options: TaskApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(compact({
      orgId: options.orgId,
      userId: options.userId,
      ...init.query,
    }))) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchFn(url.toString(), {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compactUndefined(init.body)) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function taskQuery(input: JsonRecord): JsonRecord {
  return compact({
    projectId: input.projectId,
    project_id: input.project_id,
    include_deleted: input.includeDeleted ?? input.include_deleted,
    sortField: input.sortField,
    sortDirection: input.sortDirection,
  });
}

function taskManualWorkbenchQuery(input: JsonRecord): JsonRecord {
  const filters = input.filters && typeof input.filters === "object"
    ? input.filters as JsonRecord
    : {};
  const projectCapabilities = input.projectCapabilities && typeof input.projectCapabilities === "object"
    ? input.projectCapabilities as JsonRecord
    : {};
  return compact({
    projectId: input.projectId,
    project_id: input.project_id,
    traceId: input.traceId,
    viewMode: input.viewMode,
    projectCapabilitiesEstimateEnabled: projectCapabilities.estimateEnabled,
    statuses: filters.statuses,
    stateGroups: filters.stateGroups,
    labels: filters.labels,
    assigneeIds: filters.assigneeIds,
    cycleIds: filters.cycleIds,
    moduleIds: filters.moduleIds,
    taskTypes: filters.taskTypes,
    priorities: filters.priorities,
    search: filters.search,
  });
}

function taskBody(options: TaskApiClientOptions, input: JsonRecord): JsonRecord {
  return compactUndefined({
    ...input,
    orgId: options.orgId,
    userId: options.userId,
  });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function compactUndefined(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Task API request failed with ${status}.`;
}

function tasksToCsv(tasks: JsonRecord[]): string {
  const columns = ["title", "status", "priority", "assignee", "description", "dueDate", "externalId"];
  const lines = [columns.join(",")];
  for (const task of tasks) {
    lines.push(columns.map((column) => csvCell(task[column])).join(","));
  }
  return lines.join("\n");
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
