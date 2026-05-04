import { describe, expect, test } from "bun:test";

import { Renderer } from "../../src/tui/renderer.ts";
import { ReportsScreen } from "../../src/tui/screens/reports.ts";
import { ActiveSprintBoardScreen, SprintPlanningScreen, SprintsListScreen } from "../../src/tui/screens/sprints.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

const sprints = [
  { id: "sprint-1", name: "Sprint 1", status: "planned", startDate: "2026-05-04", endDate: "2026-05-15" },
  { id: "sprint-2", name: "Sprint 2", status: "active", startDate: "2026-05-18", endDate: "2026-05-29" },
  { id: "sprint-0", name: "Sprint 0", status: "completed", startDate: "2026-04-20", endDate: "2026-05-01" },
];

const tasks = [
  { id: "task-1", title: "Backlog task", status: "todo", points: 3 },
  { id: "task-2", title: "Sprint task", status: "in-progress", points: 5, sprintId: "sprint-1" },
  { id: "task-3", title: "Done sprint task", status: "done", points: 2, sprintId: "sprint-2" },
  { id: "task-4", title: "Todo sprint task", status: "todo", points: 8, sprintId: "sprint-2" },
];

describe("SprintsListScreen", () => {
  test("groups sprints by status, activates selected sprint with A, and opens create form with c", async () => {
    const activations: string[] = [];
    const screen = new SprintsListScreen({
      caller: {
        sprints: {
          list: async () => sprints,
          activate: async (input) => {
            activations.push(input.id);
            return { ok: true };
          },
          create: async (input) => ({ id: "sprint-new", status: "planned", ...input }),
        },
      },
    });

    await screen.load();
    const rendered = renderPlain((renderer) => screen.render(renderer));
    expect(rendered).toContain("PLANNED");
    expect(rendered).toContain("ACTIVE");
    expect(rendered).toContain("COMPLETED");

    await screen.handleKey("A");
    expect(activations).toEqual(["sprint-1"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Sprint 1  [active]");

    await screen.handleKey("c");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Create sprint");
    await screen.submitCreate({ name: "Sprint 3", startDate: "2026-06-01", endDate: "2026-06-12" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Sprint 3  [planned]");
  });
});

describe("SprintPlanningScreen", () => {
  test("moves backlog task into sprint with m, removes it with x, and updates capacity", async () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const screen = new SprintPlanningScreen({
      sprintId: "sprint-1",
      capacityPoints: 10,
      caller: {
        tasks: {
          list: async () => tasks,
        },
        sprints: {
          addTask: async (input) => {
            added.push(input);
            return { ok: true };
          },
          removeTask: async (input) => {
            removed.push(input);
            return { ok: true };
          },
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Capacity 5/10");

    await screen.handleKey("m");
    expect(added).toEqual([{ sprintId: "sprint-1", taskId: "task-1" }]);
    const moved = renderPlain((renderer) => screen.render(renderer));
    expect(moved).toContain("Capacity 8/10");
    expect(moved).toContain("Backlog task");

    await screen.handleKey("x");
    expect(removed).toEqual([{ sprintId: "sprint-1", taskId: "task-2" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Capacity 3/10");
  });
});

describe("ActiveSprintBoardScreen", () => {
  test("renders only sprint tasks, shows days remaining, quick-adds into sprint, and closes with disposition", async () => {
    const created: unknown[] = [];
    const closed: unknown[] = [];
    const retroEvents: unknown[] = [];
    const screen = new ActiveSprintBoardScreen({
      sprint: { id: "sprint-2", name: "Sprint 2", status: "active", endDate: "2026-05-29" },
      today: "2026-05-25",
      caller: {
        tasks: {
          list: async () => tasks,
          create: async (input) => {
            created.push(input);
            return { id: "task-new", title: String(input.title), status: "todo", sprintId: input.sprintId };
          },
        },
        sprints: {
          close: async (input) => {
            closed.push(input);
            return { ok: true };
          },
        },
        events: {
          emit: async (input) => {
            retroEvents.push(input);
          },
        },
      },
    });

    await screen.load();
    const board = renderPlain((renderer) => screen.render(renderer));
    expect(board).toContain("4 days remaining");
    expect(board).toContain("Done sprint task");
    expect(board).not.toContain("Backlog task");

    await screen.handleKey("c");
    await screen.submitQuickAdd("New sprint task");
    expect(created).toEqual([{ title: "New sprint task", status: "todo", sprintId: "sprint-2" }]);

    await screen.handleKey("C");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("2 incomplete tasks - move to: [Backlog] [Next Sprint]");
    await screen.submitClose("next-sprint");
    expect(closed).toEqual([{ sprintId: "sprint-2", incompleteDisposition: "next-sprint" }]);
    expect(retroEvents).toEqual([{ type: "retro.created", sprintId: "sprint-2" }]);
  });
});

describe("ReportsScreen", () => {
  test("switches reports with keys 1-6 and renders deterministic ASCII charts", async () => {
    const screen = new ReportsScreen({
      caller: {
        reports: {
          metrics: async () => ({
            burndown: [
              { day: 1, ideal: 20, actual: 20 },
              { day: 2, ideal: 15, actual: 18 },
              { day: 3, ideal: 10, actual: 9 },
              { day: 4, ideal: 5, actual: 6 },
            ],
            velocity: [
              { sprint: "S1", points: 8 },
              { sprint: "S2", points: 13 },
              { sprint: "S3", points: 21 },
            ],
            cycleTime: [1, 2, 2, 3, 5],
            throughput: [2, 4, 3, 6, 5],
            wip: { todo: 4, inProgress: 2, review: 1, done: 8 },
            cfd: [
              { day: "Mon", todo: 5, inProgress: 2, done: 1 },
              { day: "Tue", todo: 3, inProgress: 4, done: 2 },
            ],
          }),
        },
      },
    });

    await screen.load();
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Burndown");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("ideal | actual");

    await screen.handleKey("2");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("S3 | ##################### 21");
    await screen.handleKey("3");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("median: 2");
    await screen.handleKey("4");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Throughput");
    await screen.handleKey("5");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("inProgress: 2");
    await screen.handleKey("6");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Mon | TTTTT IIDD");
  });
});
