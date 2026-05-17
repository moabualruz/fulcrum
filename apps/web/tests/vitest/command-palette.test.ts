import { describe, it, expect } from "vitest";
import { filterAndSort, type CommandItem } from "../../src/lib/components/command-palette/command-palette-filter.js";
import { makeKeydownHandler, makeSelect } from "../../src/lib/components/command-palette/command-palette-handlers.js";

const TASK_ID_REGEX = /^[A-Z]{2,6}-\d+$/i;

const NAV_ITEMS: CommandItem[] = [
  { id: "board", label: "Task Board" },
  { id: "backlog", label: "Backlog" },
  { id: "settings", label: "Project Settings" },
  { id: "sprints", label: "Sprint Planning" },
  { id: "reports", label: "Reports" },
];

function keyEvent(input: { key: string; metaKey?: boolean; ctrlKey?: boolean }): KeyboardEvent {
  return {
    key: input.key,
    metaKey: input.metaKey ?? false,
    ctrlKey: input.ctrlKey ?? false,
    preventDefault: () => {},
  } as KeyboardEvent;
}

describe("CommandPalette — task workflow", () => {
  it("fuzzy search matches substring", () => {
    const results = filterAndSort(NAV_ITEMS, "board");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("board");
  });

  it("fuzzy search returns empty for no match", () => {
    const results = filterAndSort(NAV_ITEMS, "zzzzz");
    expect(results.length).toBe(0);
  });

  it("empty query returns all items in order", () => {
    const results = filterAndSort(NAV_ITEMS, "");
    expect(results.length).toBe(NAV_ITEMS.length);
    expect(results[0].id).toBe("board");
  });

  it("task ID regex detects valid IDs", () => {
    expect(TASK_ID_REGEX.test("TSK-123")).toBe(true);
    expect(TASK_ID_REGEX.test("AB-1")).toBe(true);
    expect(TASK_ID_REGEX.test("PROJCT-9999")).toBe(true);
    expect(TASK_ID_REGEX.test("A-1")).toBe(false); // too short prefix
    expect(TASK_ID_REGEX.test("TOOLONG-1")).toBe(false); // >6 chars
    expect(TASK_ID_REGEX.test("TSK-")).toBe(false); // no number
    expect(TASK_ID_REGEX.test("123-TSK")).toBe(false); // reversed
  });

  it("navigation filtering narrows to relevant actions", () => {
    const results = filterAndSort(NAV_ITEMS, "spr");
    expect(results.some((r) => r.id === "sprints")).toBe(true);
    expect(results.some((r) => r.id === "board")).toBe(false);
  });

  it("makeKeydownHandler toggles on Cmd+K", () => {
    let isOpen = false;
    const handler = makeKeydownHandler(
      () => isOpen,
      (next) => { isOpen = next; },
    );
    const event = keyEvent({ key: "k", metaKey: true });
    handler(event);
    expect(isOpen).toBe(true);
  });

  it("makeKeydownHandler closes on Escape when open", () => {
    let isOpen = true;
    const handler = makeKeydownHandler(
      () => isOpen,
      (next) => { isOpen = next; },
    );
    const event = keyEvent({ key: "Escape" });
    handler(event);
    expect(isOpen).toBe(false);
  });

  it("makeSelect picks top result and closes", () => {
    let selected: CommandItem | null = null;
    let isOpen = true;
    const select = makeSelect(
      NAV_ITEMS,
      "back",
      (item) => { selected = item; },
      (next) => { isOpen = next; },
    );
    select();
    expect(selected?.id).toBe("backlog");
    expect(isOpen).toBe(false);
  });
});
