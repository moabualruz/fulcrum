import { describe, expect, test } from "bun:test";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { TaskBoardScreen } from "@fulcrum/tui/screens/task-board.ts";
import { TaskDetailScreen } from "@fulcrum/tui/screens/task-detail.ts";
import { TaskCalendarScreen } from "@fulcrum/tui/screens/task-calendar.ts";
import { TaskListScreen } from "@fulcrum/tui/screens/task-list.ts";
import { TaskTimelineScreen } from "@fulcrum/tui/screens/task-timeline.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 32 });
  render(new Renderer(tty));
  return tty.plainText();
}

const tasks = Array.from({ length: 50 }, (_, index) => ({
  id: `task-${index + 1}`,
  title: `Task ${index + 1}`,
  status: index % 3 === 0 ? "todo" : index % 3 === 1 ? "in-progress" : "done",
  assignee: index % 2 === 0 ? "alex" : "sam",
  labels: index % 5 === 0 ? ["bug"] : ["feature"],
  dueDate: `2026-05-${String((index % 7) + 4).padStart(2, "0")}`,
  startDate: `2026-05-${String((index % 7) + 1).padStart(2, "0")}`,
  endDate: `2026-05-${String((index % 7) + 3).padStart(2, "0")}`,
}));

describe("TaskListScreen", () => {
  test("filters the panel list with an in-panel search bar and restores on Escape", async () => {
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => tasks.slice(0, 4),
          bulk: async () => ({ ok: true }),
        },
      },
    });

    await screen.load();
    await screen.handleKey("/");
    await screen.handleKey("3");

    const filtered = renderPlain((renderer) => screen.render(renderer));
    expect(filtered).toContain("Search: 3");
    expect(filtered).toContain("Task 3");
    expect(filtered).not.toContain("Task 1");

    await screen.handleKey("\x1b");
    const restored = renderPlain((renderer) => screen.render(renderer));
    expect(restored).not.toContain("Search: 3");
    expect(restored).toContain("Task 1");
    expect(restored).toContain("Task 4");
  });

  test("renders fifty tasks, applies filter chips, multi-selects with Space, and bulk-updates selected rows", async () => {
    const bulkUpdates: Array<{ ids: string[]; status?: string }> = [];
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => tasks,
          bulk: async (input) => {
            bulkUpdates.push(input);
            return { ok: true };
          },
        },
      },
      viewportRows: 50,
    });

    await screen.load();
    expect(screen.visibleTasks).toHaveLength(50);
    expect(renderPlain((renderer) => screen.render(renderer)).match(/Task \d+/g)).toHaveLength(50);

    await screen.applyFilter({ status: "todo" });
    const filtered = renderPlain((renderer) => screen.render(renderer));
    expect(filtered).toContain("[status: todo]");
    expect(filtered).toContain("Task 1");
    expect(filtered).not.toMatch(/^.*Task 2  \[in-progress\].*$/m);

    await screen.handleKey(" ");
    await screen.handleKey("j");
    await screen.handleKey(" ");
    await screen.handleKey("B");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Bulk update");

    await screen.submitBulkStatus("done");
    expect(bulkUpdates).toEqual([{ ids: ["task-1", "task-4"], status: "done" }]);
    expect(screen.selectedTaskIds).toEqual([]);
    await screen.applyFilter({ status: "done" });
    const doneRows = renderPlain((renderer) => screen.render(renderer));
    expect(doneRows).toContain("Task 1  [done]");
    expect(doneRows).toContain("Task 4  [done]");
  });

  test("creates inline with preserved list scope, recurrence preview, duplicate guard, and retry state", async () => {
    const creates: unknown[] = [];
    let shouldFail = true;
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => tasks.slice(0, 3),
          create: async (input) => {
            creates.push(input);
            if (shouldFail) throw new Error("network unavailable");
            return { id: "task-new", title: input.title, status: input.status, labels: [] };
          },
        },
      },
      createScope: {
        source: "planning",
        projectId: "project-1",
        sprintId: "sprint-1",
        moduleId: "module-1",
        cycleId: "cycle-1",
      },
    });

    await screen.load();
    await screen.handleKey("c");
    screen.updateCreateDraft({ title: "Weekly sync", recurrence: "weekly" });
    const draft = renderPlain((renderer) => screen.render(renderer));
    expect(draft).toContain("Task 1");
    expect(draft).toContain("Scope: planning  project=project-1  sprint=sprint-1  module=module-1  cycle=cycle-1");
    expect(draft).toContain("weekly preview: 2026-05-19, 2026-05-26, 2026-06-02");

    await screen.submitCreate({ title: "Task 1" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Duplicate task title in project-1");
    expect(creates).toEqual([]);

    await screen.submitCreate({ title: "Weekly sync" });
    const failed = renderPlain((renderer) => screen.render(renderer));
    expect(failed).toContain("network unavailable");
    expect(failed).toContain("Retry: fulcrum task new --title 'Weekly sync' --project project-1 --sprint sprint-1 --module module-1 --cycle cycle-1 --recurrence weekly");

    shouldFail = false;
    await screen.submitCreate();
    expect(creates.at(-1)).toEqual({
      source: "planning",
      projectId: "project-1",
      sprintId: "sprint-1",
      moduleId: "module-1",
      cycleId: "cycle-1",
      title: "Weekly sync",
      status: "todo",
      recurrence: "weekly",
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Weekly sync");
  });
});

