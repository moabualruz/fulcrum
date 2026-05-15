import type { TaskColumn, TaskSortDirection, TaskViewRow } from "./task-view-types";

export const DEFAULT_TASK_COLUMNS: readonly TaskColumn[] = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "sprint", label: "Sprint" },
  { key: "labels", label: "Labels" },
  { key: "due_date", label: "Due date" },
  { key: "created_at", label: "Created" },
] as const;

export const TASK_TABLE_STORAGE_KEY = "fulcrum:task-table:visible-columns";

export type BulkTaskAction = "assignee" | "status" | "sprint" | "label" | "priority" | "delete" | "move";

export interface TaskSelectionInput {
  orderedIds: readonly string[];
  selectedIds: ReadonlySet<string>;
  clickedId: string;
  anchorId: string | null;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface TaskSelectionState {
  selectedIds: Set<string>;
  anchorId: string | null;
}

export interface BulkMutationInput {
  action: BulkTaskAction;
  ids: readonly string[];
  value: unknown;
}

export interface BulkMutationRequest {
  kind: "update" | "delete" | "assignSprint";
  input: { ids: string[]; patch?: Record<string, unknown>; sprintId?: string };
}

export interface BulkMutationScope {
  orgId?: string;
  userId?: string;
  projectId?: string | null;
}

function taskValue(task: TaskViewRow, column: string): string | number {
  if (column === "sprint") return task.sprint_name ?? task.sprint_id ?? "";
  if (column === "labels") return (task.labels ?? []).join(", ");
  if (column === "due_date") return task.due_date ?? "";
  if (column === "created_at") return task.created_at ?? task.updated_at;
  const value = (task as unknown as Record<string, unknown>)[column] ?? task.customFields?.[column];
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.join(", ");
  return value == null ? "" : String(value);
}

export function sortTaskRows(
  tasks: readonly TaskViewRow[],
  column: string,
  direction: TaskSortDirection,
): TaskViewRow[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return tasks.slice().sort((a, b) => {
    const av = taskValue(a, column);
    const bv = taskValue(b, column);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av).localeCompare(String(bv)) * multiplier;
  });
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskViewRow[];
}

export function groupTaskRows(tasks: readonly TaskViewRow[], groupBy: string | null): TaskGroup[] {
  if (!groupBy) return [{ key: "all", label: "All tasks", tasks: tasks.slice() }];
  const groups = new Map<string, TaskViewRow[]>();
  for (const task of tasks) {
    const raw = taskValue(task, groupBy);
    const key = raw === "" ? "unassigned" : String(raw);
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupTasks]) => ({ key, label: key, tasks: groupTasks }));
}

export function visibleTaskColumns(visibleColumns?: readonly string[]): TaskColumn[] {
  if (!visibleColumns?.length) return DEFAULT_TASK_COLUMNS.slice();
  const allowed = new Set(visibleColumns);
  return DEFAULT_TASK_COLUMNS.filter((column) => allowed.has(column.key));
}

