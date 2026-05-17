export interface RecurrenceApiScope {
  orgId?: string;
  taskId?: string;
}

export type RecurrenceMode = "on_schedule" | "after_completion" | "on_close";

export interface RecurrenceRule {
  id: string;
  mode: RecurrenceMode;
  intervalDays?: number | null;
  cronExpression?: string | null;
  daysOfWeek?: number[] | null;
  timeOfDay?: string | null;
  nextOccurrence?: string | null;
  occurrenceCount?: number;
  endDate?: string | null;
  maxOccurrences?: number | null;
}

export interface SaveRecurrenceRuleInput extends RecurrenceApiScope {
  mode: RecurrenceMode;
  intervalDays?: number | null;
  daysOfWeek?: number[] | null;
  timeOfDay?: string | null;
  maxOccurrences?: number | null;
}

export async function listTaskRecurrenceRules(
  fetchFn: typeof fetch,
  scope: RecurrenceApiScope,
): Promise<RecurrenceRule[]> {
  const required = requireScope(scope);
  const url = new URL("/api/v1/recurrence", "http://fulcrum.local");
  url.searchParams.set("orgId", required.orgId);
  url.searchParams.set("taskId", required.taskId);

  const rows = await requestPublicApi<unknown[]>(fetchFn, pathnameWithSearch(url), { method: "GET" });
  return rows.map(normalizeRecurrenceRule);
}

export async function saveTaskRecurrenceRule(
  fetchFn: typeof fetch,
  input: SaveRecurrenceRuleInput,
): Promise<RecurrenceRule> {
  const required = requireScope(input);
  const response = await requestPublicApi<unknown>(fetchFn, "/api/v1/recurrence", {
    method: "POST",
    body: JSON.stringify(compact({
      orgId: required.orgId,
      taskId: required.taskId,
      triggerType: input.mode === "on_schedule" ? "schedule" : "on_complete",
      cronExpression: input.mode === "on_schedule"
        ? cronExpressionFor(input.daysOfWeek ?? [], input.timeOfDay ?? "09:00")
        : undefined,
      intervalDays: input.mode === "on_schedule" ? undefined : input.intervalDays ?? undefined,
      maxOccurrences: input.maxOccurrences ?? undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    })),
  });
  return normalizeRecurrenceRule(response);
}

export async function deleteTaskRecurrenceRule(
  fetchFn: typeof fetch,
  input: { orgId?: string; ruleId?: string },
): Promise<void> {
  const orgId = input.orgId?.trim();
  const ruleId = input.ruleId?.trim();
  if (!orgId || !ruleId) throw new Error("Organization scope and recurrence rule are required.");

  const url = new URL(`/api/v1/recurrence/${encodeURIComponent(ruleId)}`, "http://fulcrum.local");
  url.searchParams.set("orgId", orgId);
  await requestPublicApi(fetchFn, pathnameWithSearch(url), { method: "DELETE" });
}

function normalizeRecurrenceRule(input: unknown): RecurrenceRule {
  const row = input as Record<string, unknown>;
  const mode = row["triggerType"] === "schedule" ? "on_schedule" : "after_completion";
  const cronExpression = stringOrNull(row["cronExpression"]);
  const { daysOfWeek, timeOfDay } = cronParts(cronExpression);
  return {
    id: String(row["id"] ?? ""),
    mode,
    intervalDays: numberOrNull(row["intervalDays"]),
    cronExpression,
    daysOfWeek,
    timeOfDay,
    nextOccurrence: stringOrNull(row["nextRunAt"]),
    occurrenceCount: Number(row["occurrencesCreated"] ?? 0),
    maxOccurrences: numberOrNull(row["maxOccurrences"]),
    endDate: null,
  };
}

function requireScope(input: RecurrenceApiScope): Record<"orgId" | "taskId", string> {
  const orgId = input.orgId?.trim();
  const taskId = input.taskId?.trim();
  if (!orgId || !taskId) throw new Error("Organization scope and task are required.");
  return { orgId, taskId };
}

function cronExpressionFor(daysOfWeek: number[], timeOfDay: string): string {
  const [hour = "9", minute = "0"] = timeOfDay.split(":");
  const normalizedDays = daysOfWeek.length > 0 ? daysOfWeek.join(",") : "1";
  return `${Number(minute)} ${Number(hour)} * * ${normalizedDays}`;
}

function cronParts(cronExpression: string | null): { daysOfWeek: number[] | null; timeOfDay: string | null } {
  if (!cronExpression) return { daysOfWeek: null, timeOfDay: null };
  const [minute, hour, , , days] = cronExpression.split(/\s+/);
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  return {
    daysOfWeek: days ? days.split(",").map((day) => Number(day)).filter(Number.isInteger) : null,
    timeOfDay: Number.isFinite(parsedHour) && Number.isFinite(parsedMinute)
      ? `${String(parsedHour).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}`
      : null,
  };
}

function pathnameWithSearch(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) =>
    value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
  ));
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
  return record?.message ?? record?.error?.message ?? `Recurrence API request failed with ${status}.`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
