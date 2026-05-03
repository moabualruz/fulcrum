import type { TaskColumn, TaskSortDirection, TaskViewRow } from "./task-view-types";

export const DEFAULT_TASK_COLUMNS: readonly TaskColumn[] = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "sprint", label: "Sprint" },
  { key: "labels", label: "Labels" },
  { key: "created_at", label: "Created" },
] as const;

export const TASK_TABLE_STORAGE_KEY = "fulcrum:task-table:visible-columns";

function taskValue(task: TaskViewRow, column: string): string | number {
  if (column === "sprint") return task.sprint_name ?? task.sprint_id ?? "";
  if (column === "labels") return (task.labels ?? []).join(", ");
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
