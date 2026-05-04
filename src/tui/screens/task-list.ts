import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { TuiTask } from "./task-types.ts";

export interface TaskListFilters {
  status?: string;
  assignee?: string;
  label?: string;
}

export interface TaskListScreenOptions {
  caller: {
    tasks: {
      list: () => Promise<TuiTask[]>;
      bulk: (input: { ids: string[]; status?: string; assignee?: string }) => Promise<{ ok: boolean }>;
    };
  };
  viewportRows?: number;
}

type Overlay = "none" | "bulk";

export class TaskListScreen {
  private tasks: TuiTask[] = [];
  private filters: TaskListFilters = {};
  private searchQuery = "";
  private searchActive = false;
  private selected = new Set<string>();
  private cursor = 0;
  private scrollTop = 0;
  private overlay: Overlay = "none";

  constructor(private readonly opts: TaskListScreenOptions) {}

  async load(): Promise<void> {
    this.tasks = await this.opts.caller.tasks.list();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Tasks"));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(`  Filters: ${this.filterChips.join(" ") || c.dim("none")}`);
    if (this.searchActive) renderer.writeln(`  Search: ${this.searchQuery}`);
    renderer.writeln();

    if (this.visibleTasks.length === 0) {
      renderer.writeln(c.dim("  No tasks."));
    } else {
      for (const task of this.visibleTasks) {
        const index = this.filteredTasks.indexOf(task);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const checked = this.selected.has(task.id) ? "[x]" : "[ ]";
        const labels = task.labels?.length ? ` #${task.labels.join(" #")}` : "";
        renderer.writeln(`${pointer} ${checked} ${task.title}  [${task.status}]  ${task.assignee ?? "unassigned"}${labels}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  / search  Esc clear  j/k navigate  Space select  B bulk  q back"));

    if (this.overlay === "bulk") {
      renderer.writeln();
      renderer.writeln(c.bold("  Bulk update"));
      renderer.writeln(c.dim(`  ${this.selected.size} selected`));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.searchActive) {
      if (key === "\x1b") {
        this.searchActive = false;
        this.searchQuery = "";
        this.cursor = 0;
        this.scrollTop = 0;
        return true;
      }

      if (key === "\b" || key === "\x7f") {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.cursor = 0;
        this.scrollTop = 0;
        this.clampCursor();
        return true;
      }

      if (key.length === 1 && key >= " ") {
        this.searchQuery += key;
        this.cursor = 0;
        this.scrollTop = 0;
        this.clampCursor();
        return true;
      }
    }

    if (key === "/") {
      this.searchActive = true;
      this.searchQuery = "";
      this.cursor = 0;
      this.scrollTop = 0;
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.filteredTasks.length - 1));
      this.keepCursorVisible();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }

    if (key === " ") {
      const task = this.filteredTasks[this.cursor];
      if (!task) return false;
      if (this.selected.has(task.id)) this.selected.delete(task.id);
      else this.selected.add(task.id);
      return true;
    }

    if (key === "B" || key === "b") {
      if (this.selected.size === 0) return false;
      this.overlay = "bulk";
      return true;
    }

    return false;
  }

  async applyFilter(filters: TaskListFilters): Promise<void> {
    this.filters = { ...this.filters, ...filters };
    this.cursor = 0;
    this.scrollTop = 0;
    this.clampCursor();
  }

  async submitBulkStatus(status: string): Promise<void> {
    const ids = [...this.selected];
    if (ids.length === 0) return;
    await this.opts.caller.tasks.bulk({ ids, status });
    this.tasks = this.tasks.map((task) => (this.selected.has(task.id) ? { ...task, status } : task));
    this.selected.clear();
    this.overlay = "none";
  }

  get visibleTasks(): readonly TuiTask[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.filteredTasks.slice(this.scrollTop, this.scrollTop + rows);
  }

  get selectedTaskIds(): string[] {
    return [...this.selected];
  }

  private get filteredTasks(): TuiTask[] {
    return this.tasks.filter((task) => {
      if (this.filters.status && task.status !== this.filters.status) return false;
      if (this.filters.assignee && task.assignee !== this.filters.assignee) return false;
      if (this.filters.label && !task.labels?.includes(this.filters.label)) return false;
      if (this.searchActive && this.searchQuery) {
        const haystack = [
          task.title,
          task.status,
          task.assignee,
          ...(task.labels ?? []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(this.searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }

  private get filterChips(): string[] {
    return [
      this.filters.status ? `[status: ${this.filters.status}]` : null,
      this.filters.assignee ? `[assignee: ${this.filters.assignee}]` : null,
      this.filters.label ? `[label: ${this.filters.label}]` : null,
    ].filter((chip): chip is string => Boolean(chip));
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.filteredTasks.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}
