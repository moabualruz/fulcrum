import { describe, expect, test } from "bun:test";
import { getInitialProjectView, projectViewHref, rememberProjectView } from "./view-switcher";

function storage(initial?: string): Storage {
  const values = new Map<string, string>();
  if (initial) values.set("fulcrum:last-project-view", initial);
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("project view switcher", () => {
  test("persists last-used view and returns it on next load", () => {
    const localStorage = storage();

    rememberProjectView("calendar", localStorage);

    expect(getInitialProjectView(localStorage)).toBe("calendar");
  });

  test("falls back to board for invalid persisted values", () => {
    expect(getInitialProjectView(storage("nonsense"))).toBe("board");
  });

  test("builds board and sibling route hrefs", () => {
    expect(projectViewHref("project-1", "board")).toBe("/projects/project-1/board");
    expect(projectViewHref("project-1", "list")).toBe("/projects/project-1/list");
  });
});