export function loadVisibleTaskColumns(storage: Pick<Storage, "getItem"> | null): string[] | null {
  const raw = storage?.getItem(TASK_TABLE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function saveVisibleTaskColumns(
  columns: readonly string[],
  storage: Pick<Storage, "setItem"> | null,
): void {
  storage?.setItem(TASK_TABLE_STORAGE_KEY, JSON.stringify(columns));
}

export function nextTaskSelection(input: TaskSelectionInput): TaskSelectionState {
  const selectedIds = new Set(input.selectedIds);
  if (input.shiftKey && input.anchorId) {
    const anchorIndex = input.orderedIds.indexOf(input.anchorId);
    const clickedIndex = input.orderedIds.indexOf(input.clickedId);
    if (anchorIndex >= 0 && clickedIndex >= 0) {
      const [start, end] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
      return {
        selectedIds: new Set(input.orderedIds.slice(start, end + 1)),
        anchorId: input.anchorId,
      };
    }
  }

  if (input.metaKey) {
    if (selectedIds.has(input.clickedId)) selectedIds.delete(input.clickedId);
    else selectedIds.add(input.clickedId);
    return { selectedIds, anchorId: input.clickedId };
  }

  return { selectedIds: new Set([input.clickedId]), anchorId: input.clickedId };
}

export function buildBulkMutationRequest(input: BulkMutationInput): BulkMutationRequest {
  const ids = [...input.ids];
  if (input.action === "delete") return { kind: "delete", input: { ids } };
  if (input.action === "move") {
    const value = input.value as { projectId?: string | null; sprintId?: string | null };
    if (value.sprintId) return { kind: "assignSprint", input: { ids, sprintId: value.sprintId } };
    return {
      kind: "update",
      input: { ids, patch: { projectId: value.projectId ?? null, sprintId: value.sprintId ?? null } },
    };
  }
  if (input.action === "sprint") {
    return {
      kind: "assignSprint",
      input: { ids, sprintId: String(input.value) },
    };
  }
  if (input.action === "assignee") {
    return {
      kind: "update",
      input: { ids, patch: { assigneeId: String(input.value) } },
    };
  }

  return {
    kind: "update",
    input: { ids, patch: { [input.action]: input.value } },
  };
}

export async function submitBulkTaskMutation(
  fetchFn: typeof fetch,
  request: BulkMutationRequest,
  scope: BulkMutationScope,
): Promise<unknown> {
  const scoped = requireBulkScope(scope);
  const results: unknown[] = [];
  for (const taskId of request.input.ids) {
    if (request.kind === "delete") {
      results.push(await deleteTask(fetchFn, scoped, taskId));
    } else if (request.kind === "assignSprint") {
      results.push(await assignTaskToSprint(fetchFn, scoped, taskId, request.input.sprintId));
    } else {
      results.push(await updateTask(fetchFn, scoped, taskId, request.input.patch ?? {}));
    }
  }
  return results;
}

async function updateTask(
  fetchFn: typeof fetch,
  scope: Required<BulkMutationScope>,
  taskId: string,
  patch: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetchFn(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact({
      orgId: scope.orgId,
      userId: scope.userId,
      projectId: scope.projectId,
      ...patch,
    })),
  });
  return await parsePublicResponse(response);
}

async function deleteTask(
  fetchFn: typeof fetch,
  scope: Required<BulkMutationScope>,
  taskId: string,
): Promise<unknown> {
  const query = new URLSearchParams(queryValues({
    orgId: scope.orgId,
    userId: scope.userId,
    projectId: scope.projectId,
  }));
  const response = await fetchFn(`/api/v1/tasks/${encodeURIComponent(taskId)}?${query.toString()}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  return await parsePublicResponse(response);
}

export async function submitBulkTaskCustomFieldPatch(
  fetchFn: typeof fetch,
  taskIds: readonly string[],
  values: Record<string, unknown>,
  scope: BulkMutationScope,
): Promise<unknown[]> {
  const scoped = requireBulkScope(scope);
  const results: unknown[] = [];
  for (const taskId of taskIds) {
    for (const [fieldId, value] of Object.entries(values)) {
      results.push(await setTaskCustomField(fetchFn, scoped, taskId, fieldId, value));
    }
  }
  return results;
}

async function setTaskCustomField(
  fetchFn: typeof fetch,
  scope: Required<BulkMutationScope>,
  taskId: string,
  fieldId: string,
  value: unknown,
): Promise<unknown> {
  const response = await fetchFn("/api/v1/task-custom-fields/set", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact({
      orgId: scope.orgId,
      userId: scope.userId,
      taskId,
      fieldId,
      value,
    })),
  });
  return await parsePublicResponse(response);
}

async function assignTaskToSprint(
  fetchFn: typeof fetch,
  scope: Required<BulkMutationScope>,
  taskId: string,
  sprintId: string | undefined,
): Promise<unknown> {
  if (!sprintId?.trim()) throw new Error("Sprint id is required.");
  const response = await fetchFn(`/api/v1/sprints/${encodeURIComponent(sprintId)}/tasks`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact({
      orgId: scope.orgId,
      taskId,
    })),
  });
  return await parsePublicResponse(response);
}

async function parsePublicResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw new Error("Bulk task operation failed");
  return body;
}

function requireBulkScope(scope: BulkMutationScope): Required<BulkMutationScope> {
  const orgId = scope.orgId?.trim();
  const userId = scope.userId?.trim();
  if (!orgId || !userId) throw new Error("Organization and user scope are required.");
  return { orgId, userId, projectId: scope.projectId ?? null };
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== null)
  );
}

function queryValues(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
