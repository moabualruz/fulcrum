import type { BoardTask } from "$lib/product-queries";

export const TIMELINE_ZOOMS = ["day", "week", "month", "quarter"] as const;
export type TimelineZoom = (typeof TIMELINE_ZOOMS)[number];

export type TimelineTask = BoardTask & {
  created_at?: string | null;
  start_date?: string | null;
  blocks?: string[];
  blocked_by?: string[];
};

export interface TimelineRow {
  id: string;
  title: string;
  start: string;
  end: string;
  offsetDays: number;
  durationDays: number;
  top: number;
  left: number;
  width: number;
}

export interface TimelineDependency {
  from: string;
  to: string;
  path: string;
}

export interface TimelineModel {
  rows: TimelineRow[];
  dependencies: TimelineDependency[];
  rangeStart: string;
  rangeEnd: string;
  totalDays: number;
  zoom: TimelineZoom;
}

const STORAGE_KEY = "fulcrum:task-timeline-zoom";
const DAY_MS = 86_400_000;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 220;
const DAY_WIDTH: Record<TimelineZoom, number> = {
  day: 28,
  week: 12,
  month: 4,
  quarter: 2,
};

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / DAY_MS);
}

function taskStart(task: TimelineTask): string {
  return (task.start_date ?? task.created_at ?? task.updated_at).slice(0, 10);
}

function taskEnd(task: TimelineTask, start: string): string {
  return (task.due_date ?? start).slice(0, 10);
}

function normalizeZoom(zoom: string | null): TimelineZoom {
  return TIMELINE_ZOOMS.includes(zoom as TimelineZoom) ? (zoom as TimelineZoom) : "month";
}

export function rememberTimelineZoom(zoom: TimelineZoom, storage: Pick<Storage, "setItem"> | null = null): void {
  storage?.setItem(STORAGE_KEY, zoom);
}

export function loadTimelineZoom(storage: Pick<Storage, "getItem"> | null = null): TimelineZoom {
  return normalizeZoom(storage?.getItem(STORAGE_KEY) ?? null);
}

export function applyTimelineMove(task: TimelineTask, deltaDays: number): { start_date: string; due_date: string } {
  const start = taskStart(task);
  const end = taskEnd(task, start);
  return {
    start_date: isoDate(addDays(parseDate(start), deltaDays)),
    due_date: isoDate(addDays(parseDate(end), deltaDays)),
  };
}

export function resizeTimelineEnd(task: TimelineTask, deltaDays: number): { due_date: string } {
  const start = taskStart(task);
  const end = taskEnd(task, start);
  const next = isoDate(addDays(parseDate(end), deltaDays));
  return { due_date: diffDays(next, start) < 0 ? start : next };
}

export function buildTimelineModel(
  tasks: readonly TimelineTask[],
  options: { anchor?: string | Date; zoom?: TimelineZoom } = {},
): TimelineModel {
  const zoom = options.zoom ?? "month";
  const starts = tasks.map(taskStart);
  const anchor = options.anchor
    ? isoDate(options.anchor instanceof Date ? options.anchor : parseDate(options.anchor))
    : starts.sort()[0] ?? isoDate(new Date());
  const rangeStart = anchor;
  const rangeEnd = isoDate(addDays(parseDate(rangeStart), 183));
  const pxPerDay = DAY_WIDTH[zoom];
  const rows = tasks.map((task, index) => {
    const start = taskStart(task);
    const end = taskEnd(task, start);
    const offsetDays = Math.max(0, diffDays(start, rangeStart));
    const durationDays = Math.max(1, diffDays(end, start) + 1);
    return {
      id: task.id,
      title: task.title,
      start,
      end,
      offsetDays,
      durationDays,
      top: index * ROW_HEIGHT + 18,
      left: LABEL_WIDTH + offsetDays * pxPerDay,
      width: Math.max(pxPerDay, durationDays * pxPerDay),
    };
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const dependencies: TimelineDependency[] = [];
  for (const task of tasks) {
    const from = byId.get(task.id);
    if (!from) continue;
    for (const blockedId of task.blocks ?? []) {
      const to = byId.get(blockedId);
      if (!to) continue;
      const startX = from.left + from.width;
      const startY = from.top + 10;
      const endX = to.left;
      const endY = to.top + 10;
      const midX = startX + Math.max(12, (endX - startX) / 2);
      dependencies.push({
        from: task.id,
        to: blockedId,
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
      });
    }
  }
  return { rows, dependencies, rangeStart, rangeEnd, totalDays: 184, zoom };
}
