import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { dateKey, type TuiTask } from "./task-types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TaskTimelineScreenOptions {
  caller: { tasks: { list: () => Promise<TuiTask[]> } };
  windowStart?: string;
  daysVisible?: number;
  onOpenTask?: (id: string) => void;
}

export class TaskTimelineScreen {
  private tasks: TuiTask[] = [];
  private readonly baseStart: Date;
  private cursor = 0;
  private scroll = 0;

  constructor(private readonly opts: TaskTimelineScreenOptions) {
    this.baseStart = parseDate(opts.windowStart ?? new Date().toISOString().slice(0, 10));
  }

  async load(): Promise<void> {
    this.tasks = await this.opts.caller.tasks.list();
  }

  render(renderer: Renderer): void {
    const start = addDays(this.baseStart, this.scroll);
    const days = this.opts.daysVisible ?? 14;
    renderer.writeln();
    renderer.writeln(c.bold(`  Timeline ${formatDate(start)}`));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(`  ${Array.from({ length: days }, (_, offset) => String(addDays(start, offset).getUTCDate()).padStart(2, "0")).join("")}`);

    for (const task of this.tasks) {
      const pointer = this.tasks[this.cursor]?.id === task.id ? c.bold(">") : " ";
      renderer.writeln(`${pointer} ${task.title.padEnd(20).slice(0, 20)} ${this.barFor(task, start, days)}`);
    }

    renderer.writeln();
    renderer.writeln(c.dim("  ←/→ scroll  j/k task  Enter detail  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\x1b[C") {
      this.scroll += 1;
      return true;
    }

    if (key === "\x1b[D") {
      this.scroll = Math.max(0, this.scroll - 1);
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.tasks.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    if (key === "\r" || key === "\n") {
      const task = this.tasks[this.cursor];
      if (!task) return false;
      this.opts.onOpenTask?.(task.id);
      return true;
    }

    return false;
  }

  get scrollDays(): number {
    return this.scroll;
  }

  private barFor(task: TuiTask, windowStart: Date, daysVisible: number): string {
    const startKey = dateKey(task.startDate) ?? dateKey(task.dueDate);
    const endKey = dateKey(task.endDate) ?? startKey;
    if (!startKey || !endKey) return ".".repeat(daysVisible);

    const taskStart = parseDate(startKey);
    const taskEnd = parseDate(endKey);
    const startOffset = Math.max(0, daysBetween(windowStart, taskStart));
    const endOffset = Math.min(daysVisible - 1, daysBetween(windowStart, taskEnd));

    return Array.from({ length: daysVisible }, (_, offset) => (offset >= startOffset && offset <= endOffset ? "#" : ".")).join("");
  }
}

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
