import type { BoardTask } from "$lib/product-queries";
// SvelteKit's `$lib/server/*` rule blocks runtime imports of `tasks.ts` from
// any module that ends up in the browser bundle. We pull the type only and
// re-declare the canonical status order locally — the type guarantees the
// list matches the server's `TaskStatus` definition.
import type { TaskStatus } from "$lib/server/tasks";

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export interface BoardSnapshot {
  groups: Record<TaskStatus, BoardTask[]>;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function describeStatus(status: TaskStatus): string {
  return STATUS_LABELS[status];
}

function emptyGroups(): Record<TaskStatus, BoardTask[]> {
  return {
    pending: [],
    in_progress: [],
    blocked: [],
    completed: [],
    cancelled: [],
  };
}

function compare(a: BoardTask, b: BoardTask): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildBoardSnapshot(tasks: readonly BoardTask[]): BoardSnapshot {
  const groups = emptyGroups();
  const known = new Set<string>(TASK_STATUSES);
  for (const task of tasks) {
    if (!known.has(task.status)) continue;
    groups[task.status as TaskStatus].push(task);
  }
  for (const status of TASK_STATUSES) groups[status].sort(compare);
  return { groups };
}

function findCard(snap: BoardSnapshot, taskId: string): { status: TaskStatus; index: number } | null {
  for (const status of TASK_STATUSES) {
    const idx = snap.groups[status].findIndex((t) => t.id === taskId);
    if (idx !== -1) return { status, index: idx };
  }
  return null;
}

function cloneGroups(snap: BoardSnapshot): Record<TaskStatus, BoardTask[]> {
  const next = emptyGroups();
  for (const status of TASK_STATUSES) next[status] = snap.groups[status].slice();
  return next;
}

export function optimisticMove(
  snap: BoardSnapshot,
  taskId: string,
  toStatus: TaskStatus,
): { next: BoardSnapshot; from: TaskStatus | null } {
  const found = findCard(snap, taskId);
  if (!found) return { next: snap, from: null };
  if (found.status === toStatus) return { next: snap, from: found.status };
  const next = cloneGroups(snap);
  const [card] = next[found.status].splice(found.index, 1);
  next[toStatus].push({ ...card, status: toStatus });
  return { next: { groups: next }, from: found.status };
}

export interface KeyboardMoveOptions {
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
  withMod: boolean;
}

export function keyboardMove(
  snap: BoardSnapshot,
  taskId: string,
  opts: KeyboardMoveOptions,
): { next: BoardSnapshot; description: string | null } {
  const found = findCard(snap, taskId);
  if (!found) return { next: snap, description: null };
  const { key, withMod } = opts;
  if ((key === "ArrowUp" || key === "ArrowDown") && !withMod) {
    const column = snap.groups[found.status];
    const target = key === "ArrowUp" ? found.index - 1 : found.index + 1;
    if (target < 0 || target >= column.length) return { next: snap, description: null };
    const next = cloneGroups(snap);
    const arr = next[found.status];
    [arr[found.index], arr[target]] = [arr[target], arr[found.index]];
    const moved = arr[target];
    const direction = key === "ArrowUp" ? "up" : "down";
    return {
      next: { groups: next },
      description: `Moved '${moved.title}' ${direction} in ${describeStatus(found.status)}.`,
    };
  }
  if ((key === "ArrowLeft" || key === "ArrowRight") && withMod) {
    const idx = TASK_STATUSES.indexOf(found.status);
    const target = key === "ArrowRight" ? idx + 1 : idx - 1;
    if (target < 0 || target >= TASK_STATUSES.length) return { next: snap, description: null };
    const toStatus = TASK_STATUSES[target];
    const moved = snap.groups[found.status][found.index];
    const { next } = optimisticMove(snap, taskId, toStatus);
    return {
      next,
      description: `Moved '${moved.title}' from ${describeStatus(found.status)} to ${describeStatus(toStatus)}.`,
    };
  }
  return { next: snap, description: null };
}
