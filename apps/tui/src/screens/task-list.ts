import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { TuiTask } from "./task-types.ts";
import {
  formatCreateScope,
  recurrencePreview,
  retryCommand,
  type TaskCreateDraft,
  type TaskCreateInput,
  type TaskCreateScope,
} from "./task-board.ts";
import type {
  DependencyRunMode,
  DependencyRunPreview,
} from "@execution-orchestration/domain/dependency-run-preview.ts";
import type {
  DependencyRunLiveFeedbackOutput,
  DispatchDependencyRunForTasksOutput,
} from "@execution-orchestration/interface/dependency-run-contracts.ts";
import type {
  RecordTaskQaReviewInput,
  TaskQaReviewOutput,
} from "@execution-orchestration/interface/dependency-run-contracts.ts";
import type {
  ManualTaskWorkbenchInput,
  ManualTaskWorkbenchOutput,
} from "@work-management/interface/manual-workbench.ts";
import type { SubscriptionBridge, TuiSubscription } from "../subscriptions.ts";

export interface TaskListFilters {
  status?: string;
  assignee?: string;
  label?: string;
}

export interface TaskListScreenOptions {
  caller: {
    tasks: {
      list: () => Promise<TuiTask[]>;
      create?: (input: TaskCreateInput) => Promise<TuiTask>;
      bulk?: (input: { ids: string[]; status?: string; assignee?: string }) => Promise<{ ok: boolean }>;
      previewDependencyRun?: (input: {
        mode: DependencyRunMode;
        targetTaskIds: string[];
      }) => Promise<DependencyRunPreview>;
      dispatchDependencyRun?: (input: {
        mode: DependencyRunMode;
        targetTaskIds: string[];
        agent: string;
      }) => Promise<DispatchDependencyRunForTasksOutput>;
      dependencyRunLiveFeedback?: (input: {
        traceId: string;
        runGroupId?: string;
      }) => Promise<DependencyRunLiveFeedbackOutput>;
      dependencyRunLiveFeedbackStream?: (
        input: {
          projectId?: string;
          traceId: string;
          runGroupId?: string;
        },
      ) => Promise<DependencyRunLiveFeedbackSubscription> | DependencyRunLiveFeedbackSubscription;
      recordQaReview?: (input: RecordTaskQaReviewInput) => Promise<TaskQaReviewOutput>;
      manualWorkbench?: (input: ManualTaskWorkbenchInput) => Promise<ManualTaskWorkbenchOutput>;
    };
  };
  subscriptions?: SubscriptionBridge;
  viewportRows?: number;
  qaReviewInput?: Omit<RecordTaskQaReviewInput, "taskId">;
  createScope?: TaskCreateScope;
}

type Overlay = "none" | "bulk" | "create";
const DEPENDENCY_RUN_FEEDBACK_EVENT = "tasks.dependencyRunLiveFeedbackStream";
type DependencyRunLiveFeedbackSubscription = {
  subscribe(observer: {
    next(value: DependencyRunLiveFeedbackOutput): void;
    error?(error: unknown): void;
    complete?(): void;
  }): TuiSubscription;
};

