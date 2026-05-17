import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { TASK_STATUSES, type TuiTask } from "./task-types.ts";

export interface TaskBoardScreenOptions {
  caller: {
    tasks: {
      list: () => Promise<TuiTask[]>;
      update: (input: { id: string; status: string }) => Promise<TuiTask>;
      create: (input: { title: string; status: string }) => Promise<TuiTask>;
    };
  };
  onOpenTask?: (id: string) => void;
}

type Overlay = "none" | "create";

export class TaskBoardScreen {
  private tasks: TuiTask[] = [];
  private cursor = 0;
  private overlay: Overlay = "none";

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

    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln(c.bold("  Create task"));
      renderer.writeln(c.dim("  Enter title to create."));
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
      this.overlay = "create";
      return true;
    }

    return false;
  }

  async submitCreate(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    const task = await this.opts.caller.tasks.create({ title: trimmed, status: "todo" });
    this.tasks = [...this.tasks, task];
    this.cursor = this.tasks.length - 1;
    this.overlay = "none";
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
}

