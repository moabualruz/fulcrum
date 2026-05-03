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
