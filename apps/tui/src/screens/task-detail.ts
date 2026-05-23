import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { QuitConfirmation } from "../quit-confirmation.ts";

interface TaskLink {
  id: string;
  title?: string;
  status?: string | null;
}

interface TaskMode {
  id: string;
  title: string;
  count?: number;
}

interface TaskComment {
  id: string;
  author?: string | null;
  body: string;
}

interface CustomFieldDef {
  slug: string;
  name: string;
  position?: number | null;
}

interface DetailTask {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  assignee?: string | null;
  dueDate?: string | Date | null;
  priority?: string | null;
  labels?: string[] | null;
  project?: string | null;
  customFields?: Record<string, unknown> | null;
  comments?: TaskComment[] | null;
  activity?: string[] | null;
  watchers?: string[] | null;
  subtasks?: TaskLink[] | null;
  blockedBy?: TaskLink[] | null;
  breadcrumb?: TaskLink[] | null;
  taskType?: string | null;
  links?: Record<string, TaskLink[] | null | undefined> | null;
  modes?: TaskMode[] | null;
  trace?: {
    projectId?: string | null;
    entity?: { kind: string; id: string } | null;
    audit?: TaskLink[] | null;
  } | null;
}

type Overlay = "none" | "title" | "status" | "assignee" | "child" | "dependency";

export interface TaskDetailScreenOptions {
  taskId?: string;
  mode?: "detail" | "create";
  caller: {
    tasks: {
      get?: (input: { id: string }) => Promise<DetailTask>;
      update?: (input: Record<string, unknown> & { id: string }) => Promise<Partial<DetailTask>>;
      create?: (input: Record<string, unknown>) => Promise<DetailTask>;
    };
    custom_fields?: {
      list: () => Promise<CustomFieldDef[]>;
    };
    comments?: {
      create: (input: { task_id: string; body: string }) => Promise<TaskComment>;
    };
  };
  onNavigateTask?: (id: string) => void;
}

export class TaskDetailScreen {
  private task: DetailTask | null = null;
  private customFieldDefs: CustomFieldDef[] = [];
  private overlay: Overlay = "none";
  private readonly quitConfirmation = new QuitConfirmation();
  validationError: string | null = null;
  cancelled = false;

  constructor(private readonly opts: TaskDetailScreenOptions) {}

