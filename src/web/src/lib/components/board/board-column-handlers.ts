import type { BoardTask } from "$lib/product-queries";
import type { TaskStatus } from "$lib/server/tasks";

export interface DndConsiderEvent {
  detail: { items: BoardTask[]; info?: { trigger?: string } };
}

export interface DndFinalizeEvent {
  detail: { items: BoardTask[]; info?: { id?: string; trigger?: string } };
}

export interface DndMovePayload {
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
}

/**
 * Diff the column's post-drag tasks against the whole-board pre-drag tasks
 * to recover the cross-column move payload. svelte-dnd-action only ever moves
 * one card at a time across zones; if more than one task in `afterColumn`
 * differs from `beforeAll`, return the lexicographically-smallest id for
 * deterministic ordering.
 */
export function diffMoveFromBoard(
  beforeAll: readonly BoardTask[],
  afterColumn: readonly BoardTask[],
  toStatus: TaskStatus,
): DndMovePayload | null {
  const priorById = new Map<string, BoardTask>();
  for (const task of beforeAll) priorById.set(task.id, task);

  const candidates: DndMovePayload[] = [];
  for (const task of afterColumn) {
    const prior = priorById.get(task.id);
    if (!prior) continue; // defensive: unknown task in afterColumn
    if (prior.status === toStatus) continue;
    candidates.push({
      taskId: task.id,
      fromStatus: prior.status as TaskStatus,
      toStatus,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));
  return candidates[0];
}
