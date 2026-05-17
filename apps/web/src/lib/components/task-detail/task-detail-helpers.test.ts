import { describe, expect, test } from "bun:test";
import {
  matchTaskShortcut,
  createAutosave,
  emptySelection,
  toggleSelection,
  clearSelection,
  toggleSort,
  sortTasks,
  applyFilters,
  serializeFilters,
  deserializeFilters,
  type TableSort,
  type SavedViewFilter,
} from "./task-detail-helpers.ts";

// ── Keyboard shortcuts ──────────────────────────────────────────────

describe("matchTaskShortcut", () => {
  test("returns action for valid shortcut key", () => {
    expect(matchTaskShortcut({ key: "e" })).toEqual({ key: "e", action: "edit-title" });
    expect(matchTaskShortcut({ key: "a" })).toEqual({ key: "a", action: "assign" });
    expect(matchTaskShortcut({ key: "s" })).toEqual({ key: "s", action: "status" });
    expect(matchTaskShortcut({ key: "p" })).toEqual({ key: "p", action: "priority" });
    expect(matchTaskShortcut({ key: "d" })).toEqual({ key: "d", action: "due" });
    expect(matchTaskShortcut({ key: "l" })).toEqual({ key: "l", action: "labels" });
  });

  test("returns null for non-shortcut key", () => {
    expect(matchTaskShortcut({ key: "x" })).toBeNull();
    expect(matchTaskShortcut({ key: "Enter" })).toBeNull();
  });

  test("returns null when modifier held", () => {
    expect(matchTaskShortcut({ key: "e", metaKey: true })).toBeNull();
    expect(matchTaskShortcut({ key: "e", ctrlKey: true })).toBeNull();
    expect(matchTaskShortcut({ key: "e", altKey: true })).toBeNull();
  });

  test("returns null when target is input", () => {
    expect(matchTaskShortcut({ key: "e", target: { tagName: "INPUT" } })).toBeNull();
    expect(matchTaskShortcut({ key: "e", target: { tagName: "TEXTAREA" } })).toBeNull();
    expect(matchTaskShortcut({ key: "e", target: { tagName: "SELECT" } })).toBeNull();
  });

  test("returns null when target is contenteditable", () => {
    expect(matchTaskShortcut({ key: "e", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
  });
});

// ── Autosave ────────────────────────────────────────────────────────

describe("createAutosave", () => {
  test("triggers save after delay", async () => {
    let saved = "";
    const auto = createAutosave(async (v) => { saved = v; }, 50);
    auto.trigger("hello");
    expect(auto.getStatus()).toBe("idle"); // not yet
    await new Promise((r) => setTimeout(r, 100));
    expect(saved).toBe("hello");
    expect(auto.getStatus()).toBe("saved");
  });

  test("cancel prevents save", async () => {
    let saved = "";
    const auto = createAutosave(async (v) => { saved = v; }, 50);
    auto.trigger("world");
    auto.cancel();
    await new Promise((r) => setTimeout(r, 100));
    expect(saved).toBe("");
  });

  test("debounces multiple triggers", async () => {
    const calls: string[] = [];
    const auto = createAutosave(async (v) => { calls.push(v); }, 50);
    auto.trigger("a");
    auto.trigger("b");
    auto.trigger("c");
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toEqual(["c"]); // only last
  });

  test("status is error on save failure", async () => {
    const auto = createAutosave(async () => { throw new Error("fail"); }, 10);
    auto.trigger("x");
    await new Promise((r) => setTimeout(r, 50));
    expect(auto.getStatus()).toBe("error");
  });
});

// ── Bulk selection ──────────────────────────────────────────────────

describe("bulk selection", () => {
  const ids = ["a", "b", "c", "d", "e"];

  test("toggle single item", () => {
    let sel = emptySelection();
    sel = toggleSelection(sel, "b", 1, ids, false);
    expect([...sel.ids]).toEqual(["b"]);
    expect(sel.lastIndex).toBe(1);
  });

  test("toggle removes selected item", () => {
    let sel = emptySelection();
    sel = toggleSelection(sel, "b", 1, ids, false);
    sel = toggleSelection(sel, "b", 1, ids, false);
    expect(sel.ids.size).toBe(0);
  });

  test("shift+click selects range", () => {
    let sel = emptySelection();
    sel = toggleSelection(sel, "a", 0, ids, false);
    sel = toggleSelection(sel, "d", 3, ids, true);
    expect([...sel.ids].sort()).toEqual(["a", "b", "c", "d"]);
  });

  test("shift+click backward", () => {
    let sel = emptySelection();
    sel = toggleSelection(sel, "d", 3, ids, false);
    sel = toggleSelection(sel, "a", 0, ids, true);
    expect([...sel.ids].sort()).toEqual(["a", "b", "c", "d"]);
  });

  test("clearSelection resets", () => {
    const sel = clearSelection();
    expect(sel.ids.size).toBe(0);
    expect(sel.lastIndex).toBeNull();
  });
});

// ── Table sort ──────────────────────────────────────────────────────

describe("toggleSort", () => {
  test("switches direction when same field", () => {
    const s: TableSort = { field: "title", dir: "asc" };
    expect(toggleSort(s, "title")).toEqual({ field: "title", dir: "desc" });
  });

  test("resets to asc when different field", () => {
    const s: TableSort = { field: "title", dir: "desc" };
    expect(toggleSort(s, "priority")).toEqual({ field: "priority", dir: "asc" });
  });
});

describe("sortTasks", () => {
  const tasks = [
    { title: "Banana", status: "pending", priority: 1, updated_at: "2025-01-02" },
    { title: "Apple", status: "completed", priority: 3, updated_at: "2025-01-01" },
    { title: "Cherry", status: "blocked", priority: 2, updated_at: "2025-01-03" },
  ];

  test("sorts by title asc", () => {
    const sorted = sortTasks(tasks, { field: "title", dir: "asc" });
    expect(sorted.map((t) => t.title)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  test("sorts by priority desc", () => {
    const sorted = sortTasks(tasks, { field: "priority", dir: "desc" });
    expect(sorted.map((t) => t.priority)).toEqual([3, 2, 1]);
  });

  test("sorts by updated_at asc", () => {
    const sorted = sortTasks(tasks, { field: "updated_at", dir: "asc" });
    expect(sorted.map((t) => t.updated_at)).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
  });
});

// ── Saved view filters ──────────────────────────────────────────────

describe("applyFilters", () => {
  const items = [
    { status: "open", assignee: "alice" },
    { status: "open", assignee: "bob" },
    { status: "closed", assignee: "alice" },
  ];

  test("eq filter", () => {
    const f: SavedViewFilter[] = [{ field: "status", op: "eq", value: "open" }];
    expect(applyFilters(items, f)).toHaveLength(2);
  });

  test("neq filter", () => {
    const f: SavedViewFilter[] = [{ field: "status", op: "neq", value: "closed" }];
    expect(applyFilters(items, f)).toHaveLength(2);
  });

  test("in filter", () => {
    const f: SavedViewFilter[] = [{ field: "assignee", op: "in", value: ["alice"] }];
    expect(applyFilters(items, f)).toHaveLength(2);
  });

  test("multiple filters AND together", () => {
    const f: SavedViewFilter[] = [
      { field: "status", op: "eq", value: "open" },
      { field: "assignee", op: "eq", value: "alice" },
    ];
    expect(applyFilters(items, f)).toHaveLength(1);
  });

  test("empty filters returns all", () => {
    expect(applyFilters(items, [])).toHaveLength(3);
  });
});

describe("serializeFilters / deserializeFilters", () => {
  test("roundtrip", () => {
    const filters: SavedViewFilter[] = [{ field: "status", op: "eq", value: "open" }];
    const raw = serializeFilters(filters);
    expect(deserializeFilters(raw)).toEqual(filters);
  });

  test("invalid JSON returns empty", () => {
    expect(deserializeFilters("not json")).toEqual([]);
  });

  test("non-array returns empty", () => {
    expect(deserializeFilters('"hello"')).toEqual([]);
  });
});
