import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface RepoListItem {
  id: string;
  name: string;
  slug: string;
  supervisionMode?: string | null;
  lastSyncedAt?: string | Date | null;
  branchCount?: number | null;
}

export interface ReposScreenOptions {
  caller: {
    repos: {
      list: () => Promise<RepoListItem[]>;
      sync: (input: { id: string }) => Promise<Partial<RepoListItem> & { id: string }>;
      register: (input: { name: string; path: string }) => Promise<RepoListItem>;
    };
  };
  onOpenRepo?: (id: string) => void;
  viewportRows?: number;
}

type ReposOverlay = "none" | "register";

export class ReposScreen {
  private repos: RepoListItem[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: ReposOverlay = "none";

  constructor(private readonly opts: ReposScreenOptions) {}

  async load(): Promise<void> {
    this.repos = await this.opts.caller.repos.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.repos.length - 1));
    this.keepCursorVisible();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Repos"));
    renderer.separator();
    renderer.writeln();

    if (this.repos.length === 0) {
      renderer.writeln(c.dim("  No repos registered."));
    } else {
      for (const repo of this.visibleRepos) {
        const index = this.repos.indexOf(repo);
        const prefix = index === this.cursor ? c.bold("> ") : "  ";
        renderer.writeln(
          `${prefix}${repo.name}  ${c.dim(repo.slug)}  ${repo.supervisionMode ?? "manual"}  ${formatSynced(repo.lastSyncedAt)}  branches ${repo.branchCount ?? 0}`,
        );
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  Enter open  s sync  r register  q back"));

    if (this.overlay === "register") {
      renderer.writeln();
      renderer.writeln(c.bold("  Register repo"));
      renderer.writeln(c.dim("  Enter name and path to register."));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.repos.length - 1));
      this.keepCursorVisible();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(this.cursor - 1, 0);
      this.keepCursorVisible();
      return true;
    }

    if (key === "r") {
      this.overlay = "register";
      return true;
    }

    if (key === "s") {
      await this.syncCurrent();
      return true;
    }

    if (key === "\r" || key === "\n") {
      const repo = this.repos[this.cursor];
      if (!repo) return false;
      this.opts.onOpenRepo?.(repo.id);
      return true;
    }

