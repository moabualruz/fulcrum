/**
 * Build · Board stage workbench: the TUI `:board` workbench (DESIGN.md §3.1,
 * CLI-TUI-UX.md §6, IA-MAP.md §9; OD `tui-runs.html` `build-board` screen).
 *
 * The Build stage's task-board layout, re-homed under the shared
 * `StageWorkbench` shell so it carries the same `fulcrum · :board · …` header,
 * StatusFooter strip, and empty/error contract as every other stage workbench.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { truncateWide } from "../utils/truncate.ts";
import { ModePicker, type WorkflowMode } from "../widgets/ModePicker.ts";
import { TASK_STATUSES, type TuiTask } from "./task-types.ts";
import {
  renderStageWorkbenchFooter,
  renderStageWorkbenchHeader,
  renderWorkbenchEmptyState,
  renderWorkbenchErrorFrame,
  type StageWorkbenchScope,
} from "./runs-screen.ts";

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
  /** Project / branch label rendered in the workbench scope chrome. */
  projectLabel?: string;
  /** Stage-specific scope detail rendered in the workbench header (OD `cycle 24w13`). */
  cycleLabel?: string;
  /** Active trace id rendered in the workbench footer. */
  traceId?: string | null;
  /** Healthy/total MCP servers rendered in the workbench footer. */
  mcp?: string | null;
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
  private loadError: string | null = null;
  /** The focused task-card Step mode picker (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist). */
  private readonly modePicker = new ModePicker({
    stepId: "task",
    onSelect: (mode) => {
      this.stepMode = mode;
    },
  });
  /** Last Step mode selected via the ModePicker row. */
  private stepMode: WorkflowMode = "manual";

  constructor(private readonly opts: TaskBoardScreenOptions) {}

  /** The Step mode currently selected on the focused task card (✋/▶/💬/⊞). */
  get currentStepMode(): WorkflowMode {
    return this.stepMode;
  }

  /** The OD stage-scope chrome for the Build · Board workbench. */
  private get scope(): StageWorkbenchScope {
    return {
      stage: "Build",
      route: ":board",
      purpose: "task board",
      project: this.opts.projectLabel ?? this.opts.createScope?.projectId ?? null,
      detail: this.opts.cycleLabel ?? `${this.tasks.length} tasks`,
      agent: null,
      mcp: this.opts.mcp ?? null,
      traceId: this.opts.traceId ?? null,
    };
  }

  async load(): Promise<void> {
    try {
      this.tasks = await this.opts.caller.tasks.list();
      this.loadError = null;
      this.clampCursor();
    } catch (err) {
      this.tasks = [];
      this.loadError = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderStageWorkbenchHeader(renderer, this.scope);

    if (this.loadError) {
      renderWorkbenchErrorFrame(renderer, {
        what: "Task board failed to load.",
        next: this.loadError,
        traceId: this.opts.traceId,
      });
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    if (this.tasks.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        "No tasks on this board yet.",
        "Press c to create a task.",
      );
      renderer.writeln();
      renderer.writeln(c.dim("  c create  q back"));
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

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

    // ModePicker row for the focused task-card Step (acceptance: Step-bearing rows).
    renderer.writeln(
      truncateWide(
        `  ${c.dim("step modes")}  ${this.modePicker.render()}`,
        Math.max(20, renderer.width),
      ),
    );
    for (const line of this.modePicker.renderPopover()) {
      renderer.writeln(truncateWide(line, Math.max(20, renderer.width)));
    }
    renderer.writeln(c.dim("  h/l move  Enter detail  c create  p play  d discuss  m picker  q back"));

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

    renderStageWorkbenchFooter(renderer, this.scope);
  }

  async handleKey(key: string): Promise<boolean> {
    // Step mode picker direct keys. Checked before list nav so picker keys are not stolen.
    if (this.modePicker.handleChordKey(key)) return true;

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
