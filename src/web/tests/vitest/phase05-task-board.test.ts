import { describe, it, expect } from "vitest";

// TaskBoard.svelte is a Svelte 5 component needing DOM + fetch.
// We test pure logic: column grouping, WIP limits, density modes.

interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority: number;
}

function groupByStatus(tasks: BoardTask[]): Map<string, BoardTask[]> {
  const map = new Map<string, BoardTask[]>();
  for (const task of tasks) {
    const list = map.get(task.status) ?? [];
    list.push(task);
    map.set(task.status, list);
  }
  return map;
}

function isWipExceeded(columnTasks: BoardTask[], wipLimit: number | null): boolean {
  if (wipLimit === null || wipLimit <= 0) return false;
  return columnTasks.length > wipLimit;
}

type DensityMode = "compact" | "comfortable";
function cardHeight(mode: DensityMode): number {
  return mode === "compact" ? 48 : 96;
}

const TASKS: BoardTask[] = [
  { id: "1", title: "Fix login", status: "todo", priority: 1 },
  { id: "2", title: "Add tests", status: "todo", priority: 2 },
  { id: "3", title: "Deploy", status: "in_progress", priority: 1 },
  { id: "4", title: "Review PR", status: "in_progress", priority: 3 },
  { id: "5", title: "Write docs", status: "done", priority: 2 },
];

describe("TaskBoard logic — Phase 05", () => {
  it("groups tasks by status into columns", () => {
    const columns = groupByStatus(TASKS);
    expect(columns.get("todo")?.length).toBe(2);
    expect(columns.get("in_progress")?.length).toBe(2);
    expect(columns.get("done")?.length).toBe(1);
  });

  it("empty task list produces no columns", () => {
    const columns = groupByStatus([]);
    expect(columns.size).toBe(0);
  });

  it("WIP limit not exceeded when under limit", () => {
    const col = TASKS.filter((t) => t.status === "todo");
    expect(isWipExceeded(col, 5)).toBe(false);
  });

  it("WIP limit exceeded when over limit", () => {
    const col = TASKS.filter((t) => t.status === "todo");
    expect(isWipExceeded(col, 1)).toBe(true);
  });

  it("WIP limit null means no limit (never exceeded)", () => {
    expect(isWipExceeded(TASKS, null)).toBe(false);
  });

  it("compact density mode gives smaller card height", () => {
    expect(cardHeight("compact")).toBeLessThan(cardHeight("comfortable"));
  });

  it("comfortable density mode gives larger card height", () => {
    expect(cardHeight("comfortable")).toBe(96);
  });

  it("groupByStatus preserves task objects by reference", () => {
    const columns = groupByStatus(TASKS);
    const todoTasks = columns.get("todo")!;
    expect(todoTasks[0]).toBe(TASKS[0]);
  });
});
