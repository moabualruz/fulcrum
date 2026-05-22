/**
 * Pure logic for the TUI run detail overlay.
 * Tab state machine + keypress → action mapping.
 */

import type { RunStatus } from "@fulcrum/shared-dto";

export type RunDetailTab = "summary" | "transcript" | "diff" | "artifacts";

export const TABS: readonly RunDetailTab[] = [
  "summary",
  "transcript",
  "diff",
  "artifacts",
] as const;

const CANCELLABLE: ReadonlySet<RunStatus> = new Set(["queued", "running"]);
const RETRYABLE: ReadonlySet<RunStatus> = new Set(["failed", "cancelled"]);

export interface RunDetailRun {
  id: string;
  agent: string;
  status: RunStatus;
  sandboxMode: boolean;
  iterationCount: number;
}

export interface RunDetailState {
  run: RunDetailRun;
  activeTab: RunDetailTab;
}

export type RunDetailAction =
  | { type: "switchTab"; tab: RunDetailTab }
  | { type: "cancel"; runId: string }
  | { type: "retry"; runId: string }
  | { type: "close" };

export function initialRunDetailState(run: RunDetailRun): RunDetailState {
  return { run, activeTab: "summary" };
}

export function handleRunDetailKey(
  state: RunDetailState,
  key: string,
): RunDetailAction | null {
  switch (key) {
    case "l":
      return { type: "switchTab", tab: "transcript" };
    case "d":
      return { type: "switchTab", tab: "diff" };
    case "a":
      return { type: "switchTab", tab: "artifacts" };
    case "c":
      if (CANCELLABLE.has(state.run.status)) {
        return { type: "cancel", runId: state.run.id };
      }
      return null;
    case "r":
      if (RETRYABLE.has(state.run.status)) {
        return { type: "retry", runId: state.run.id };
      }
      return null;
    case "Escape":
      return { type: "close" };
    default:
      return null;
  }
}
