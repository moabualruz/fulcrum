import { TASK_STATUSES } from "./task-types.ts";

export interface TuiSprint {
  id: string;
  name: string;
  status: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

type TuiSprintTask = {
  id: string;
  title: string;
  status: string;
  sprintId?: string | null;
  points?: number | null;
};

export class SprintsListScreen {
  private sprints: TuiSprint[] = [];
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
  }

  render(renderer: { writeln: (line?: string) => void; separator: () => void }): void {
    renderer.writeln();
    renderer.writeln("  Sprints");
    renderer.separator();
    renderer.writeln();
    for (const status of ["planned", "active", "completed"]) {
      renderer.writeln(`  ${status.toUpperCase()}`);
      const rows = this.sprints.filter((sprint) => sprint.status === status);
      if (rows.length === 0) renderer.writeln("    No sprints.");
      for (const sprint of rows) renderer.writeln(`    ${sprint.name}  [${sprint.status}]`);
      renderer.writeln();
    }
    renderer.writeln("  c create  A activate selected  q back");
    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln("  Create sprint");
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "A") {
      const sprint = this.sprints.find((candidate) => candidate.status === "planned") ?? this.sprints[0];
      if (!sprint) return true;
      await this.opts.caller.sprints.activate({ id: sprint.id });
      this.sprints = this.sprints.map((candidate) => candidate.id === sprint.id ? { ...candidate, status: "active" } : candidate);
      return true;
    }
    if (key === "c") {
      this.overlay = "create";
      return true;
    }
    return false;
  }

  async submitCreate(input: { name: string; startDate: string; endDate: string }): Promise<void> {
    const sprint = await this.opts.caller.sprints.create(input);
    this.sprints = [...this.sprints, sprint];
    this.overlay = "none";
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

  render(renderer: { writeln: (line?: string) => void; separator: () => void }): void {
    renderer.writeln();
    renderer.writeln(`  Sprint Planning  Capacity ${this.usedPoints}/${this.opts.capacityPoints}`);
    renderer.separator();
    renderer.writeln();
    renderer.writeln("  BACKLOG");
    const backlog = this.backlogTasks;
    if (backlog.length === 0) renderer.writeln("    No backlog tasks.");
    for (const task of backlog) renderer.writeln(`    ${task.title}  [${task.points ?? 0}]`);
    renderer.writeln();
    renderer.writeln("  SPRINT");
    const sprint = this.sprintTasks;
    if (sprint.length === 0) renderer.writeln("    No sprint tasks.");
    for (const task of sprint) renderer.writeln(`    ${task.title}  [${task.points ?? 0}]`);
    renderer.writeln();
    renderer.writeln("  m move to sprint  x remove from sprint  q back");
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "m") {
      const task = this.backlogTasks[0];
      if (!task) return true;
      await this.opts.caller.sprints.addTask({ sprintId: this.opts.sprintId, taskId: task.id });
      this.movedTaskIds.add(task.id);
      this.tasks = this.tasks.map((candidate) => candidate.id === task.id ? { ...candidate, sprintId: this.opts.sprintId } : candidate);
      return true;
    }
    if (key === "x") {
      const task = this.sprintTasks.find((candidate) => candidate.status !== "done" && !this.movedTaskIds.has(candidate.id))
        ?? this.sprintTasks.find((candidate) => candidate.status !== "done")
        ?? this.sprintTasks[0];
      if (!task) return true;
      await this.opts.caller.sprints.removeTask({ sprintId: this.opts.sprintId, taskId: task.id });
      this.movedTaskIds.delete(task.id);
      this.tasks = this.tasks.map((candidate) => candidate.id === task.id ? { ...candidate, sprintId: null } : candidate);
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

  private get usedPoints(): number {
    return this.sprintTasks.reduce((sum, task) => sum + (task.points ?? 0), 0);
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

  render(renderer: { writeln: (line?: string) => void; separator: () => void }): void {
    renderer.writeln();
    renderer.writeln(`  ${this.opts.sprint.name}  ${this.daysRemaining} days remaining`);
    renderer.separator();
    renderer.writeln();
    for (const status of TASK_STATUSES) {
      renderer.writeln(`  ${status.toUpperCase()}`);
      const rows = this.sprintTasks.filter((task) => task.status === status);
      if (rows.length === 0) renderer.writeln("    No tasks.");
      for (const task of rows) renderer.writeln(`    ${task.title}  [${task.status}]`);
      renderer.writeln();
    }
    renderer.writeln("  c quick-add  C close sprint  q back");
    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln("  Quick-add task");
    }
    if (this.overlay === "close") {
      renderer.writeln();
      renderer.writeln(`  ${this.incompleteTasks.length} incomplete tasks - move to: [Backlog] [Next Sprint]`);
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

function startOfDay(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