export class TaskListScreen {
  private tasks: TuiTask[] = [];
  private filters: TaskListFilters = {};
  private searchQuery = "";
  private searchActive = false;
  private selected = new Set<string>();
  private cursor = 0;
  private scrollTop = 0;
  private overlay: Overlay = "none";
  private runPreview: DependencyRunPreview | null = null;
  private runDispatch: DispatchDependencyRunForTasksOutput | null = null;
  private runFeedback: DependencyRunLiveFeedbackOutput | null = null;
  private qaReview: TaskQaReviewOutput | null = null;
  private workbench: ManualTaskWorkbenchOutput | null = null;
  private feedbackSubscription: TuiSubscription | null = null;
  private createDraft: TaskCreateDraft = { title: "" };
  private createError: string | null = null;

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
        renderer.writeln(`${pointer} ${checked} ${task.title}  [${task.status}]  ${task.id}  ${task.assignee ?? "unassigned"}${labels}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  / search  Esc clear  j/k navigate  Space select  c create  V manual view  R run preview  D dispatch run  F run feedback  Q qa review  B bulk  q back"));

    if (this.overlay === "bulk") {
      renderer.writeln();
      renderer.writeln(c.bold("  Bulk update"));
      renderer.writeln(c.dim(`  ${this.selected.size} selected`));
    }

    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln(c.bold("  Create task"));
      renderer.writeln(`  Scope: ${formatCreateScope(this.opts.createScope, "list")}`);
      renderer.writeln(`  Filters kept: ${this.filterChips.join(" ") || "none"}`);
      renderer.writeln(`  Title: ${this.createDraft.title || c.dim("(empty)")}`);
      renderer.writeln(`  Recurrence: ${this.createDraft.recurrence ? recurrencePreview(this.createDraft.recurrence).summary : c.dim("(none)")}`);
      if (this.createError) {
        renderer.writeln(c.red(`  ${this.createError}`));
        renderer.writeln(c.dim(`  Retry: ${retryCommand(this.createDraft, this.opts.createScope)}`));
      }
      renderer.writeln(c.dim("  Inline create keeps list context visible; submit keeps draft on error."));
    }

    if (this.runPreview) {
      renderer.writeln();
      renderer.writeln(c.bold("  Dependency run preview"));
      renderer.writeln(`  Mode: ${this.runPreview.mode}  Trace: ${this.runPreview.traceId ?? "none"}`);
      renderer.writeln(`  Ordered: ${this.runPreview.orderedTaskIds.join(" -> ") || "none"}`);
      for (const task of this.runPreview.tasks) {
        const selected = task.selected ? "selected" : "dependency";
        const blockers = task.blockers.length ? ` blockers: ${task.blockers.join("; ")}` : "";
        renderer.writeln(`  - ${task.title} [${task.column}] depth:${task.dependencyDepth} ${selected}${blockers}`);
      }
      for (const warning of this.runPreview.warnings) renderer.writeln(c.yellow(`  ! ${warning}`));
      if (this.runPreview.blocked) renderer.writeln(c.red("  Blocked until warnings are resolved."));
    }

    if (this.workbench) {
      renderer.writeln();
      renderer.writeln(c.bold("  manual task workbench"));
      renderer.writeln(`  Layout: ${this.workbench.layout}  Trace: ${this.workbench.traceId ?? "none"}  Filters: ${this.workbench.filtersApplied}`);
      for (const column of this.workbench.columns) {
        renderer.writeln(`  - ${column.label}  ${column.count}`);
      }
      for (const row of this.workbench.listRows.slice(0, 5)) {
        renderer.writeln(`  * ${row.title} [${row.stateLabel}] ${row.cycleId ?? "no-cycle"} ${row.moduleId ?? "no-module"}`);
      }
    }

    if (this.runDispatch) {
      renderer.writeln();
      renderer.writeln(c.bold("  Dependency run dispatched"));
      renderer.writeln(`  Group: ${this.runDispatch.runGroupId}`);
      for (const run of this.runDispatch.scheduledRuns) {
        renderer.writeln(`  - run ${run.id} task:${run.taskId} agent:${run.agent} status:${run.status}`);
      }
      for (const skipped of this.runDispatch.skippedTasks) {
        renderer.writeln(c.dim(`  - skipped ${skipped.title} [${skipped.column}]: ${skipped.reason}`));
      }
      for (const warning of this.runDispatch.warnings) renderer.writeln(c.yellow(`  ! ${warning}`));
    }

    if (this.runFeedback) {
      const status = this.runFeedback.executorStatus;
      renderer.writeln();
      renderer.writeln(c.bold("  Dependency run feedback"));
      renderer.writeln(`  Trace: ${this.runFeedback.traceId}`);
      renderer.writeln(`  Queued: ${status.queuedTaskCount}  Running: ${status.runningTaskCount}  Succeeded: ${status.succeededTaskCount}  Failed: ${status.failedTaskCount}`);
      for (const run of this.runFeedback.runs.slice(0, 5)) {
        renderer.writeln(`  - ${run.queuePosition}. ${run.id} task:${run.taskId ?? "none"} status:${run.status}`);
      }
      for (const event of this.runFeedback.events.slice(-5)) {
        renderer.writeln(`  * ${event.summary}${event.output ? `: ${event.output}` : ""}`);
      }
    }

    if (this.qaReview) {
      renderer.writeln();
      renderer.writeln(c.bold("  QA review recorded"));
      renderer.writeln(`  Verdict: ${this.qaReview.verdict}`);
      renderer.writeln(`  Next: ${this.qaReview.nextAction}`);
      for (const criterion of this.qaReview.successCriteria) {
        renderer.writeln(`  - ${criterion.text}`);
      }
      if (this.qaReview.feedbackRun) {
        const run = this.qaReview.feedbackRun;
        renderer.writeln(`  - feedback ${run.id} task:${run.taskId} agent:${run.agent} status:${run.status}`);
      }
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

    if (key === "c") {
      this.overlay = "create";
      return true;
    }

    if (key === "R" || key === "r") {
      const preview = this.opts.caller.tasks.previewDependencyRun;
      if (!preview) return false;
      const targetTaskIds = this.previewTargetIds();
      if (targetTaskIds.length === 0) return false;
      this.runPreview = await preview({
        mode: targetTaskIds.length > 1 ? "board" : "task",
        targetTaskIds,
      });
      return true;
    }

    if (key === "D" || key === "d") {
      const dispatch = this.opts.caller.tasks.dispatchDependencyRun;
      if (!dispatch) return false;
      const targetTaskIds = this.previewTargetIds();
      if (targetTaskIds.length === 0) return false;
      this.clearFeedbackSubscription();
      this.runFeedback = null;
      this.runDispatch = await dispatch({
        mode: targetTaskIds.length > 1 ? "board" : "task",
        targetTaskIds,
        agent: "codex",
      });
      this.runPreview = this.runDispatch.preview;
      return true;
    }

    if (key === "F" || key === "f") {
      const loadFeedback = this.opts.caller.tasks.dependencyRunLiveFeedback;
      if (!loadFeedback) return false;
      const traceId = this.runDispatch?.runGroupId ?? this.runPreview?.traceId;
      if (!traceId) return false;
      const feedbackInput = { traceId, runGroupId: traceId };
      this.runFeedback = await loadFeedback(feedbackInput);
      await this.subscribeToFeedback({ ...feedbackInput, projectId: this.runFeedback.projectId });
      return true;
    }

    if (key === "Q") {
      const recordQaReview = this.opts.caller.tasks.recordQaReview;
      const qaReviewInput = this.opts.qaReviewInput;
      if (!recordQaReview || !qaReviewInput) return false;
      const targetTaskId = this.previewTargetIds()[0];
      if (!targetTaskId) return false;
      this.qaReview = await recordQaReview({
        taskId: targetTaskId,
        ...qaReviewInput,
      });
      return true;
    }

    if (key === "V" || key === "v") {
      const manualWorkbench = this.opts.caller.tasks.manualWorkbench;
      if (!manualWorkbench) return false;
      this.workbench = await manualWorkbench({ viewMode: "board" });
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
    if (!this.opts.caller.tasks.bulk) return;
    await this.opts.caller.tasks.bulk({ ids, status });
    this.tasks = this.tasks.map((task) => (this.selected.has(task.id) ? { ...task, status } : task));
    this.selected.clear();
    this.overlay = "none";
  }

  updateCreateDraft(input: Partial<TaskCreateDraft>): void {
    this.overlay = "create";
    this.createDraft = { ...this.createDraft, ...input };
    this.createError = null;
  }

  async submitCreate(input: Partial<TaskCreateDraft> = {}): Promise<void> {
    const create = this.opts.caller.tasks.create;
    if (!create) return;
    this.updateCreateDraft(input);
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
      const task = await create({
        ...this.compactCreateScope(),
        title,
        status: "todo",
        ...(this.createDraft.recurrence ? { recurrence: this.createDraft.recurrence.trim() } : {}),
      });
      this.tasks = [...this.tasks, task];
      this.overlay = "none";
      this.createDraft = { title: "" };
      this.createError = null;
      this.cursor = this.filteredTasks.findIndex((row) => row.id === task.id);
      this.clampCursor();
    } catch (error) {
      this.createError = error instanceof Error ? error.message : String(error);
    }
  }

  get visibleTasks(): readonly TuiTask[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.filteredTasks.slice(this.scrollTop, this.scrollTop + rows);
  }

  get selectedTaskIds(): string[] {
    return [...this.selected];
  }

  dispose(): void {
    this.clearFeedbackSubscription();
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

  private previewTargetIds(): string[] {
    const selected = [...this.selected];
    if (selected.length > 0) return selected;
    const task = this.filteredTasks[this.cursor];
    return task ? [task.id] : [];
  }

  private hasDuplicateTitle(title: string): boolean {
    const normalized = title.trim().toLowerCase();
    return this.tasks.some((task) => task.title.trim().toLowerCase() === normalized);
  }

  private compactCreateScope(): TaskCreateScope {
    const scope = this.opts.createScope;
    return {
      ...(scope?.source ? { source: scope.source } : {}),
      ...(scope?.projectId ? { projectId: scope.projectId } : {}),
      ...(scope?.sprintId ? { sprintId: scope.sprintId } : {}),
      ...(scope?.moduleId ? { moduleId: scope.moduleId } : {}),
      ...(scope?.cycleId ? { cycleId: scope.cycleId } : {}),
    };
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

  private async subscribeToFeedback(input: { projectId?: string; traceId: string; runGroupId?: string }): Promise<void> {
    if (!this.runFeedback) return;
    this.clearFeedbackSubscription();
    const stream = this.opts.caller.tasks.dependencyRunLiveFeedbackStream;
    if (stream) {
      const feedbackStream = await stream(input);
      let inactiveDuringSubscribe = false;
      const subscription = feedbackStream.subscribe({
        next: (payload) => {
          this.applyFeedbackUpdate(payload);
          if (!payload.executorStatus.active) inactiveDuringSubscribe = true;
        },
        error: () => this.clearFeedbackSubscription(),
        complete: () => this.clearFeedbackSubscription(),
      });
      this.feedbackSubscription = subscription;
      if (inactiveDuringSubscribe) this.clearFeedbackSubscription();
      return;
    }
    if (!this.opts.subscriptions) return;
    this.feedbackSubscription = this.opts.subscriptions.subscribe<DependencyRunLiveFeedbackOutput>(
      DEPENDENCY_RUN_FEEDBACK_EVENT,
      (payload) => this.applyFeedbackUpdate(payload),
    );
  }

  private clearFeedbackSubscription(): void {
    this.feedbackSubscription?.unsubscribe();
    this.feedbackSubscription = null;
  }

  private applyFeedbackUpdate(payload: DependencyRunLiveFeedbackOutput): void {
    if (payload.traceId !== this.runFeedback?.traceId) return;
    this.runFeedback = payload;
    if (!payload.executorStatus.active) this.clearFeedbackSubscription();
  }
}
