import type { BoardTask } from "$lib/product-queries";
import type { TaskStatus } from "$lib/server/tasks";
import { buildBoardSnapshot } from "./board-helpers";

export type SwimlaneMode = "none" | "assignee" | "priority" | "epic";

export interface Swimlane {
  id: string;
  label: string;
  tasks: BoardTask[];
}

export interface BoardMove {
  taskId: string;
  fromStatus: string;
  toStatus: TaskStatus | string;
}

function laneValue(task: BoardTask, mode: Exclude<SwimlaneMode, "none">): { id: string; label: string } {
  if (mode === "priority") return { id: String(task.priority), label: `P${task.priority}` };
  if (mode === "epic") {
    const epic = task.epic?.trim();
    return epic ? { id: epic, label: epic } : { id: "no-epic", label: "No epic" };
  }
  const assignee = task.assignee?.trim();
  return assignee ? { id: assignee, label: assignee } : { id: "unassigned", label: "Unassigned" };
}

export function buildSwimlanes(tasks: readonly BoardTask[], mode: SwimlaneMode): Swimlane[] {
  if (mode === "none") return [{ id: "all", label: "All tasks", tasks: [...tasks] }];

  const lanes = new Map<string, Swimlane>();
  for (const task of tasks) {
    const value = laneValue(task, mode);
    const lane = lanes.get(value.id) ?? { ...value, tasks: [] };
    lane.tasks.push(task);
    lanes.set(value.id, lane);
  }

  return Array.from(lanes.values()).sort((a, b) => {
    if (mode === "priority") return Number(b.id) - Number(a.id);
    if (a.id === "unassigned" || a.id === "no-epic") return 1;
    if (b.id === "unassigned" || b.id === "no-epic") return -1;
    return a.label.localeCompare(b.label);
  });
}

export function filterTasksBySprint(tasks: readonly BoardTask[], sprintId: string): BoardTask[] {
  if (sprintId === "all") return [...tasks];
  if (sprintId === "backlog") return tasks.filter((task) => !task.sprint_id);
  return tasks.filter((task) => task.sprint_id === sprintId);
}

export function applyBoardMove(tasks: readonly BoardTask[], move: BoardMove): BoardTask[] {
  return tasks.map((task) => (task.id === move.taskId ? { ...task, status: move.toStatus } : task));
}

export function revertBoardMove(tasks: readonly BoardTask[], move: BoardMove): BoardTask[] {
  return tasks.map((task) => (task.id === move.taskId ? { ...task, status: move.fromStatus } : task));
}

export function measureBoardSnapshot(tasks: readonly BoardTask[]): { taskCount: number; durationMs: number } {
  const now = globalThis.performance?.now.bind(globalThis.performance) ?? Date.now;
  const started = now();
  const snapshot = buildBoardSnapshot(tasks);
  let taskCount = 0;
  for (const column of Object.values(snapshot.groups)) taskCount += column.length;
  return { taskCount, durationMs: now() - started };
}
