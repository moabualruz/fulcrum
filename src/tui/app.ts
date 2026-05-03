/** TUI application — wires state machine + renderer to terminal I/O. */

import { createInitialState, handleKey, type KeyAction } from "./state.ts";
import {
  renderStatusBar,
  renderRepoList,
  renderBranches,
  renderCommits,
  renderFiles,
  renderOverlay,
} from "./render.ts";
import type { TuiState, RepoSummary } from "./types.ts";

// Nav entries for the top bar
const NAV_ENTRIES = ["Repos", "Tasks", "Runs", "Memory"] as const;
const ACTIVE_NAV = 0; // Repos is the active pane

export async function runTui(argv: readonly string[]): Promise<void> {
  const repoWriteOps = (process.env["FULCRUM_FEATURES"] ?? "").includes("repo-write-ops");

  let state: TuiState = {
    ...createInitialState(),
    repoWriteOps,
    // Placeholder repos for demo; real impl would call tRPC repos.list
    repos: discoverLocalRepos(),
  };

  const stdin = process.stdin;
  if (!stdin.isTTY) {
    console.error("fulcrum tui: requires a TTY");
    process.exit(1);
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  draw(state);

  stdin.on("data", (data: string) => {
    const key = parseKey(data);
    if (key === "q" || key === "ctrl-c") {
      cleanup();
      process.exit(0);
    }
    const result = handleKey(state, key);
    state = result.state;

    // Handle async actions (would call tRPC in real impl)
    if (result.action) {
      handleAction(state, result.action).then((s) => {
        state = s;
        draw(state);
      });
    } else {
      draw(state);
    }
  });
}

function draw(state: TuiState): void {
  const rows = process.stdout.rows ?? 24;
  const cols = process.stdout.columns ?? 80;

  // Clear screen
  process.stdout.write("\x1b[2J\x1b[H");

  // Nav bar
  const nav = NAV_ENTRIES.map((n, i) =>
    i === ACTIVE_NAV ? `\x1b[7m ${n} \x1b[0m` : ` ${n} `,
  ).join("│");
  process.stdout.write(nav + "\n");
  process.stdout.write("─".repeat(cols) + "\n");

  const overlay = renderOverlay(state);
  if (overlay) {
    for (const line of overlay) {
      process.stdout.write(line + "\n");
    }
    return;
  }

  // Layout: left column (repos) | right top (branches) / right bottom-left (commits) / right bottom-right (files)
  const repoLines = renderRepoList(state);
  const branchLines = renderBranches(state);
  const commitLines = renderCommits(state);
  const fileLines = renderFiles(state);

  const leftWidth = Math.floor(cols * 0.3);
  const rightWidth = cols - leftWidth - 1;
  const halfRight = Math.floor(rightWidth / 2);

  // Pane headers
  const paneHeight = rows - 5; // nav + separator + status bar + padding
  const topHalf = Math.floor(paneHeight / 2);

  for (let i = 0; i < paneHeight; i++) {
    const leftLine = (repoLines[i] ?? "").slice(0, leftWidth).padEnd(leftWidth);
    let rightLine: string;
    if (i === 0) {
      rightLine = `  Branches${" ".repeat(Math.max(0, halfRight - 10))}│  Commits / Files`;
    } else if (i < topHalf) {
      const bLine = (branchLines[i - 1] ?? "").slice(0, halfRight);
      rightLine = `${bLine.padEnd(halfRight)}│`;
    } else if (i === topHalf) {
      rightLine = "─".repeat(rightWidth);
    } else {
      const ci = i - topHalf - 1;
      const cLine = (commitLines[ci] ?? "").slice(0, halfRight);
      const fLine = (fileLines[ci] ?? "").slice(0, halfRight);
      rightLine = `${cLine.padEnd(halfRight)}│${fLine}`;
    }
    process.stdout.write(`${leftLine}│${rightLine}\n`);
  }

  // Status bar
  process.stdout.write("─".repeat(cols) + "\n");
  process.stdout.write(renderStatusBar(state) + "\n");
}

async function handleAction(state: TuiState, action: NonNullable<KeyAction>): Promise<TuiState> {
  // Stub implementations — would call tRPC procedures in real impl
  switch (action.kind) {
    case "select-repo":
      return {
        ...state,
        statusMessage: `Selected repo ${action.repoId}`,
        // Would populate branches, commits, files from tRPC
      };
    case "checkout":
      return { ...state, statusMessage: `Checkout ${action.branch} (stub)` };
    case "load-diff":
      return {
        ...state,
        overlay: { kind: "diff", sha: action.sha, content: "(diff loading not wired yet)" },
      };
    case "load-blame":
      return {
        ...state,
        overlay: { kind: "blame", file: action.file, entries: [] },
      };
    case "push":
      return { ...state, statusMessage: `Push ${action.repoId} (stub)` };
  }
}

function discoverLocalRepos(): RepoSummary[] {
  // Stub: return empty. Real impl discovers registered repos via tRPC repos.list
  return [];
}

function parseKey(data: string): string {
  if (data === "\x1b[A") return "up";
  if (data === "\x1b[B") return "down";
  if (data === "\x1b[C") return "right";
  if (data === "\x1b[D") return "left";
  if (data === "\t") return "tab";
  if (data === "\r" || data === "\n") return "enter";
  if (data === "\x1b") return "escape";
  if (data === "\x03") return "ctrl-c";
  return data;
}

function cleanup(): void {
  process.stdout.write("\x1b[2J\x1b[H"); // clear screen
  process.stdin.setRawMode(false);
}
