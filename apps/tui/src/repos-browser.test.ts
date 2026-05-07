import { describe, expect, test } from "bun:test";
import { createInitialState, handleKey, type KeyAction } from "./state.ts";
import { renderStatusBar, renderRepoList, renderBranches, renderCommits, renderFiles, renderOverlay } from "./render.ts";
import type { RepoSummary, BranchInfo, CommitInfo, FileEntry, TuiState } from "./types.ts";

// -- Fixtures --

const REPO_A: RepoSummary = {
  id: "r1",
  name: "alpha",
  path: "/home/user/alpha",
  currentBranch: "main",
  lastSync: "2026-05-03T10:00:00Z",
  dirty: false,
};

const REPO_B: RepoSummary = {
  id: "r2",
  name: "beta",
  path: "/home/user/beta",
  currentBranch: "feat/x",
  lastSync: null,
  dirty: true,
};

const BRANCHES: BranchInfo[] = [
  { name: "main", current: true, lastCommitSha: "abc1234", lastCommitMessage: "init" },
  { name: "dev", current: false, lastCommitSha: "def5678", lastCommitMessage: "wip" },
];

const COMMITS: CommitInfo[] = [
  { sha: "abc1234", message: "init", author: "alice", date: "2026-05-03T09:00:00Z" },
  { sha: "def5678", message: "wip", author: "bob", date: "2026-05-03T08:00:00Z" },
];

const FILES: FileEntry[] = [
  { name: "src", path: "src", type: "dir" },
  { name: "README.md", path: "README.md", type: "file" },
];

function stateWith(overrides: Partial<TuiState> = {}): TuiState {
  return {
    repos: [REPO_A, REPO_B],
    selectedRepoIndex: 0,
    branches: BRANCHES,
    selectedBranchIndex: 0,
    commits: COMMITS,
    selectedCommitIndex: 0,
    files: FILES,
    selectedFileIndex: 0,
    focusedPane: "repos",
    overlay: null,
    repoWriteOps: false,
    statusMessage: "",
    ...overrides,
  };
}

// -- State tests --

describe("createInitialState", () => {
  test("returns empty state with repos pane focused", () => {
    const s = createInitialState();
    expect(s.focusedPane).toBe("repos");
    expect(s.repos).toEqual([]);
    expect(s.overlay).toBeNull();
    expect(s.repoWriteOps).toBe(false);
  });
});

describe("handleKey navigation", () => {
  test("arrow-down moves selection in repos pane", () => {
    const s = stateWith({ focusedPane: "repos", selectedRepoIndex: 0 });
    const next = handleKey(s, "down");
    expect(next.state.selectedRepoIndex).toBe(1);
  });

  test("arrow-down clamps at end of repos list", () => {
    const s = stateWith({ focusedPane: "repos", selectedRepoIndex: 1 });
    const next = handleKey(s, "down");
    expect(next.state.selectedRepoIndex).toBe(1);
  });

  test("arrow-up moves selection up in repos pane", () => {
    const s = stateWith({ focusedPane: "repos", selectedRepoIndex: 1 });
    const next = handleKey(s, "up");
    expect(next.state.selectedRepoIndex).toBe(0);
  });

  test("arrow-up clamps at top", () => {
    const s = stateWith({ focusedPane: "repos", selectedRepoIndex: 0 });
    const next = handleKey(s, "up");
    expect(next.state.selectedRepoIndex).toBe(0);
  });

  test("tab cycles focus: repos → branches → commits → files → repos", () => {
    let s = stateWith({ focusedPane: "repos" });
    s = handleKey(s, "tab").state;
    expect(s.focusedPane).toBe("branches");
    s = handleKey(s, "tab").state;
    expect(s.focusedPane).toBe("commits");
    s = handleKey(s, "tab").state;
    expect(s.focusedPane).toBe("files");
    s = handleKey(s, "tab").state;
    expect(s.focusedPane).toBe("repos");
  });

  test("arrow-down in branches pane moves branch selection", () => {
    const s = stateWith({ focusedPane: "branches", selectedBranchIndex: 0 });
    const next = handleKey(s, "down");
    expect(next.state.selectedBranchIndex).toBe(1);
  });

  test("arrow-down in commits pane moves commit selection", () => {
    const s = stateWith({ focusedPane: "commits", selectedCommitIndex: 0 });
    const next = handleKey(s, "down");
    expect(next.state.selectedCommitIndex).toBe(1);
  });

  test("arrow-down in files pane moves file selection", () => {
    const s = stateWith({ focusedPane: "files", selectedFileIndex: 0 });
    const next = handleKey(s, "down");
    expect(next.state.selectedFileIndex).toBe(1);
  });
});