  async load(): Promise<void> {
    if (this.opts.mode === "create") return;
    if (!this.opts.taskId || !this.opts.caller.tasks.get) return;
    this.task = await this.opts.caller.tasks.get({ id: this.opts.taskId });
    this.customFieldDefs = this.opts.caller.custom_fields ? await this.opts.caller.custom_fields.list() : [];
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    if (this.opts.mode === "create") {
      renderer.writeln(c.bold("  Create task"));
      renderer.separator();
      renderer.writeln();
      renderer.writeln("  Title: ");
      renderer.writeln("  Project: ");
      if (this.validationError) renderer.writeln(c.dim(`  ${this.validationError}`));
      renderer.writeln();
      renderer.writeln(c.dim("  Enter submit  Esc cancel"));
      return;
    }

    if (!this.task) {
      renderer.writeln(c.dim("  Task not loaded."));
      return;
    }

    renderer.writeln(c.bold(`  ${this.task.title}`));
    renderer.separator();
    this.writeLine(renderer, "Breadcrumb", this.breadcrumbText);
    this.writeLine(renderer, "Description", renderMarkdown(this.task.description ?? ""));
    this.writeLine(renderer, "Status", this.task.status ?? "unset");
    this.writeLine(renderer, "Assignee", this.task.assignee ?? "unassigned");
    this.writeLine(renderer, "Due date", formatDate(this.task.dueDate));
    this.writeLine(renderer, "Priority", this.task.priority ?? "unset");
    this.writeLine(renderer, "Labels", this.task.labels?.length ? this.task.labels.join(", ") : "none");

    renderer.writeln();
    renderer.writeln(c.bold("  Custom fields"));
    for (const line of this.customFieldLines) renderer.writeln(`  ${line}`);
    if (this.customFieldLines.length === 0) renderer.writeln(c.dim("  none"));

    renderer.writeln();
    renderer.writeln(c.bold(`  Comments (${this.task.comments?.length ?? 0})`));
    for (const comment of this.task.comments ?? []) {
      const author = comment.author ? `${comment.author}: ` : "";
      renderer.writeln(`  ${author}${renderMarkdown(comment.body)}`);
    }

    this.writeList(renderer, "Activity", this.task.activity ?? []);
    this.writeList(renderer, "Watchers", this.task.watchers ?? []);
    this.writeTaskLinks(renderer, "Subtasks", this.task.subtasks ?? []);
    this.writeTaskLinks(renderer, "Blocking", this.task.blockedBy ?? []);
    this.writeModes(renderer, this.task.modes ?? []);
    this.writeRelationshipLinks(renderer, this.task.links ?? {});
    this.writeTrace(renderer);
    renderer.writeln();
    renderer.writeln(c.dim("  e title  a assign  s status  p priority  d due  l labels  c child  q back"));
    this.renderQuitConfirmation(renderer);

    if (this.overlay !== "none") {
      renderer.writeln();
      const titles: Record<Overlay, string> = {
        none: "",
        title: "Edit title",
        status: "Status picker",
        assignee: "User picker",
        child: "Create child task",
        dependency: "Dependency search",
      };
      renderer.writeln(c.bold(`  ${titles[this.overlay]}`));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    const quitAnswer = this.quitConfirmation.answer(key);
    if (quitAnswer === "stay" || quitAnswer === "confirm") return true;
    if (quitAnswer === "quit") {
      this.overlay = "none";
      if (this.opts.mode === "create") this.cancelled = true;
      return true;
    }

    if (key === "q") {
      return this.requestQuit();
    }

    if (key === "\x1b") {
      if (this.opts.mode === "create") this.cancelled = true;
      this.overlay = "none";
      this.quitConfirmation.clear();
      return true;
    }
    if (key === "e") return this.open("title");
    if (key === "s") return this.open("status");
    if (key === "a") return this.open("assignee");
    if (key === "c") return this.open("child");
    if (key === "p" || key === "d" || key === "l") return true;
    return false;
  }

  async submitTitle(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || !this.task || !this.opts.caller.tasks.update) return;
    await this.opts.caller.tasks.update({ id: this.task.id, title: trimmed });
    this.task = { ...this.task, title: trimmed };
    this.overlay = "none";
  }

  async submitStatus(status: string): Promise<void> {
    if (!this.task || !this.opts.caller.tasks.update) return;
    await this.opts.caller.tasks.update({ id: this.task.id, status });
    this.task = { ...this.task, status };
    this.overlay = "none";
  }

  async submitAssignee(assignee: string): Promise<void> {
    if (!this.task || !this.opts.caller.tasks.update) return;
    await this.opts.caller.tasks.update({ id: this.task.id, assignee });
    this.task = { ...this.task, assignee };
    this.overlay = "none";
  }

