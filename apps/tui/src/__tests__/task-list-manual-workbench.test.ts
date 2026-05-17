import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { TaskListScreen } from "../screens/task-list.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import type {
  ManualTaskWorkbenchInput,
  ManualTaskWorkbenchOutput,
} from "@work-management/application/manual-task-workbench.ts";

const WORKBENCH: ManualTaskWorkbenchOutput = {
  projectId: "99999999-9999-4999-8999-999999999999",
  traceId: "trace-tui-workbench",
  viewMode: "board",
  layout: "kanban",
  filtersApplied: 0,
  accessSpecifiers: [],
  columns: [{
    group: "started",
    label: "Started",
    color: "#f59e0b",
    taskIds: ["task-workbench"],
    count: 1,
  }],
  listRows: [{
    id: "task-workbench",
    traceId: "trace-tui-workbench",
    projectId: "99999999-9999-4999-8999-999999999999",
    title: "Build manual task workbench",
    status: "in_progress",
    stateGroup: "started",
    stateLabel: "Started",
    priority: 3,
    points: 5,
    assigneeId: null,
    labels: ["agent"],
    taskType: "task",
    cycleId: "cycle-foundation",
    moduleId: "module-workbench",
    parentId: null,
    dependencyIds: [],
    updatedAt: "2026-05-13T00:00:00.000Z",
  }],
  table: {
    visibleColumns: [{ key: "title", label: "Title" }],
    rows: [{
      id: "task-workbench",
      traceId: "trace-tui-workbench",
      cells: { title: "Build manual task workbench" },
    }],
  },
  emptyState: {
    allTasksEmpty: false,
    visibleTasksEmpty: false,
    message: "",
  },
};

describe("TUI manual task workbench", () => {
  test("task list screen loads board/list/table state through the caller", async () => {
    const calls: unknown[] = [];
    const tasksCaller = {
      list: async () => [
        { id: "task-workbench", title: "Build manual task workbench", status: "in_progress" },
      ],
      manualWorkbench: async (input: ManualTaskWorkbenchInput) => {
        calls.push(input);
        return WORKBENCH;
      },
    };
    const screen = new TaskListScreen({ caller: { tasks: tasksCaller } });
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);

    await screen.load();
    await screen.handleKey("V");
    screen.render(renderer);

    expect(calls).toEqual([{ viewMode: "board" }]);
    const output = tty.plainText();
    expect(output).toContain("manual task workbench");
    expect(output).toContain("trace-tui-workbench");
    expect(output).toContain("Started  1");
    expect(output).toContain("Build manual task workbench");
  });
});
