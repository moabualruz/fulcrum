export interface SprintPlanningApiScope {
  orgId?: string;
  projectId?: string;
  sprintId?: string;
}

export interface SprintRow {
  id: string;
  name: string;
  capacityPoints?: number | null;
  assignedPoints?: number | null;
}

export async function listProjectSprints(
  fetchFn: typeof fetch,
  scope: Pick<SprintPlanningApiScope, "orgId" | "projectId">,
): Promise<SprintRow[]> {
  const orgId = requireValue(scope.orgId, "Organization scope");
  const projectId = requireValue(scope.projectId, "Project id");
  const query = new URLSearchParams({ orgId, projectId });
  const response = await requestPublicApi<unknown>(fetchFn, `/api/v1/sprints?${query.toString()}`, { method: "GET" });
  const rows = Array.isArray((response as { data?: unknown[] }).data) ? (response as { data: unknown[] }).data : response;
  return Array.isArray(rows) ? rows.map(normalizeSprint) : [];
}

export async function fetchSprintPlanningState(
  fetchFn: typeof fetch,
  scope: Pick<SprintPlanningApiScope, "orgId" | "sprintId">,
): Promise<SprintRow | null> {
  const orgId = requireValue(scope.orgId, "Organization scope");
  const sprintId = requireValue(scope.sprintId, "Sprint id");
  const query = new URLSearchParams({ orgId });
  const response = await requestPublicApi<unknown>(fetchFn, `/api/v1/sprints/${encodeURIComponent(sprintId)}?${query.toString()}`, {
    method: "GET",
  });
  return normalizeSprint(response);
}

export async function assignTaskToSprint(
  fetchFn: typeof fetch,
  scope: Pick<SprintPlanningApiScope, "orgId" | "sprintId"> & { taskId?: string },
): Promise<unknown> {
  const orgId = requireValue(scope.orgId, "Organization scope");
  const sprintId = requireValue(scope.sprintId, "Sprint id");
  const taskId = requireValue(scope.taskId, "Task id");
  return await requestPublicApi(fetchFn, `/api/v1/sprints/${encodeURIComponent(sprintId)}/tasks`, {
    method: "POST",
    body: JSON.stringify({ orgId, taskId }),
  });
}

function normalizeSprint(input: unknown): SprintRow {
  const row = input as Record<string, unknown>;
  return {
    id: String(row["id"] ?? ""),
    name: String(row["name"] ?? ""),
    capacityPoints: numberOrNull(row["capacityPoints"]),
    assignedPoints: numberOrNull(row["assignedPoints"]),
  };
}

async function requestPublicApi<T>(
  fetchFn: typeof fetch,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchFn(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
  return body as T;
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string } } | null;
  return record?.message ?? record?.error?.message ?? `Sprint API request failed with ${status}.`;
}

function requireValue(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
