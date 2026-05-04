import { describe, expect, mock, test } from "bun:test";
import { ActiveSprintBoardScreen, type TuiSprint } from "./sprints.ts";

const sprint: TuiSprint = {
  id: "sprint-1",
  name: "Sprint 1",
  status: "active",
  startDate: "2026-05-01",
  endDate: "2026-05-14",
};

function makeScreen(overrides?: { today?: string }) {
  const mockCreate = mock(() =>
    Promise.resolve({ id: "t-new", title: "New task", status: "todo", sprintId: "sprint-1" }),
  );
  const mockClose = mock(() => Promise.resolve({ ok: true }));
  const mockEmit = mock(() => Promise.resolve());

  const screen = new ActiveSprintBoardScreen({
    sprint,
    today: overrides?.today ?? "2026-05-05",
    caller: {
      tasks: {
        list: () =>
          Promise.resolve([
            { id: "t1", title: "Sprint task", status: "todo", sprintId: "sprint-1", points: 3 },
            { id: "t2", title: "Other sprint", status: "done", sprintId: "sprint-1", points: 5 },
            { id: "t3", title: "Backlog task", status: "todo", sprintId: null, points: 1 },
          ]),
        create: mockCreate,
      },
      sprints: { close: mockClose },
      events: { emit: mockEmit },
    },
  });

  return { screen, mockCreate, mockClose, mockEmit };
}

describe("ActiveSprintBoardScreen", () => {
  test("renders only sprint-scoped tasks", async () => {
    const { screen } = makeScreen();
    await screen.load();

    const lines: string[] = [];
    screen.render({
      writeln: (line?: string) => lines.push(line ?? ""),
      separator: () => lines.push("---"),
    } as never);

    const text = lines.join("\n");
    expect(text).toContain("Sprint task");
    expect(text).toContain("Other sprint");
    expect(text).not.toContain("Backlog task");
  });

  test("shows days remaining in header", async () => {
    const { screen } = makeScreen({ today: "2026-05-05" });
    await screen.load();

    const lines: string[] = [];
    screen.render({
      writeln: (line?: string) => lines.push(line ?? ""),
      separator: () => lines.push("---"),
    } as never);

    const text = lines.join("\n");
    expect(text).toContain("9 days remaining");
  });

  test("quick-add creates task with correct sprint_id", async () => {
    const { screen, mockCreate } = makeScreen();
    await screen.load();
    await screen.handleKey("c");
    await screen.submitQuickAdd("New feature");

    expect(mockCreate).toHaveBeenCalledWith({
      title: "New feature",
      status: "todo",
      sprintId: "sprint-1",
    });
  });

  test("close sprint calls sprints.close and emits event", async () => {
    const { screen, mockClose, mockEmit } = makeScreen();
    await screen.load();
    await screen.handleKey("C");
    await screen.submitClose("backlog");

    expect(mockClose).toHaveBeenCalledWith({
      sprintId: "sprint-1",
      incompleteDisposition: "backlog",
    });
    expect(mockEmit).toHaveBeenCalledWith({
      type: "retro.created",
      sprintId: "sprint-1",
    });
  });
});