describe("handleKey actions", () => {
  test("d on commit opens diff overlay", () => {
    const s = stateWith({ focusedPane: "commits", selectedCommitIndex: 0 });
    const next = handleKey(s, "d");
    expect(next.action).toEqual({ kind: "load-diff", sha: "abc1234" });
  });

  test("b on file opens blame action", () => {
    const s = stateWith({ focusedPane: "files", selectedFileIndex: 1 });
    const next = handleKey(s, "b");
    expect(next.action).toEqual({ kind: "load-blame", file: "README.md" });
  });

  test("enter on branch triggers checkout action", () => {
    const s = stateWith({ focusedPane: "branches", selectedBranchIndex: 1 });
    const next = handleKey(s, "enter");
    expect(next.action).toEqual({ kind: "checkout", branch: "dev" });
  });

  test("n on branches pane with repo-write-ops OFF shows gated overlay", () => {
    const s = stateWith({ focusedPane: "branches", repoWriteOps: false });
    const next = handleKey(s, "n");
    expect(next.state.overlay).toEqual({ kind: "gated", feature: "repo-write-ops" });
  });

  test("n on branches pane with repo-write-ops ON opens new-branch prompt", () => {
    const s = stateWith({ focusedPane: "branches", repoWriteOps: true });
    const next = handleKey(s, "n");
    expect(next.state.overlay).toEqual({ kind: "prompt", action: "new-branch", input: "" });
  });

  test("x on branches pane with repo-write-ops OFF shows gated overlay", () => {
    const s = stateWith({ focusedPane: "branches", repoWriteOps: false });
    const next = handleKey(s, "x");
    expect(next.state.overlay).toEqual({ kind: "gated", feature: "repo-write-ops" });
  });

  test("x on branches pane with repo-write-ops ON opens delete-branch prompt", () => {
    const s = stateWith({ focusedPane: "branches", repoWriteOps: true });
    const next = handleKey(s, "x");
    expect(next.state.overlay).toEqual({ kind: "prompt", action: "delete-branch", input: "" });
  });

  test("c key invisible (no action) when repo-write-ops OFF", () => {
    const s = stateWith({ focusedPane: "repos", repoWriteOps: false });
    const next = handleKey(s, "c");
    expect(next.action).toBeNull();
    expect(next.state.overlay).toBeNull();
  });

  test("c key opens commit prompt when repo-write-ops ON", () => {
    const s = stateWith({ focusedPane: "repos", repoWriteOps: true });
    const next = handleKey(s, "c");
    expect(next.state.overlay).toEqual({ kind: "prompt", action: "commit", input: "" });
  });

  test("p key invisible when repo-write-ops OFF", () => {
    const s = stateWith({ focusedPane: "repos", repoWriteOps: false });
    const next = handleKey(s, "p");
    expect(next.action).toBeNull();
  });

  test("p key triggers push action when repo-write-ops ON", () => {
    const s = stateWith({ focusedPane: "repos", repoWriteOps: true });
    const next = handleKey(s, "p");
    expect(next.action).toEqual({ kind: "push", repoId: "r1" });
  });

  test("escape closes overlay", () => {
    const s = stateWith({ overlay: { kind: "diff", sha: "abc", content: "patch" } });
    const next = handleKey(s, "escape");
    expect(next.state.overlay).toBeNull();
  });

  test("enter on repo in repos pane triggers select-repo action", () => {
    const s = stateWith({ focusedPane: "repos", selectedRepoIndex: 0 });
    const next = handleKey(s, "enter");
    expect(next.action).toEqual({ kind: "select-repo", repoId: "r1" });
  });
});

