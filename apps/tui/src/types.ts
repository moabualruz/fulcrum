/** Shared types for the TUI repos browser pane. */

export interface RepoSummary {
  id: string;
  name: string;
  path: string;
  currentBranch: string;
  lastSync: string | null; // ISO timestamp
  dirty: boolean;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  lastCommitSha: string;
  lastCommitMessage: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string; // ISO
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface BlameEntry {
  sha: string;
  author: string;
  lineNumber: number;
  content: string;
}

export type PaneId = "repos" | "branches" | "commits" | "files";

export interface TuiState {
  repos: RepoSummary[];
  selectedRepoIndex: number;
  branches: BranchInfo[];
  selectedBranchIndex: number;
  commits: CommitInfo[];
  selectedCommitIndex: number;
  files: FileEntry[];
  selectedFileIndex: number;
  focusedPane: PaneId;
  overlay: OverlayState | null;
  repoWriteOps: boolean;
  statusMessage: string;
}

export type OverlayState =
  | { kind: "diff"; sha: string; content: string }
  | { kind: "blame"; file: string; entries: BlameEntry[] }
  | { kind: "prompt"; action: "new-branch" | "delete-branch" | "commit"; input: string }
  | { kind: "gated"; feature: string };

export type SearchMode = "fts" | "hybrid";

export interface SearchOptions {
  query: string;
  mode: SearchMode;
  env?: Record<string, string | undefined>;
}

export interface SearchResult {
  id: string;
  title: string;
  kind: string;
  score: number;
  snippet?: string;
}

export interface SettingsService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
