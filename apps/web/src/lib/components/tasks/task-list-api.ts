export interface TaskListApiScope {
  orgId?: string;
  userId?: string;
  projectId: string;
}

export interface TaskListRow {
  id: string;
  title: string;
  projectId: string;
  status: string | null;
  priority: number | null;
  points: number | null;
  assigneeId: string | null;
  parentId: string | null;
  descriptionText?: string | null;
}

export interface SavedTaskViewRow {
  id: string;
  displayProperties?: Record<string, unknown>;
  columns?: string[];
}

type JsonRecord = Record<string, unknown>;

export async function fetchTaskList(
  fetchFn: typeof fetch,
  input: TaskListApiScope,
): Promise<TaskListRow[]> {
  const scope = requireScope(input);
  const query = new URLSearchParams({
    orgId: scope.orgId,
    userId: scope.userId,
    projectId: input.projectId,
  });
  return await getPublicJson(fetchFn, `/api/v1/tasks?${query.toString()}`);
}

export async function fetchSavedTaskView(
  fetchFn: typeof fetch,
  input: { savedViewId: string },
): Promise<SavedTaskViewRow> {
  if (!input.savedViewId.trim()) throw new Error("Saved view id is required.");
  return await getPublicJson(fetchFn, `/api/v1/saved-views/${encodeURIComponent(input.savedViewId)}`);
}

export async function updateTaskListFields(
  fetchFn: typeof fetch,
  input: TaskListApiScope & { taskId: string; patch: JsonRecord },
): Promise<{ ok: true }> {
  const scope = requireScope(input);
  if (!input.taskId.trim()) throw new Error("Task id is required.");
  const response = await fetchFn(`/api/v1/tasks/${encodeURIComponent(input.taskId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact({
      orgId: scope.orgId,
      userId: scope.userId,
      projectId: input.projectId,
      ...input.patch,
    })),
  });
  return await parsePublicResponse<{ ok: true }>(response);
}

export function savedTaskViewColumns(view: SavedTaskViewRow): string[] {
  if (Array.isArray(view.columns)) return view.columns.filter((column): column is string => typeof column === "string");
  const columns = view.displayProperties?.["columns"];
  return Array.isArray(columns) ? columns.filter((column): column is string => typeof column === "string") : [];
}

async function getPublicJson<T>(fetchFn: typeof fetch, path: string): Promise<T> {
  const response = await fetchFn(path, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  return await parsePublicResponse<T>(response);
}

async function parsePublicResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(extractPublicError(body, response.status));
  return body as T;
}

function requireScope(input: TaskListApiScope): Record<"orgId" | "userId", string> {
  const orgId = input.orgId?.trim();
  const userId = input.userId?.trim();
  if (!orgId || !userId) throw new Error("Organization and user scope are required.");
  if (!input.projectId.trim()) throw new Error("Project id is required.");
  return { orgId, userId };
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractPublicError(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Task list request failed with ${status}.`;
}
