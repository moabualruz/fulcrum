import { describe, expect, test } from "bun:test";

import { filterAndSort, type CommandItem } from "./command-palette-filter";

const ITEMS: CommandItem[] = [
  { id: "runs", label: "Agent runs" },
  { id: "projects", label: "Projects" },
  { id: "docs", label: "Docs" },
  { id: "settings", label: "Settings" },
];

describe("filterAndSort", () => {
  test("empty query returns items in original order", () => {
    expect(filterAndSort(ITEMS, "").map((item) => item.id)).toEqual([
      "runs",
      "projects",
      "docs",
      "settings",
    ]);
  });

  test("non-empty query narrows to items with score greater than zero", () => {
    expect(filterAndSort(ITEMS, "doc").map((item) => item.id)).toEqual(["docs"]);
  });

  test("ties sort by label ascending", () => {
    const tiedItems: CommandItem[] = [
      { id: "beta", label: "Beta run" },
      { id: "alpha", label: "Alpha run" },
    ];
    expect(filterAndSort(tiedItems, "run").map((item) => item.label)).toEqual([
      "Alpha run",
      "Beta run",
    ]);
  });
});