// -- Render tests --

describe("renderStatusBar", () => {
  test("shows branch, last-sync relative, and dirty indicator", () => {
    const s = stateWith({ selectedRepoIndex: 1 });
    const bar = renderStatusBar(s);
    expect(bar).toContain("[feat/x]");
    expect(bar).toContain("[dirty]");
  });

  test("shows branch and last-sync for clean repo", () => {
    const s = stateWith({ selectedRepoIndex: 0 });
    const bar = renderStatusBar(s);
    expect(bar).toContain("[main]");
    expect(bar).not.toContain("[dirty]");
    expect(bar).toContain("last-sync:");
  });

  test("shows 'never' when lastSync is null", () => {
    const s = stateWith({ selectedRepoIndex: 1 });
    const bar = renderStatusBar(s);
    expect(bar).toContain("last-sync: never");
  });
});

describe("renderRepoList", () => {
  test("renders repo names with selection indicator", () => {
    const s = stateWith({ selectedRepoIndex: 0, focusedPane: "repos" });
    const lines = renderRepoList(s);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("▸");
    expect(lines[0]).toContain("alpha");
    expect(lines[1]).not.toContain("▸");
    expect(lines[1]).toContain("beta");
  });
});

describe("renderBranches", () => {
  test("renders branch names with current indicator", () => {
    const s = stateWith();
    const lines = renderBranches(s);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("*");
    expect(lines[0]).toContain("main");
    expect(lines[1]).not.toContain("*");
    expect(lines[1]).toContain("dev");
  });
});

describe("renderCommits", () => {
  test("renders commit sha prefix and message", () => {
    const s = stateWith();
    const lines = renderCommits(s);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("abc1234");
    expect(lines[0]).toContain("init");
  });
});

describe("renderFiles", () => {
  test("renders file tree with type indicators", () => {
    const s = stateWith();
    const lines = renderFiles(s);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("📁");
    expect(lines[0]).toContain("src");
    expect(lines[1]).toContain("📄");
    expect(lines[1]).toContain("README.md");
  });
});

describe("renderOverlay", () => {
  test("renders diff overlay with content", () => {
    const s = stateWith({ overlay: { kind: "diff", sha: "abc", content: "+new line\n-old line" } });
    const lines = renderOverlay(s);
    expect(lines!.join("\n")).toContain("+new line");
    expect(lines!.join("\n")).toContain("-old line");
  });

  test("renders blame overlay with entries", () => {
    const s = stateWith({
      overlay: {
        kind: "blame",
        file: "README.md",
        entries: [
          { sha: "abc1234", author: "alice", lineNumber: 1, content: "# Title" },
        ],
      },
    });
    const lines = renderOverlay(s);
    expect(lines!.join("\n")).toContain("abc1234");
    expect(lines!.join("\n")).toContain("alice");
    expect(lines!.join("\n")).toContain("# Title");
  });

  test("renders gated overlay with feature name", () => {
    const s = stateWith({ overlay: { kind: "gated", feature: "repo-write-ops" } });
    const lines = renderOverlay(s);
    expect(lines!.join("\n")).toContain("FEATURE_GATED");
    expect(lines!.join("\n")).toContain("repo-write-ops");
  });

  test("returns null when no overlay", () => {
    const s = stateWith({ overlay: null });
    expect(renderOverlay(s)).toBeNull();
  });
});
