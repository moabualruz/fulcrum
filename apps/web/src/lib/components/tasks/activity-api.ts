export interface TaskActivityApiScope {
  orgId?: string;
  taskId: string;
  limit?: number;
}

export interface TaskActivityApiRow {
  id: string;
  userId: string | null;
  verb: string;
  subjectKind: string;
  subjectId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export async function fetchTaskActivity(
  fetchFn: typeof fetch,
  input: TaskActivityApiScope,
): Promise<TaskActivityApiRow[]> {
  const orgId = input.orgId?.trim();
  if (!orgId) throw new Error("Organization scope is required.");
  if (!input.taskId.trim()) throw new Error("Task id is required.");

  const query = new URLSearchParams({
    orgId,
    kind: "task",
    subjectId: input.taskId,
    limit: String(input.limit ?? 50),
  });
  const response = await fetchFn(`/api/v1/audit?${query.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  const body = await parsePublicResponse<{ data?: TaskActivityApiRow[] }>(response);
  return Array.isArray(body.data) ? body.data : [];
}

async function parsePublicResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(extractPublicError(body, response.status));
  return body as T;
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Activity request failed with ${status}.`;
}
