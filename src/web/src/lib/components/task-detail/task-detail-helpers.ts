/**
 * Task detail page helpers: keyboard shortcuts, autosave debounce,
 * bulk selection, table sort, saved view filters.
 */

// ── Keyboard shortcuts ─────────────────────────────────────────────

export type TaskShortcut = "e" | "a" | "s" | "p" | "d" | "l";

const SHORTCUT_KEYS = new Set<string>(["e", "a", "s", "p", "d", "l"]);

export interface ShortcutAction {
  key: TaskShortcut;
  action: string; // "edit-title" | "assign" | "status" | "priority" | "due" | "labels"
}

const SHORTCUT_MAP: Record<TaskShortcut, string> = {
  e: "edit-title",
  a: "assign",
  s: "status",
  p: "priority",
  d: "due",
  l: "labels",
};

/**
 * Determine if a keyboard event should trigger a task shortcut.
 * Returns null when the event targets an input/textarea/contenteditable
 * or a modifier is held, to avoid conflict with system shortcuts.
 */
export function matchTaskShortcut(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}): ShortcutAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const tag = event.target?.tagName?.toLowerCase() ?? "";
  if (tag === "input" || tag === "textarea" || tag === "select") return null;
  if (event.target?.isContentEditable) return null;
  if (!SHORTCUT_KEYS.has(event.key)) return null;
  const key = event.key as TaskShortcut;
  return { key, action: SHORTCUT_MAP[key] };
}

// ── Autosave debounce ───────────────────────────────────────────────

export interface AutosaveState {
  timer: ReturnType<typeof setTimeout> | null;
  status: "idle" | "saving" | "saved" | "error";
}

export function createAutosave(
  saveFn: (value: string) => Promise<void>,
  delayMs = 1000,
): {
  trigger: (value: string) => void;
  cancel: () => void;
  getStatus: () => AutosaveState["status"];
} {
  const state: AutosaveState = { timer: null, status: "idle" };

  function trigger(value: string): void {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      state.status = "saving";
      try {
        await saveFn(value);
        state.status = "saved";
      } catch {
        state.status = "error";
      }
    }, delayMs);
  }

  function cancel(): void {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  return { trigger, cancel, getStatus: () => state.status };
}

// ── Bulk selection ──────────────────────────────────────────────────

export interface BulkSelection {
  ids: Set<string>;
  lastIndex: number | null;
}

export function emptySelection(): BulkSelection {
  return { ids: new Set(), lastIndex: null };
}

/**
 * Handle click on a task row for bulk selection.
 * - Plain click: toggle single item, set lastIndex.
 * - Shift+click: select range from lastIndex to current index.
 */
export function toggleSelection(
  sel: BulkSelection,
  taskId: string,
  currentIndex: number,
  orderedIds: string[],
  shiftKey: boolean,
): BulkSelection {
  const next: BulkSelection = { ids: new Set(sel.ids), lastIndex: sel.lastIndex };

  if (shiftKey && sel.lastIndex !== null) {
    const start = Math.min(sel.lastIndex, currentIndex);
    const end = Math.max(sel.lastIndex, currentIndex);
    for (let i = start; i <= end; i++) {
      const id = orderedIds[i];
      if (id) next.ids.add(id);
    }
    next.lastIndex = currentIndex;
  } else {
    if (next.ids.has(taskId)) {
      next.ids.delete(taskId);
    } else {
      next.ids.add(taskId);
    }
    next.lastIndex = currentIndex;
  }
  return next;
}

export function clearSelection(): BulkSelection {
  return emptySelection();
}

// ── Table sort ──────────────────────────────────────────────────────

export type SortField = "title" | "status" | "priority" | "updated_at";
export type SortDir = "asc" | "desc";

export interface TableSort {
  field: SortField;
  dir: SortDir;
}

export function toggleSort(current: TableSort, field: SortField): TableSort {
  if (current.field === field) {
    return { field, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { field, dir: "asc" };
}

export function sortTasks<T extends { title: string; status: string; priority: number; updated_at: string }>(
  tasks: T[],
  sort: TableSort,
): T[] {
  const sorted = [...tasks];
  const dir = sort.dir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    const av = a[sort.field];
    const bv = b[sort.field];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return sorted;
}

// ── Saved view filters ──────────────────────────────────────────────

export interface SavedViewFilter {
  field: string;
  op: "eq" | "neq" | "in";
  value: string | string[];
}

export interface SavedView {
  id: string;
  name: string;
  filters: SavedViewFilter[];
}

export function applyFilters<T extends Record<string, unknown>>(
  items: T[],
  filters: SavedViewFilter[],
): T[] {
  return items.filter((item) =>
    filters.every((f) => {
      const val = String(item[f.field] ?? "");
      switch (f.op) {
        case "eq":
          return val === f.value;
        case "neq":
          return val !== f.value;
        case "in":
          return Array.isArray(f.value) && f.value.includes(val);
        default:
          return true;
      }
    }),
  );
}

export function serializeFilters(filters: SavedViewFilter[]): string {
  return JSON.stringify(filters);
}

export function deserializeFilters(raw: string): SavedViewFilter[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedViewFilter[];
  } catch {
    return [];
  }
}
