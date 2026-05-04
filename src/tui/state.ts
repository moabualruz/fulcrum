/** TUI state machine — pure functions, no I/O. */

import type { PaneId, TuiState } from "./types.ts";

export type { TuiState };

export type KeyAction =
  | { kind: "select-repo"; repoId: string }
  | { kind: "checkout"; branch: string }
  | { kind: "load-diff"; sha: string }
  | { kind: "load-blame"; file: string }
  | { kind: "push"; repoId: string }
  | null;

export interface HandleKeyResult {
  state: TuiState;
  action: KeyAction;
}

const PANE_ORDER: PaneId[] = ["repos", "branches", "commits", "files"];

export function createInitialState(): TuiState {
  return {
    repos: [],
    selectedRepoIndex: 0,
    branches: [],
    selectedBranchIndex: 0,
    commits: [],
    selectedCommitIndex: 0,
    files: [],
    selectedFileIndex: 0,
    focusedPane: "repos",
    overlay: null,
    repoWriteOps: false,
    statusMessage: "",
  };
}

export function handleKey(state: TuiState, key: string): HandleKeyResult {
  // Escape always closes overlay
  if (key === "escape") {
    return { state: { ...state, overlay: null }, action: null };
  }

  // If overlay is open, don't process other keys
  if (state.overlay) {
    return { state, action: null };
  }

  switch (key) {
    case "tab":
      return handleTab(state);
    case "up":
      return handleUpDown(state, -1);
    case "down":
      return handleUpDown(state, 1);
    case "enter":
      return handleEnter(state);
    case "d":
      return handleDiff(state);
    case "b":
      return handleBlame(state);
    case "n":
      return handleNewBranch(state);
    case "x":
      return handleDeleteBranch(state);
    case "c":
      return handleCommit(state);
    case "p":
      return handlePush(state);
    default:
      return { state, action: null };
  }
}

function handleTab(state: TuiState): HandleKeyResult {
  const idx = PANE_ORDER.indexOf(state.focusedPane);
  const next = PANE_ORDER[(idx + 1) % PANE_ORDER.length] as PaneId;
  return { state: { ...state, focusedPane: next }, action: null };
}

function handleUpDown(state: TuiState, delta: number): HandleKeyResult {
  const s = { ...state };
  switch (state.focusedPane) {
    case "repos":
      s.selectedRepoIndex = clamp(state.selectedRepoIndex + delta, 0, state.repos.length - 1);
      break;
    case "branches":
      s.selectedBranchIndex = clamp(state.selectedBranchIndex + delta, 0, state.branches.length - 1);
      break;
    case "commits":
      s.selectedCommitIndex = clamp(state.selectedCommitIndex + delta, 0, state.commits.length - 1);
      break;
    case "files":
      s.selectedFileIndex = clamp(state.selectedFileIndex + delta, 0, state.files.length - 1);
      break;
  }
  return { state: s, action: null };
}

function handleEnter(state: TuiState): HandleKeyResult {
  switch (state.focusedPane) {
    case "repos": {
      const repo = state.repos[state.selectedRepoIndex];
      if (!repo) return { state, action: null };
      return { state, action: { kind: "select-repo", repoId: repo.id } };
    }
    case "branches": {
      const branch = state.branches[state.selectedBranchIndex];
      if (!branch) return { state, action: null };
      return { state, action: { kind: "checkout", branch: branch.name } };
    }
    default:
      return { state, action: null };
  }
}

function handleDiff(state: TuiState): HandleKeyResult {
  if (state.focusedPane !== "commits") return { state, action: null };
  const commit = state.commits[state.selectedCommitIndex];
  if (!commit) return { state, action: null };
  return { state, action: { kind: "load-diff", sha: commit.sha } };
}

function handleBlame(state: TuiState): HandleKeyResult {
  if (state.focusedPane !== "files") return { state, action: null };
  const file = state.files[state.selectedFileIndex];
  if (!file) return { state, action: null };
  return { state, action: { kind: "load-blame", file: file.name } };
}

function handleNewBranch(state: TuiState): HandleKeyResult {
  if (state.focusedPane !== "branches") return { state, action: null };
  if (!state.repoWriteOps) {
    return { state: { ...state, overlay: { kind: "gated", feature: "repo-write-ops" } }, action: null };
  }
  return { state: { ...state, overlay: { kind: "prompt", action: "new-branch", input: "" } }, action: null };
}

function handleDeleteBranch(state: TuiState): HandleKeyResult {
  if (state.focusedPane !== "branches") return { state, action: null };
  if (!state.repoWriteOps) {
    return { state: { ...state, overlay: { kind: "gated", feature: "repo-write-ops" } }, action: null };
  }
  return { state: { ...state, overlay: { kind: "prompt", action: "delete-branch", input: "" } }, action: null };
}

function handleCommit(state: TuiState): HandleKeyResult {
  if (!state.repoWriteOps) return { state, action: null };
  return { state: { ...state, overlay: { kind: "prompt", action: "commit", input: "" } }, action: null };
}

function handlePush(state: TuiState): HandleKeyResult {
  if (!state.repoWriteOps) return { state, action: null };
  const repo = state.repos[state.selectedRepoIndex];
  if (!repo) return { state, action: null };
  return { state, action: { kind: "push", repoId: repo.id } };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
