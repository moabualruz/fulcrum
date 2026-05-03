import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { TASK_STATUSES, type TuiTask } from "./task-types.ts";

export interface TuiSprint {
  id: string;
  name: string;
  status: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

type TuiSprintTask = TuiTask & {
  sprintId?: string | null;
  points?: number | null;
};

export class SprintsListScreen {
  private sprints: TuiSprint[] = [];
  private cursor = 0;
  private overlay: "none" | "create" = "none";

  constructor(
    private readonly opts: {
      caller: {
        sprints: {
          list: () => Promise<TuiSprint[]>;
          activate: (input: { id: string }) => Promise<{ ok: boolean }>;
          create: (input: { name: string; startDate: string; endDate: string }) => Promise<TuiSprint>;
        };
      };
    },
  ) {}

  async load(): Promise<void> {
    this.sprints = await this.opts.caller.sprints.list();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Sprints"));
    renderer.separator();
    renderer.writeln();

    for (const status of ["planned", "active", "completed"]) {
      renderer.writeln(c.bold(`  ${status.toUpperCase()}`));
      const rows = this.sprints.filter((sprint) => sprint.status === status);
      if (rows.length === 0) renderer.writeln(c.dim("    No sprints."));
      for (const sprint of rows) {
        const pointer = this.currentSprint?.id === sprint.id ? c.bold(">") : " ";
        renderer.writeln(`${pointer}   ${sprint.name}  [${sprint.status}]  ${dateText(sprint.startDate)} -> ${dateText(sprint.endDate)}`);
      }
      renderer.writeln();
    }

    renderer.writeln(c.dim("  j/k navigate  A activate  c create  q back"));
    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln(c.bold("  Create sprint"));
      renderer.writeln(c.dim("  Enter name, start date, and end date."));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.sprints.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (key === "A") {
      const sprint = this.currentSprint;
      if (!sprint) return false;
      await this.opts.caller.sprints.activate({ id: sprint.id });
      this.sprints = this.sprints.map((item) => ({ ...item, status: item.id === sprint.id ? "active" : item.status === "active" ? "planned" : item.status }));
      return true;
    }
    if (key === "c") {
      this.overlay = "create";
      return true;
    }
    return false;
  }

  async submitCreate(input: { name: string; startDate: string; endDate: string }): Promise<void> {
    const name = input.name.trim();
    if (!name) return;
    const sprint = await this.opts.caller.sprints.create({ ...input, name });
    this.sprints = [...this.sprints, sprint];
    this.cursor = this.sprints.length - 1;
    this.overlay = "none";
  }

  private get currentSprint(): TuiSprint | undefined {
    return this.sprints[this.cursor];
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.sprints.length - 1));
  }
}

export class SprintPlanningScreen {
  private tasks: TuiSprintTask[] = [];
  private movedTaskIds = new Set<string>();

  constructor(
    private readonly opts: {
      sprintId: string;
      capacityPoints: number;
      caller: {
        tasks: { list: () => Promise<TuiSprintTask[]> };
        sprints: {
          addTask: (input: { sprintId: string; taskId: string }) => Promise<{ ok: boolean }>;
          removeTask: (input: { sprintId: string; taskId: string }) => Promise<{ ok: boolean }>;
        };
      };
    },
  ) {}

