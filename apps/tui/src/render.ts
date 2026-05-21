/** Render TUI state to string lines: pure functions, no terminal I/O. */

import type { TuiState } from "./types.ts";

export function renderStatusBar(state: TuiState): string {
  const repo = state.repos[state.selectedRepoIndex];
  if (!repo) return "";
  const syncLabel = repo.lastSync ? relativeTime(repo.lastSync) : "never";
  const dirty = repo.dirty ? "  [dirty]" : "";
  return `[${repo.currentBranch}]  last-sync: ${syncLabel}${dirty}`;
}

export function renderRepoList(state: TuiState): string[] {
  return state.repos.map((r, i) => {
    const sel = state.focusedPane === "repos" && i === state.selectedRepoIndex ? "▸ " : "  ";
    return `${sel}${r.name}`;
  });
}

export function renderBranches(state: TuiState): string[] {
  return state.branches.map((b, i) => {
    const sel = state.focusedPane === "branches" && i === state.selectedBranchIndex ? "▸ " : "  ";
    const cur = b.current ? "* " : "  ";
    return `${sel}${cur}${b.name}`;
  });
}

export function renderCommits(state: TuiState): string[] {
  return state.commits.map((c, i) => {
    const sel = state.focusedPane === "commits" && i === state.selectedCommitIndex ? "▸ " : "  ";
    return `${sel}${c.sha.slice(0, 7)} ${c.message} (${c.author})`;
  });
}

export function renderFiles(state: TuiState): string[] {
  return state.files.map((f, i) => {
    const sel = state.focusedPane === "files" && i === state.selectedFileIndex ? "▸ " : "  ";
    const icon = f.type === "dir" ? "📁" : "📄";
    return `${sel}${icon} ${f.name}`;
  });
}

export function renderOverlay(state: TuiState): string[] | null {
  if (!state.overlay) return null;
  switch (state.overlay.kind) {
    case "diff":
      return [
        `── Diff: ${state.overlay.sha} ──`,
        ...state.overlay.content.split("\n"),
        "",
        "Press ESC to close",
      ];
    case "blame":
      return [
        `── Blame: ${state.overlay.file} ──`,
        ...state.overlay.entries.map(
          (e) => `${e.sha.slice(0, 7)} ${e.author.padEnd(12)} ${e.lineNumber}: ${e.content}`,
        ),
        "",
        "Press ESC to close",
      ];
    case "gated":
      return [
        "╔══════════════════════════╗",
        "║     FEATURE_GATED        ║",
        `║  ${state.overlay.feature.padEnd(22)}  ║`,
        "║  Enable to use this op  ║",
        "╚══════════════════════════╝",
      ];
    case "prompt":
      return [
        `── ${state.overlay.action} ──`,
        `> ${state.overlay.input}`,
        "",
        "Press ESC to cancel",
      ];
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
