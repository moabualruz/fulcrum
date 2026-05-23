import { describe, expect, test } from "bun:test";

import {
  SORT_HOTKEY,
  applySort,
  buildSortMenu,
  clearSort,
  cycleSort,
  headerStatus,
  isSortHotkey,
} from "./list-sort.ts";

const FIELDS = [
  { id: "title", label: "Title" },
  { id: "priority", label: "Priority", defaultDirection: "desc" as const },
  { id: "updated", label: "Updated" },
];

describe("list-sort", () => {
  test("'s' is the sort hotkey", () => {
    expect(SORT_HOTKEY).toBe("s");
    expect(isSortHotkey("s")).toBe(true);
    expect(isSortHotkey("S")).toBe(false);
  });

  test("cycleSort flips asc → desc → cleared", () => {
    let state = clearSort();
    state = cycleSort(state, "title", FIELDS);
    expect(state).toEqual({ fieldId: "title", direction: "asc" });
    state = cycleSort(state, "title", FIELDS);
    expect(state).toEqual({ fieldId: "title", direction: "desc" });
    state = cycleSort(state, "title", FIELDS);
    expect(state).toEqual({ fieldId: null, direction: "asc" });
  });

  test("cycleSort honors the field defaultDirection on first select", () => {
    const state = cycleSort(clearSort(), "priority", FIELDS);
    expect(state).toEqual({ fieldId: "priority", direction: "desc" });
  });

  test("applySort orders strings ascending and clears when state is empty", () => {
    const rows = [
      { title: "Charlie", priority: 1 },
      { title: "Alpha", priority: 3 },
      { title: "Bravo", priority: 2 },
    ];
    const sorted = applySort(rows, { fieldId: "title", direction: "asc" }, FIELDS);
    expect(sorted.map((row) => row.title)).toEqual(["Alpha", "Bravo", "Charlie"]);

    const sortedDesc = applySort(rows, { fieldId: "priority", direction: "desc" }, FIELDS);
    expect(sortedDesc.map((row) => row.priority)).toEqual([3, 2, 1]);

    const original = applySort(rows, clearSort(), FIELDS);
    expect(original.map((row) => row.title)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  test("headerStatus reports active field with direction arrow", () => {
    expect(headerStatus(clearSort(), FIELDS)).toBe("Sort: none");
    expect(headerStatus({ fieldId: "title", direction: "asc" }, FIELDS)).toBe("Sort: Title ↑");
    expect(headerStatus({ fieldId: "priority", direction: "desc" }, FIELDS)).toBe("Sort: Priority ↓");
  });

  test("buildSortMenu surfaces active state per field", () => {
    const menu = buildSortMenu({ fieldId: "priority", direction: "desc" }, FIELDS);
    expect(menu).toHaveLength(3);
    expect(menu[1]).toEqual({ field: FIELDS[1]!, active: true, activeDirection: "desc" });
    expect(menu[0]).toEqual({ field: FIELDS[0]!, active: false, activeDirection: null });
  });
});
