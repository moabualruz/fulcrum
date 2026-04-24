import type { RunStatus, TaskStatus } from "./lifecycle.js";
import { terminalRunStatuses } from "./lifecycle.js";

const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["ready"],
  ready: ["running"],
  running: ["blocked", "review", "failed", "completed"],
  blocked: ["ready"],
  review: ["completed", "blocked", "running"],
  failed: ["ready"],
  completed: ["archived"],
  archived: []
};

const runTransitions: Record<RunStatus, readonly RunStatus[]> = {
  created: ["starting"],
  starting: ["running"],
  running: [
    "waiting_for_agent",
    "waiting_for_operator",
    "blocked",
    "cancel_requested",
    "failed",
    "succeeded"
  ],
  waiting_for_agent: ["running"],
  waiting_for_operator: ["running"],
  blocked: ["running"],
  cancel_requested: ["cancelled"],
  cancelled: [],
  failed: [],
  succeeded: ["review_required", "completed"],
  review_required: ["completed", "blocked"],
  completed: []
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return taskTransitions[from].includes(to);
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  if ((terminalRunStatuses as readonly string[]).includes(from)) {
    return false;
  }
  return runTransitions[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid run transition: ${from} -> ${to}`);
  }
}