  async submitChild(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || !this.task || !this.opts.caller.tasks.create) return;
    const child = await this.opts.caller.tasks.create({
      title: trimmed,
      parent_id: this.task.id,
      project: this.task.project,
    });
    this.task = { ...this.task, subtasks: [...(this.task.subtasks ?? []), child] };
    this.overlay = "none";
  }

  openDependencySearch(): void {
    this.overlay = "dependency";
  }

  requestQuit(): boolean {
    const decision = this.quitConfirmation.request(
      this.hasUnsavedDraft,
      "Discard task detail draft changes.",
    );
    if (decision === "quit") return false;
    return true;
  }

  get hasUnsavedDraft(): boolean {
    return this.overlay !== "none" || this.opts.mode === "create";
  }

  get quitConfirmationMessage(): string | null {
    return this.quitConfirmation.message;
  }

  async submitBlockedBy(id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed || !this.task || !this.opts.caller.tasks.update) return;
    const existing = (this.task.blockedBy ?? []).map((task) => task.id);
    const blocked_by = [...new Set([...existing, trimmed])];
    await this.opts.caller.tasks.update({ id: this.task.id, blocked_by });
    this.task = {
      ...this.task,
      blockedBy: blocked_by.map((taskId) => this.task?.blockedBy?.find((task) => task.id === taskId) ?? { id: taskId, title: taskId }),
    };
    this.overlay = "none";
  }

  async submitComment(body: string): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed || !this.task || !this.opts.caller.comments) return;
    const comment = await this.opts.caller.comments.create({ task_id: this.task.id, body: trimmed });
    this.task = { ...this.task, comments: [...(this.task.comments ?? []), comment] };
  }

  async submitCreate(input: { title: string; project: string }): Promise<void> {
    const title = input.title.trim();
    if (!title) {
      this.validationError = "Title required";
      return;
    }
    const created = await this.opts.caller.tasks.create?.({ title, project: input.project });
    if (!created) return;
    this.validationError = null;
    this.opts.onNavigateTask?.(created.id);
  }

  private open(overlay: Overlay): true {
    this.overlay = overlay;
    this.quitConfirmation.clear();
    return true;
  }

  private renderQuitConfirmation(renderer: Renderer): void {
    if (!this.quitConfirmation.message) return;
    renderer.writeln();
    renderer.writeln(c.yellow(`  ${this.quitConfirmation.message}`));
    renderer.writeln(c.dim(`  ${this.quitConfirmation.hint ?? ""}`));
  }

  private writeLine(renderer: Renderer, label: string, value: string): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  ${label}`));
    renderer.writeln(`  ${value || "none"}`);
  }

  private writeList(renderer: Renderer, label: string, values: string[]): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  ${label}`));
    if (values.length === 0) renderer.writeln(c.dim("  none"));
    for (const value of values) renderer.writeln(`  - ${value}`);
  }

  private writeTaskLinks(renderer: Renderer, label: string, values: TaskLink[]): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  ${label}`));
    if (values.length === 0) renderer.writeln(c.dim("  none"));
    for (const value of values) renderer.writeln(`  - ${value.id}: ${value.title ?? value.id}${value.status ? ` [${value.status}]` : ""}`);
  }

  private writeModes(renderer: Renderer, modes: TaskMode[]): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Modes"));
    if (modes.length === 0) renderer.writeln(c.dim("  none"));
    for (const mode of modes) {
      const count = mode.count === undefined ? "" : ` (${mode.count})`;
      renderer.writeln(`  - ${mode.title}${count}`);
    }
  }

  private writeRelationshipLinks(renderer: Renderer, links: Record<string, TaskLink[] | null | undefined>): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Relationships"));
    const entries = Object.entries(links).filter(([, values]) => Array.isArray(values) && values.length > 0);
    if (entries.length === 0) renderer.writeln(c.dim("  none"));
    for (const [kind, values] of entries) {
      renderer.writeln(`  ${kind}`);
      for (const value of values ?? []) renderer.writeln(`  - ${value.id}: ${value.title ?? value.id}`);
    }
  }

  private writeTrace(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Trace"));
    if (!this.task?.trace) {
      renderer.writeln(c.dim("  none"));
      return;
    }
    if (this.task.trace.projectId) renderer.writeln(`  Project: ${this.task.trace.projectId}`);
    const entity = this.task.trace.entity;
    if (entity) renderer.writeln(`  Entity: ${entity.kind}:${entity.id}`);
    for (const event of this.task.trace.audit ?? []) {
      renderer.writeln(`  - ${event.id}: ${event.title ?? event.id}`);
    }
  }

  private get breadcrumbText(): string {
    return this.task?.breadcrumb?.map((task) => task.title).join(" > ") || this.task?.title || "";
  }

  private get customFieldLines(): string[] {
    const values = this.task?.customFields ?? {};
    const defs = [...this.customFieldDefs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const known = defs.filter((def) => Object.hasOwn(values, def.slug)).map((def) => `${def.name}: ${formatValue(values[def.slug])}`);
    const knownSlugs = new Set(defs.map((def) => def.slug));
    const unknown = Object.entries(values)
      .filter(([slug]) => !knownSlugs.has(slug))
      .map(([slug, value]) => `${slug}: ${formatValue(value)}`);
    return [...known, ...unknown];
  }
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "unset";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
