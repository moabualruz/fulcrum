import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { TASK_STATUSES, type TuiTask } from "./task-types.ts";

export interface TaskBoardScreenOptions {
  caller: {
    tasks: {
      list: () => Promise<TuiTask[]>;
      update: (input: { id: string; status: string }) => Promise<TuiTask>;
      create: (input: TaskCreateInput) => Promise<TuiTask>;
    };
  };
  onOpenTask?: (id: string) => void;
  createScope?: TaskCreateScope;
}

export interface TaskCreateScope {
  source?: "board" | "list" | "planning";
  projectId?: string;
  sprintId?: string;
  moduleId?: string;
  cycleId?: string;
}

export interface TaskCreateInput extends TaskCreateScope {
  title: string;
  status: string;
  recurrence?: string;
}

export interface TaskCreateDraft {
  title: string;
  recurrence?: string;
}

export class TaskBoardScreen {
  private tasks: TuiTask[] = [];
  private cursor = 0;
  private createActive = false;
  private createDraft: TaskCreateDraft = { title: "" };
  private createError: string | null = null;

  constructor(private readonly opts: TaskBoardScreenOptions) {}

  async load(): Promise<void> {
    this.tasks = await this.opts.caller.tasks.list();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Task board"));
    renderer.separator();
    renderer.writeln();

    for (const status of TASK_STATUSES) {
      renderer.writeln(c.bold(`  ${status.toUpperCase()}`));
      const columnTasks = this.tasks.filter((task) => task.status === status);
      if (columnTasks.length === 0) {
        renderer.writeln(c.dim("    No tasks."));
      } else {
        for (const task of columnTasks) {
          const pointer = this.currentTask?.id === task.id ? c.bold(">") : " ";
          renderer.writeln(`${pointer}   ${task.title}  [${task.status}]`);
        }
      }
      renderer.writeln();
    }

    renderer.writeln(c.dim("  h/l move  Enter detail  c create  q back"));

    if (this.createActive) {
      renderer.writeln();
      renderer.writeln(c.bold("  Create task"));
      renderer.writeln(`  Scope: ${formatCreateScope(this.opts.createScope, "board")}`);
      renderer.writeln(`  Title: ${this.createDraft.title || c.dim("(empty)")}`);
      renderer.writeln(`  Recurrence: ${this.createDraft.recurrence ? recurrencePreview(this.createDraft.recurrence).summary : c.dim("(none)")}`);
      if (this.createError) {
        renderer.writeln(c.red(`  ${this.createError}`));
        renderer.writeln(c.dim(`  Retry: ${retryCommand(this.createDraft, this.opts.createScope)}`));
      }
      renderer.writeln(c.dim("  Enter title, recurrence optional, submit keeps draft on error."));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "h" || key === "\x1b[D") return this.moveCurrent(-1);
    if (key === "l" || key === "\x1b[C") return this.moveCurrent(1);

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.tasks.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    if (key === "\r" || key === "\n") {
      if (!this.currentTask) return false;
      this.opts.onOpenTask?.(this.currentTask.id);
      return true;
    }

    if (key === "c") {
      this.createActive = true;
      return true;
    }

    return false;
  }

  updateCreateDraft(input: Partial<TaskCreateDraft>): void {
    this.createActive = true;
    this.createDraft = { ...this.createDraft, ...input };
    this.createError = null;
  }

  async submitCreate(input: string | Partial<TaskCreateDraft> = {}): Promise<void> {
    const draft = typeof input === "string" ? { title: input } : input;
    this.updateCreateDraft(draft);
    const title = this.createDraft.title.trim();
    if (!title) {
      this.createError = "Title required";
      return;
    }
    if (this.hasDuplicateTitle(title)) {
      this.createError = `Duplicate task title in ${this.opts.createScope?.projectId ?? "current scope"}`;
      return;
    }
    try {
      const task = await this.opts.caller.tasks.create({
        ...compactScope(this.opts.createScope),
        title,
        status: "todo",
        ...(this.createDraft.recurrence ? { recurrence: this.createDraft.recurrence.trim() } : {}),
      });
      this.tasks = [...this.tasks, task];
      this.cursor = this.tasks.length - 1;
      this.createActive = false;
      this.createDraft = { title: "" };
      this.createError = null;
    } catch (error) {
      this.createError = error instanceof Error ? error.message : String(error);
    }
  }

  private get currentTask(): TuiTask | undefined {
    return this.tasks[this.cursor];
  }

  private async moveCurrent(delta: -1 | 1): Promise<boolean> {
    const task = this.currentTask;
    if (!task) return false;
    const statusIndex = TASK_STATUSES.indexOf(task.status as (typeof TASK_STATUSES)[number]);
    if (statusIndex === -1) return false;
    const nextStatus = TASK_STATUSES[statusIndex + delta];
    if (!nextStatus) return false;
    await this.opts.caller.tasks.update({ id: task.id, status: nextStatus });
    this.tasks = this.tasks.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item));
    return true;
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.tasks.length - 1));
  }

  private hasDuplicateTitle(title: string): boolean {
    const normalized = title.trim().toLowerCase();
    return this.tasks.some((task) => task.title.trim().toLowerCase() === normalized);
  }
}

export function formatCreateScope(scope: TaskCreateScope | undefined, fallback: TaskCreateScope["source"]): string {
  const source = scope?.source ?? fallback;
  return [
    source,
    `project=${scope?.projectId ?? "none"}`,
    `sprint=${scope?.sprintId ?? "none"}`,
    `module=${scope?.moduleId ?? "none"}`,
    `cycle=${scope?.cycleId ?? "none"}`,
  ].join("  ");
}

export function recurrencePreview(rule: string): { rule: string; summary: string; instances: string[] } {
  const normalized = rule.trim();
  const today = new Date("2026-05-19T00:00:00.000Z");
  const lower = normalized.toLowerCase();
  const stepDays = lower.includes("daily") ? 1 : lower.includes("monthly") ? 30 : 7;
  const label = stepDays === 1 ? "daily" : stepDays === 30 ? "monthly" : "weekly";
  const instances = [0, 1, 2].map((offset) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset * stepDays);
    return date.toISOString().slice(0, 10);
  });
  return { rule: normalized, summary: `${label} preview: ${instances.join(", ")}`, instances };
}

export function retryCommand(draft: TaskCreateDraft, scope: TaskCreateScope | undefined): string {
  const args = ["fulcrum task new"];
  if (draft.title) args.push(`--title ${quoteArg(draft.title)}`);
  if (scope?.projectId) args.push(`--project ${quoteArg(scope.projectId)}`);
  if (scope?.sprintId) args.push(`--sprint ${quoteArg(scope.sprintId)}`);
  if (scope?.moduleId) args.push(`--module ${quoteArg(scope.moduleId)}`);
  if (scope?.cycleId) args.push(`--cycle ${quoteArg(scope.cycleId)}`);
  if (draft.recurrence) args.push(`--recurrence ${quoteArg(draft.recurrence)}`);
  return args.join(" ");
}

function compactScope(scope: TaskCreateScope | undefined): TaskCreateScope {
  return {
    ...(scope?.source ? { source: scope.source } : {}),
    ...(scope?.projectId ? { projectId: scope.projectId } : {}),
    ...(scope?.sprintId ? { sprintId: scope.sprintId } : {}),
    ...(scope?.moduleId ? { moduleId: scope.moduleId } : {}),
    ...(scope?.cycleId ? { cycleId: scope.cycleId } : {}),
  };
}

function quoteArg(value: string): string {
  if (/^[A-Za-z0-9._:/-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