describe("TaskBoardScreen", () => {
  test("renders status columns, moves selected card with h/l, opens detail, and creates task inline", async () => {
    const updates: Array<{ id: string; status: string }> = [];
    const created: string[] = [];
    const opened: string[] = [];
    const screen = new TaskBoardScreen({
      caller: {
        tasks: {
          list: async () => tasks.slice(0, 6),
          update: async (input) => {
            updates.push(input);
            return { ...tasks[0]!, status: input.status };
          },
          create: async (input) => {
            created.push(input.title);
            return { id: "task-new", title: input.title, status: input.status, labels: [] };
          },
        },
      },
      onOpenTask: (id) => opened.push(id),
    });

    await screen.load();
    const board = renderPlain((renderer) => screen.render(renderer));
    expect(board).toContain("TODO");
    expect(board).toContain("IN-PROGRESS");
    expect(board).toContain("DONE");

    await screen.handleKey("l");
    expect(updates).toEqual([{ id: "task-1", status: "in-progress" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Task 1  [in-progress]");

    await screen.handleKey("\r");
    expect(opened).toEqual(["task-1"]);

    await screen.handleKey("c");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Create task");
    await screen.submitCreate("Inline task");
    expect(created).toEqual(["Inline task"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Inline task");
  });

  test("shows board create scope and preserves failed draft for retry", async () => {
    const creates: unknown[] = [];
    const screen = new TaskBoardScreen({
      caller: {
        tasks: {
          list: async () => tasks.slice(0, 2),
          update: async (input) => ({ ...tasks[0]!, status: input.status }),
          create: async (input) => {
            creates.push(input);
            throw new Error("write failed");
          },
        },
      },
      createScope: {
        source: "board",
        projectId: "project-1",
        sprintId: "sprint-1",
        moduleId: "module-1",
        cycleId: "cycle-1",
      },
    });

    await screen.load();
    await screen.handleKey("c");
    screen.updateCreateDraft({ title: "Board sync", recurrence: "daily" });
    const draft = renderPlain((renderer) => screen.render(renderer));
    expect(draft).toContain("Task 1");
    expect(draft).toContain("Scope: board  project=project-1  sprint=sprint-1  module=module-1  cycle=cycle-1");
    expect(draft).toContain("daily preview: 2026-05-19, 2026-05-20, 2026-05-21");

    await screen.submitCreate();
    const failed = renderPlain((renderer) => screen.render(renderer));
    expect(creates).toEqual([{
      source: "board",
      projectId: "project-1",
      sprintId: "sprint-1",
      moduleId: "module-1",
      cycleId: "cycle-1",
      title: "Board sync",
      status: "todo",
      recurrence: "daily",
    }]);
    expect(failed).toContain("write failed");
    expect(failed).toContain("Title: Board sync");
    expect(failed).toContain("Retry: fulcrum task new --title 'Board sync' --project project-1 --sprint sprint-1 --module module-1 --cycle cycle-1 --recurrence daily");
  });
});

describe("TaskDetailScreen", () => {
  test("renders detail sections, edits title/status/assignee, dependencies, child tasks, and comments", async () => {
    const updates: unknown[] = [];
    const comments: string[] = [];
    const children: unknown[] = [];
    const screen = new TaskDetailScreen({
      taskId: "task-1",
      caller: {
        tasks: {
          get: async () => ({
            id: "task-1",
            title: "Ship TUI",
            description: "Supports **bold**, _italic_, and `code`.",
            status: "todo",
            assignee: null,
            dueDate: "2026-05-10",
            priority: "high",
            labels: ["tui", "p15"],
            project: "Fulcrum",
            customFields: { size: "L", risk: "medium" },
            comments: [{ id: "comment-1", author: "alex", body: "**Looks** `safe`." }],
            activity: ["created task"],
            watchers: ["sam"],
            subtasks: [{ id: "task-2", title: "Wire forms", status: "todo" }],
            blockedBy: [{ id: "task-9", title: "Task list" }],
            breadcrumb: [
              { id: "task-root", title: "Epic" },
              { id: "task-1", title: "Ship TUI" },
            ],
          }),
          update: async (input) => {
            updates.push(input);
            return { id: input.id, title: "Ship TUI updated", status: "in-progress" };
          },
          create: async (input) => {
            children.push(input);
            return { id: "task-child", title: String(input.title), status: "todo" };
          },
        },
        custom_fields: {
          list: async () => [
            { slug: "risk", name: "Risk", position: 1 },
            { slug: "size", name: "Size", position: 2 },
          ],
        },
        comments: {
          create: async (input) => {
            comments.push(input.body);
            return { id: "comment-2", author: "sam", body: input.body };
          },
        },
      },
      onNavigateTask: () => {},
    });

    await screen.load();
    const detail = renderPlain((renderer) => screen.render(renderer));
    for (const section of [
      "Description",
      "Status",
      "Assignee",
      "Due date",
      "Priority",
      "Labels",
      "Custom fields",
      "Comments (1)",
      "Activity",
      "Watchers",
      "Subtasks",
      "Blocking",
    ]) {
      expect(detail).toContain(section);
    }
    expect(detail).toContain("Risk: medium");
    expect(detail.indexOf("Risk: medium")).toBeLessThan(detail.indexOf("Size: L"));
    expect(detail).toContain("Looks safe");

    await screen.handleKey("e");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Edit title");
    await screen.submitTitle("Ship TUI updated");
    expect(updates).toContainEqual({ id: "task-1", title: "Ship TUI updated" });

    await screen.handleKey("s");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Status picker");
    await screen.submitStatus("in-progress");
    expect(updates).toContainEqual({ id: "task-1", status: "in-progress" });

    await screen.handleKey("a");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("User picker");
    await screen.submitAssignee("sam");
    expect(updates).toContainEqual({ id: "task-1", assignee: "sam" });

    await screen.handleKey("c");
    await screen.submitChild("Child task");
    expect(children).toEqual([{ title: "Child task", parent_id: "task-1", project: "Fulcrum" }]);

    await screen.openDependencySearch();
    await screen.submitBlockedBy("task-10");
    expect(updates).toContainEqual({ id: "task-1", blocked_by: ["task-9", "task-10"] });

    await screen.submitComment("**Done** with `forms`.");
    expect(comments).toEqual(["**Done** with `forms`."]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Comments (2)");
  });

  test("validates create form title, cancels with Escape, submits tasks.create, and navigates to detail", async () => {
    const creates: unknown[] = [];
    const opened: string[] = [];
    const screen = new TaskDetailScreen({
      mode: "create",
      caller: {
        tasks: {
          create: async (input) => {
            creates.push(input);
            return { id: "task-new", title: String(input.title), status: "todo" };
          },
        },
      },
      onNavigateTask: (id) => opened.push(id),
    });

    await screen.submitCreate({ title: "   ", project: "Fulcrum" });
    expect(screen.validationError).toBe("Title required");
    expect(creates).toEqual([]);

    await screen.handleKey("\x1b");
    expect(screen.cancelled).toBe(true);
    expect(creates).toEqual([]);

    await screen.submitCreate({ title: "New task", project: "Fulcrum" });
    expect(creates).toEqual([{ title: "New task", project: "Fulcrum" }]);
    expect(opened).toEqual(["task-new"]);
  });
});

describe("TaskCalendarScreen", () => {
  test("places due tasks in day cells and switches weeks with arrow keys", async () => {
    const screen = new TaskCalendarScreen({
      caller: { tasks: { list: async () => tasks.slice(0, 7) } },
      weekStart: "2026-05-04",
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Week of 2026-05-04");
    expect(initial).toContain("Mon 05-04: Task 1");
    expect(initial).toContain("Sun 05-10: Task 7");

    await screen.handleKey("\x1b[C");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Week of 2026-05-11");

    await screen.handleKey("\x1b[D");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Week of 2026-05-04");
  });
});

describe("TaskTimelineScreen", () => {
  test("renders proportional ASCII Gantt bars and scrolls horizontally", async () => {
    const screen = new TaskTimelineScreen({
      caller: { tasks: { list: async () => tasks.slice(0, 3) } },
      windowStart: "2026-05-01",
      daysVisible: 10,
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Timeline 2026-05-01");
    expect(initial).toContain("Task 1");
    expect(initial).toContain("###");

    await screen.handleKey("\x1b[C");
    expect(screen.scrollDays).toBe(1);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Timeline 2026-05-02");
  });
});