  async load(): Promise<void> {
    this.tasks = await this.opts.caller.tasks.list();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  Sprint planning  Capacity ${this.sprintPoints}/${this.opts.capacityPoints} ${this.capacityBar}`));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(c.bold("  Backlog"));
    for (const task of this.backlogTasks) renderer.writeln(`    ${task.title}  (${task.points ?? 0} pts)`);
    if (this.backlogTasks.length === 0) renderer.writeln(c.dim("    Empty."));
    renderer.writeln();
    renderer.writeln(c.bold("  Sprint"));
    for (const task of this.sprintTasks) renderer.writeln(`    ${task.title}  (${task.points ?? 0} pts)`);
    if (this.sprintTasks.length === 0) renderer.writeln(c.dim("    Empty."));
    renderer.writeln();
    renderer.writeln(c.dim("  m move backlog -> sprint  x remove from sprint  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "m") {
      const task = this.backlogTasks[0];
      if (!task) return false;
      await this.opts.caller.sprints.addTask({ sprintId: this.opts.sprintId, taskId: task.id });
      this.movedTaskIds.add(task.id);
      this.tasks = this.tasks.map((item) => (item.id === task.id ? { ...item, sprintId: this.opts.sprintId } : item));
      return true;
    }
    if (key === "x") {
      const task = this.sprintTasks.find((item) => !this.movedTaskIds.has(item.id)) ?? this.sprintTasks[0];
      if (!task) return false;
      await this.opts.caller.sprints.removeTask({ sprintId: this.opts.sprintId, taskId: task.id });
      this.tasks = this.tasks.map((item) => (item.id === task.id ? { ...item, sprintId: null } : item));
      this.movedTaskIds.delete(task.id);
      return true;
    }
    return false;
  }

  private get backlogTasks(): TuiSprintTask[] {
    return this.tasks.filter((task) => !task.sprintId);
  }

  private get sprintTasks(): TuiSprintTask[] {
    return this.tasks.filter((task) => task.sprintId === this.opts.sprintId);
  }

  private get sprintPoints(): number {
    return this.sprintTasks.reduce((sum, task) => sum + (task.points ?? 0), 0);
  }

  private get capacityBar(): string {
    const width = 10;
    const used = Math.min(width, Math.round((this.sprintPoints / Math.max(1, this.opts.capacityPoints)) * width));
    return `[${"#".repeat(used)}${".".repeat(width - used)}]`;
  }
}

export class ActiveSprintBoardScreen {
  private tasks: TuiSprintTask[] = [];
  private overlay: "none" | "create" | "close" = "none";

  constructor(
    private readonly opts: {
      sprint: TuiSprint;
      today?: string | Date;
      caller: {
        tasks: {
          list: () => Promise<TuiSprintTask[]>;
          create: (input: { title: string; status: string; sprintId: string }) => Promise<TuiSprintTask>;
        };
        sprints: { close: (input: { sprintId: string; incompleteDisposition: "backlog" | "next-sprint" }) => Promise<{ ok: boolean }> };
        events: { emit: (input: { type: string; sprintId: string }) => Promise<void> };
      };
    },
  ) {}

  async load(): Promise<void> {
    this.tasks = await this.opts.caller.tasks.list();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  ${this.opts.sprint.name}  ${this.daysRemaining} days remaining`));
    renderer.separator();
    renderer.writeln();
    for (const status of TASK_STATUSES) {
      renderer.writeln(c.bold(`  ${status.toUpperCase()}`));
      const rows = this.sprintTasks.filter((task) => task.status === status);
      if (rows.length === 0) renderer.writeln(c.dim("    No tasks."));
      for (const task of rows) renderer.writeln(`    ${task.title}  [${task.status}]`);
      renderer.writeln();
    }
    renderer.writeln(c.dim("  c quick-add  C close sprint  q back"));
    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln(c.bold("  Quick-add task"));
    }
    if (this.overlay === "close") {
      renderer.writeln();
      renderer.writeln(c.bold(`  ${this.incompleteTasks.length} incomplete tasks - move to: [Backlog] [Next Sprint]`));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "c") {
      this.overlay = "create";
      return true;
    }
    if (key === "C") {
      this.overlay = "close";
      return true;
    }
    return false;
  }

  async submitQuickAdd(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    const task = await this.opts.caller.tasks.create({ title: trimmed, status: "todo", sprintId: this.opts.sprint.id });
    this.tasks = [...this.tasks, task];
    this.overlay = "none";
  }

  async submitClose(incompleteDisposition: "backlog" | "next-sprint"): Promise<void> {
    await this.opts.caller.sprints.close({ sprintId: this.opts.sprint.id, incompleteDisposition });
    await this.opts.caller.events.emit({ type: "retro.created", sprintId: this.opts.sprint.id });
    this.overlay = "none";
  }

  private get sprintTasks(): TuiSprintTask[] {
    return this.tasks.filter((task) => task.sprintId === this.opts.sprint.id);
  }

  private get incompleteTasks(): TuiSprintTask[] {
    return this.sprintTasks.filter((task) => task.status !== "done");
  }

  private get daysRemaining(): number {
    if (!this.opts.sprint.endDate) return 0;
    const today = startOfDay(this.opts.today ?? new Date());
    const end = startOfDay(this.opts.sprint.endDate);
    return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000));
  }
}

function dateText(value: string | Date | null | undefined): string {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function startOfDay(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
