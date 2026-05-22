import type { SortDirection } from "@fulcrum/shared-dto";
import type { RunRow } from "./runs-filters.ts";

export type SortColumn = "agent" | "model" | "status" | "task_title" | "started_at" | "last_event_at" | "duration";
export type { SortDirection } from "@fulcrum/shared-dto";

function durationKey(row: RunRow, direction: SortDirection): number {
  if (row.ended_at === null) {
    // Spec: null end → +Infinity for asc (running rows last), -1 for desc
    // (running rows last when ranking biggest-first too).
    return direction === "asc" ? Number.POSITIVE_INFINITY : -1;
  }
  const start = Date.parse(row.started_at);
  const end = Date.parse(row.ended_at);
  return Math.max(0, end - start);
}

function stringKey(value: string | null, direction: SortDirection): {
  isNull: boolean;
  value: string;
} {
  // We'll handle null ordering at the comparator level so asc puts nulls last
  // and desc puts nulls first.
  return { isNull: value === null, value: value ?? "" };
}

function compareString(
  a: string | null,
  b: string | null,
  direction: SortDirection,
): number {
  const ka = stringKey(a, direction);
  const kb = stringKey(b, direction);
  if (ka.isNull && kb.isNull) return 0;
  if (ka.isNull) return direction === "asc" ? 1 : -1;
  if (kb.isNull) return direction === "asc" ? -1 : 1;
  if (ka.value < kb.value) return direction === "asc" ? -1 : 1;
  if (ka.value > kb.value) return direction === "asc" ? 1 : -1;
  return 0;
}

function compareNumber(
  a: number,
  b: number,
  direction: SortDirection,
): number {
  if (a === b) return 0;
  return direction === "asc" ? a - b : b - a;
}

/**
 * Stable sort over `RunRow[]` keyed on one of the supported columns.
 *
 * - `started_at` parsed as ISO timestamp → ms.
 * - `duration` = `ended_at - started_at` ms; running rows (`ended_at === null`)
 *   sort last regardless of direction (asc → +Infinity, desc → sentinel -1).
 * - `model` allows nulls: nulls last for asc, nulls first for desc.
 * - String columns compare lexicographically.
 */
export function sortRunRows(
  rows: readonly RunRow[],
  column: SortColumn,
  direction: SortDirection,
): RunRow[] {
  // Stable sort: pre-decorate with index so equal keys keep original order.
  const decorated = rows.map((row, index) => ({ row, index }));
  decorated.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case "agent":
        cmp = compareString(a.row.agent, b.row.agent, direction);
        break;
      case "status":
        cmp = compareString(a.row.status, b.row.status, direction);
        break;
      case "model":
        cmp = compareString(a.row.model, b.row.model, direction);
        break;
      case "task_title":
        cmp = compareString(a.row.task_title ?? a.row.task_id ?? null, b.row.task_title ?? b.row.task_id ?? null, direction);
        break;
      case "started_at": {
        const ka = Date.parse(a.row.started_at);
        const kb = Date.parse(b.row.started_at);
        cmp = compareNumber(ka, kb, direction);
        break;
      }
      case "last_event_at": {
        cmp = compareString(a.row.last_event_at ?? null, b.row.last_event_at ?? null, direction);
        break;
      }
      case "duration": {
        const ka = durationKey(a.row, direction);
        const kb = durationKey(b.row, direction);
        cmp = compareNumber(ka, kb, direction);
        break;
      }
    }
    if (cmp !== 0) return cmp;
    return a.index - b.index;
  });
  return decorated.map((d) => d.row);
}
