export interface SprintReportApiScope {
  orgId?: string;
  sprintId?: string;
}

export interface SprintReportData {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status: "active" | "completed" | "planned";
  closedSummary?: {
    completedCount: number;
    completedPoints: number;
    carriedOver: number;
    addedMidSprint: number;
    removed: number;
    scopeChangePct: number;
  } | null;
  retrospectiveNotes?: Record<string, unknown> | null;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    storyPoints?: number | null;
    statusHistory?: Array<{ status: string; enteredAt: string }>;
  }>;
  velocityHistory?: Array<{ sprintName: string; completedPoints: number }>;
}

export async function fetchSprintReport(
  fetchFn: typeof fetch,
  scope: SprintReportApiScope,
): Promise<SprintReportData | null> {
  const orgId = requireValue(scope.orgId, "Organization scope");
  const sprintId = requireValue(scope.sprintId, "Sprint id");
  const query = new URLSearchParams({ orgId });
  const row = await requestPublicApi<Record<string, unknown>>(
    fetchFn,
    `/api/v1/sprints/${encodeURIComponent(sprintId)}?${query.toString()}`,
  );
  return normalizeSprint(row);
}

function normalizeSprint(row: Record<string, unknown>): SprintReportData | null {
  const id = String(row["id"] ?? "");
  if (!id) return null;
  return {
    id,
    name: String(row["name"] ?? ""),
    startDate: stringOrNull(row["startsAt"] ?? row["startDate"]),
    endDate: stringOrNull(row["endsAt"] ?? row["endDate"]),
    status: normalizeStatus(row["status"]),
    closedSummary: objectOrNull(row["closedSummary"]),
    retrospectiveNotes: objectOrNull(row["retrospectiveNotes"]),
    tasks: Array.isArray(row["tasks"]) ? row["tasks"] as SprintReportData["tasks"] : [],
    velocityHistory: Array.isArray(row["velocityHistory"])
      ? row["velocityHistory"] as SprintReportData["velocityHistory"]
      : [],
  };
}

async function requestPublicApi<T>(fetchFn: typeof fetch, path: string): Promise<T> {
  const response = await fetchFn(path, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
  return body as T;
}

function requireValue(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function normalizeStatus(value: unknown): SprintReportData["status"] {
  if (value === "completed") return "completed";
  if (value === "active" || value === "current") return "active";
  return "planned";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string } } | null;
  return record?.message ?? record?.error?.message ?? `Sprint report API request failed with ${status}.`;
}
