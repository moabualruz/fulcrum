import type { SortDirection } from "@fulcrum/shared-dto";

export type { SortDirection } from "@fulcrum/shared-dto";

export interface SortField {
  id: string;
  label: string;
  defaultDirection?: SortDirection;
}

export interface SortState {
  fieldId: string | null;
  direction: SortDirection;
}

export const SORT_HOTKEY = "s" as const;

export function isSortHotkey(key: string): boolean {
  return key === SORT_HOTKEY;
}

export function cycleSort(state: SortState, fieldId: string, fields: readonly SortField[]): SortState {
  const field = fields.find((entry) => entry.id === fieldId);
  if (!field) return state;
  if (state.fieldId !== fieldId) {
    return { fieldId, direction: field.defaultDirection ?? "asc" };
  }
  if (state.direction === "asc") return { fieldId, direction: "desc" };
  return clearSort();
}

export function clearSort(): SortState {
  return { fieldId: null, direction: "asc" };
}

export function applySort<T extends Record<string, unknown>>(rows: readonly T[], state: SortState, fields: readonly SortField[]): T[] {
  if (!state.fieldId) return [...rows];
  const field = fields.find((entry) => entry.id === state.fieldId);
  if (!field) return [...rows];
  const direction = state.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[state.fieldId!];
    const bv = b[state.fieldId!];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
    return String(av).localeCompare(String(bv)) * direction;
  });
}

export function headerStatus(state: SortState, fields: readonly SortField[]): string {
  if (!state.fieldId) return "Sort: none";
  const field = fields.find((entry) => entry.id === state.fieldId);
  if (!field) return "Sort: none";
  return `Sort: ${field.label} ${state.direction === "asc" ? "↑" : "↓"}`;
}

export interface SortMenuEntry {
  field: SortField;
  active: boolean;
  activeDirection: SortDirection | null;
}

export function buildSortMenu(state: SortState, fields: readonly SortField[]): SortMenuEntry[] {
  return fields.map((field) => ({
    field,
    active: state.fieldId === field.id,
    activeDirection: state.fieldId === field.id ? state.direction : null,
  }));
}
