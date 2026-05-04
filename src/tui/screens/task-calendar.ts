import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { dateKey, type TuiTask } from "./task-types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface TaskCalendarScreenOptions {
  caller: { tasks: { list: () => Promise<TuiTask[]> } };
  weekStart?: string;
  onOpenTask?: (id: string) => void;
}

export class TaskCalendarScreen {
  private tasks: TuiTask[] = [];
  private weekStart: Date;
  private cursorDay = 0;

  constructor(private readonly opts: TaskCalendarScreenOptions) {
    this.weekStart = parseDate(opts.weekStart ?? new Date().toISOString().slice(0, 10));
  }

  async load(): Promise<void> {
    this.tasks = await this.opts.caller.tasks.list();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  Week of ${formatDate(this.weekStart)}`));
    renderer.separator();
    renderer.writeln();

    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(this.weekStart, offset);
      const key = formatDate(day);
      const dueTasks = this.tasks.filter((task) => dateKey(task.dueDate) === key);
      const pointer = offset === this.cursorDay ? c.bold(">") : " ";
      const titles = dueTasks.length ? dueTasks.map((task) => task.title).join(", ") : c.dim("No tasks");
      renderer.writeln(`${pointer} ${WEEKDAYS[day.getUTCDay()]} ${key.slice(5)}: ${titles}`);
    }

    renderer.writeln();
    renderer.writeln(c.dim("  ←/→ week  j/k day  Enter detail  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\x1b[C") {
      this.weekStart = addDays(this.weekStart, 7);
      return true;
    }

    if (key === "\x1b[D") {
      this.weekStart = addDays(this.weekStart, -7);
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursorDay = Math.min(6, this.cursorDay + 1);
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursorDay = Math.max(0, this.cursorDay - 1);
      return true;
    }

    if (key === "\r" || key === "\n") {
      const day = formatDate(addDays(this.weekStart, this.cursorDay));
      const task = this.tasks.find((item) => dateKey(item.dueDate) === day);
      if (!task) return false;
      this.opts.onOpenTask?.(task.id);
      return true;
    }

    return false;
  }
}

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

