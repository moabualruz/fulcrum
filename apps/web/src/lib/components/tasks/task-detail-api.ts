export interface TaskDetailApiScope {
  orgId?: string;
  userId?: string;
  taskId: string;
  projectId?: string | null;
}

export interface TaskDetailApiRow {
  id: string;
  projectId: string;
  externalId: string | null;
  title: string;
  description: string | null;
  descriptionText: string | null;
  tiptapContent: Record<string, unknown>;
  status: string | null;
  priority: number | null;
  points: number | null;
  assigneeId: string | null;
  parentId: string | null;
  successCriteria?: string[];
  traceId?: string;
  deletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskRelationshipApiRow {
  id: string;
  orgId: string;
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: "blocks" | "relates_to" | "duplicate_of";
  traceId: string;
  createdAt: string | null;
}

type JsonRecord = Record<string, unknown>;

export async function fetchTaskDetail(
  fetchFn: typeof fetch,
  input: TaskDetailApiScope,
): Promise<TaskDetailApiRow> {
  const { taskId, ...scopeInput } = input;
  const scope = requireTaskDetailScope(input);
  return await getPublicJson(fetchFn, `/api/v1/tasks/${encodeURIComponent(taskId)}`, scopeQuery({
    ...scope,
    projectId: scopeInput.projectId,
  }));
}

export async function fetchTaskChildren(
  fetchFn: typeof fetch,
  input: TaskDetailApiScope,
): Promise<TaskDetailApiRow[]> {
  const { taskId, ...scopeInput } = input;
  const scope = requireTaskDetailScope(input);
  return await getPublicJson(fetchFn, `/api/v1/tasks/${encodeURIComponent(taskId)}/children`, scopeQuery({
    ...scope,
    projectId: scopeInput.projectId,
  }));
}

export async function updateTaskTitle(
  fetchFn: typeof fetch,
  input: TaskDetailApiScope & { title: string },
): Promise<{ ok: true }> {
  const { title, taskId, ...scopeInput } = input;
  const scope = requireTaskDetailScope(input);
  return await writePublicJson(fetchFn, `/api/v1/tasks/${encodeURIComponent(taskId)}`, "PATCH", {
    ...scope,
    projectId: scopeInput.projectId,
    title,
  });
}

export async function archiveTaskDetail(
  fetchFn: typeof fetch,
  input: TaskDetailApiScope,
): Promise<void> {
  const { taskId, ...scopeInput } = input;
  const scope = requireTaskDetailScope(input);
  await deletePublicJson(fetchFn, `/api/v1/tasks/${encodeURIComponent(taskId)}`, scopeQuery({
    ...scope,
    projectId: scopeInput.projectId,
  }));
}

export async function fetchTaskRelationships(
  fetchFn: typeof fetch,
  input: Pick<TaskDetailApiScope, "orgId" | "taskId">,
): Promise<TaskRelationshipApiRow[]> {
  const orgId = input.orgId?.trim();
  if (!orgId) throw new Error("Organization scope is required.");
  if (!input.taskId.trim()) throw new Error("Task id is required.");
  return await writePublicJson(fetchFn, "/api/v1/relationships/list-for-task", "POST", {
    orgId,
    taskId: input.taskId,
  });
}

async function getPublicJson<T>(
  fetchFn: typeof fetch,
  path: string,
  query: URLSearchParams,
): Promise<T> {
  const response = await fetchFn(`${path}?${query.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  return await parsePublicResponse<T>(response, "Task request failed");
}

async function writePublicJson<T>(
  fetchFn: typeof fetch,
  path: string,
  method: "PATCH" | "POST",
  body: JsonRecord,
): Promise<T> {
  const response = await fetchFn(path, {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact(body)),
  });
  return await parsePublicResponse<T>(response, "Task request failed");
}

async function deletePublicJson(
  fetchFn: typeof fetch,
  path: string,
  query: URLSearchParams,
): Promise<void> {
  const response = await fetchFn(`${path}?${query.toString()}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  await parsePublicResponse<unknown>(response, "Task request failed");
}

async function parsePublicResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(extractPublicError(body, response.status, fallback));
  return body as T;
}

function requireTaskDetailScope(input: TaskDetailApiScope): Record<"orgId" | "userId", string> {
  const orgId = input.orgId?.trim();
  const userId = input.userId?.trim();
  if (!orgId || !userId) throw new Error("Organization and user scope are required.");
  if (!input.taskId.trim()) throw new Error("Task id is required.");
  return { orgId, userId };
}

function scopeQuery(input: JsonRecord): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(compact(input))) {
    params.set(key, String(value));
  }
  return params;
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

function extractPublicError(body: unknown, status: number, fallback: string): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `${fallback} with ${status}.`;
}