    return false;
  }

  async submitRegister(input: { name: string; path: string }): Promise<void> {
    const name = input.name.trim();
    const path = input.path.trim();
    if (!name || !path) return;
    const repo = await this.opts.caller.repos.register({ name, path });
    this.repos = [...this.repos, repo];
    this.cursor = this.repos.length - 1;
    this.overlay = "none";
    this.keepCursorVisible();
  }

  get visibleRepos(): readonly RepoListItem[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.repos.slice(this.scrollTop, this.scrollTop + rows);
  }

  private async syncCurrent(): Promise<void> {
    const repo = this.repos[this.cursor];
    if (!repo) return;
    const updated = await this.opts.caller.repos.sync({ id: repo.id });
    this.repos = this.repos.map((item) => (item.id === repo.id ? { ...item, ...updated } : item));
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

export interface RepoFileTreeItem {
  id: string;
  path: string;
  type: "dir" | "file";
  parentId?: string | null;
}

export interface RepoCommitItem {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface RepoDetailScreenOptions {
  repoId: string;
  caller: {
    repos: {
      get: (input: { id: string }) => Promise<RepoListItem>;
      fileTree: (input: { id: string }) => Promise<RepoFileTreeItem[]>;
      fileContent: (input: { id: string; path: string }) => Promise<{ path: string; content: string }>;
      commits: (input: { id: string }) => Promise<RepoCommitItem[]>;
      diff: (input: { id: string; sha: string }) => Promise<{ sha: string; diff: string }>;
    };
  };
}

type RepoDetailFocus = "files" | "commits" | "diff";

export class RepoDetailScreen {
  private repo: RepoListItem | null = null;
  private files: RepoFileTreeItem[] = [];
  private commits: RepoCommitItem[] = [];
  private fileCursor = 0;
  private commitCursor = 0;
  private readonly expanded = new Set<string>();
  private focus: RepoDetailFocus = "files";
  private selectedFile: { path: string; content: string } | null = null;
  private selectedDiff: { sha: string; diff: string } | null = null;

  constructor(private readonly opts: RepoDetailScreenOptions) {}

  async load(): Promise<void> {
    const input = { id: this.opts.repoId };
    const [repo, files, commits] = await Promise.all([
      this.opts.caller.repos.get(input),
      this.opts.caller.repos.fileTree(input),
      this.opts.caller.repos.commits(input),
    ]);
    this.repo = repo;
    this.files = files;
    this.commits = commits;
    this.fileCursor = Math.min(this.fileCursor, Math.max(0, this.visibleFileRows.length - 1));
    this.commitCursor = Math.min(this.commitCursor, Math.max(0, this.commits.length - 1));
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  Repo › ${this.repo?.name ?? this.opts.repoId}`));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(
      `  ${this.repo?.supervisionMode ?? "manual"}  ${formatSynced(this.repo?.lastSyncedAt)}  branches ${this.repo?.branchCount ?? 0}`,
    );
    renderer.writeln();

    if (this.focus === "commits" || this.focus === "diff") {
      this.renderCommits(renderer);
    } else {
      this.renderFiles(renderer);
    }

    renderer.writeln();
    renderer.writeln(c.dim("  f files  l commit log  j/k move  Enter open  -> expand  <- collapse"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "f") {
      this.focus = "files";
      return true;
    }

    if (key === "l") {
      this.focus = "commits";
      this.selectedDiff = null;
      return true;
    }

    if (this.focus === "commits" || this.focus === "diff") return this.handleCommitKey(key);
    return this.handleFileKey(key);
  }

  private async handleFileKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.fileCursor = Math.min(this.fileCursor + 1, Math.max(0, this.visibleFileRows.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.fileCursor = Math.max(0, this.fileCursor - 1);
      return true;
    }

    const row = this.visibleFileRows[this.fileCursor];
    if (!row) return false;

    if (key === "\x1b[C") {
      if (row.file.type === "dir") this.expanded.add(row.file.id);
      return true;
    }

    if (key === "\x1b[D") {
      if (row.file.type === "dir") this.expanded.delete(row.file.id);
      return true;
    }

    if (key === "\r" || key === "\n") {
      if (row.file.type === "dir") {
        if (this.expanded.has(row.file.id)) this.expanded.delete(row.file.id);
        else this.expanded.add(row.file.id);
        return true;
      }
      this.selectedFile = await this.opts.caller.repos.fileContent({ id: this.opts.repoId, path: row.file.path });
      return true;
    }

    return false;
  }

  private async handleCommitKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.commitCursor = Math.min(this.commitCursor + 1, Math.max(0, this.commits.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.commitCursor = Math.max(0, this.commitCursor - 1);
      return true;
    }

    if (key === "\r" || key === "\n") {
      const commit = this.commits[this.commitCursor];
      if (!commit) return false;
      this.selectedDiff = await this.opts.caller.repos.diff({ id: this.opts.repoId, sha: commit.sha });
      this.focus = "diff";
      return true;
    }

    return false;
  }

  private renderFiles(renderer: Renderer): void {
    renderer.writeln(c.bold("  File tree"));
    for (const row of this.visibleFileRows) {
      const index = this.visibleFileRows.findIndex((candidate) => candidate.file.id === row.file.id);
      const selected = index === this.fileCursor;
      const marker = row.file.type === "dir" ? (this.expanded.has(row.file.id) ? "v" : ">") : " ";
      const line = `  ${"  ".repeat(row.depth)}${marker} ${row.file.path}`;
      renderer.writeln(selected ? c.inverse(line) : line);
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Content"));
    if (!this.selectedFile) {
      renderer.writeln(c.dim("  Select a file."));
      return;
    }
    renderer.writeln(`  ${this.selectedFile.path}`);
    for (const line of this.selectedFile.content.split("\n").slice(0, 50)) {
      if (line.length > 0) renderer.writeln(`  ${line}`);
    }
  }

  private renderCommits(renderer: Renderer): void {
    renderer.writeln(c.bold(this.focus === "diff" ? "  Unified diff" : "  Commit log"));
    for (let index = 0; index < this.commits.length; index++) {
      const commit = this.commits[index]!;
      const line = `  ${commit.sha}  ${commit.message}  ${commit.author}  ${commit.date}`;
      renderer.writeln(index === this.commitCursor ? c.inverse(line) : line);
    }

    if (this.selectedDiff) {
      renderer.writeln();
      renderer.writeln(c.bold(`  Unified diff ${this.selectedDiff.sha}`));
      for (const line of this.selectedDiff.diff.split("\n").slice(0, 80)) {
        if (!line) continue;
        renderer.writeln(`  ${line}`);
      }
    }
  }

  private get visibleFileRows(): Array<{ file: RepoFileTreeItem; depth: number }> {
    const roots = this.files.filter((file) => !file.parentId).sort(compareFiles);
    return roots.flatMap((file) => this.flattenFile(file, 0));
  }

  private flattenFile(file: RepoFileTreeItem, depth: number): Array<{ file: RepoFileTreeItem; depth: number }> {
    const rows = [{ file, depth }];
    if (file.type !== "dir" || !this.expanded.has(file.id)) return rows;
    for (const child of this.childrenOf(file.id).sort(compareFiles)) rows.push(...this.flattenFile(child, depth + 1));
    return rows;
  }

  private childrenOf(parentId: string): RepoFileTreeItem[] {
    return this.files.filter((file) => file.parentId === parentId);
  }
}

function compareFiles(a: RepoFileTreeItem, b: RepoFileTreeItem): number {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.path.localeCompare(b.path);
}

function formatSynced(value: string | Date | null | undefined): string {
  if (!value) return "never synced";
  if (value instanceof Date) return value.toISOString();
  return value;
}
