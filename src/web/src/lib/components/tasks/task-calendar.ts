import type { BoardTask } from "$lib/product-queries";

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
}

export interface CalendarMonth {
  label: string;
  year: number;
  month: number;
  cells: CalendarCell[];
}

export interface CalendarMove {
  taskId: string;
  fromDate: string | null;
  toDate: string | null;
}

export interface SprintRange {
  start_date: string;
  end_date: string;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function normalizeDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? dateKey(value) : value.slice(0, 10);
}

export function buildCalendarMonth(monthAnchor: string | Date = new Date()): CalendarMonth {
  const anchor = monthAnchor instanceof Date ? monthAnchor : parseDateKey(monthAnchor);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay());

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return {
      date: dateKey(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month,
    };
  });

  return {
    label: first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    year,
    month: month + 1,
    cells,
  };
}

export function tasksForDate(tasks: readonly BoardTask[], date: string): BoardTask[] {
  return tasks.filter((task) => normalizeDate(task.due_date) === date);
}

export function unscheduledTasks(tasks: readonly BoardTask[]): BoardTask[] {
  return tasks.filter((task) => normalizeDate(task.due_date) === null);
}

export function applyCalendarReschedule(tasks: readonly BoardTask[], move: CalendarMove): BoardTask[] {
  return tasks.map((task) => (task.id === move.taskId ? { ...task, due_date: move.toDate } : task));
}

export function revertCalendarReschedule(tasks: readonly BoardTask[], move: CalendarMove): BoardTask[] {
  return tasks.map((task) => (task.id === move.taskId ? { ...task, due_date: move.fromDate } : task));
}

export function buildSprintBandCells(cells: readonly CalendarCell[], sprint: SprintRange | null): string[] {
  if (!sprint) return [];
  const start = normalizeDate(sprint.start_date);
  const end = normalizeDate(sprint.end_date);
  if (!start || !end) return [];
  return cells.filter((cell) => cell.date >= start && cell.date <= end).map((cell) => cell.date);
}

export function addMonths(anchor: string | Date, delta: number): string {
  const date = anchor instanceof Date ? anchor : parseDateKey(anchor);
  return dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1)));
}
