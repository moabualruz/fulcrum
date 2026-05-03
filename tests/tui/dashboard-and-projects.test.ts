import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { DashboardScreen } from "../../src/tui/screens/dashboard.ts";
import { ProjectDetailScreen } from "../../src/tui/screens/project-detail.ts";
import { ProjectsScreen } from "../../src/tui/screens/projects.ts";
import { Renderer } from "../../src/tui/renderer.ts";
import { SubscriptionBridge } from "../../src/tui/subscriptions.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 100, rows: 30 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("DashboardScreen", () => {
  test("loads counters and recent runs from caller, then updates bell and runs from subscriptions", async () => {
    const bus = new EventEmitter();
    const bridge = new SubscriptionBridge(bus);
    const screen = new DashboardScreen({
      caller: {
        dashboard: {
          summary: async () => ({
            projectsCount: 3,
            openTasksCount: 7,
            runsLast7d: 5,
            bellCount: 1,
            recentRuns: [
              { id: "run-1", agent: "codex", status: "running", startedAt: "2026-05-03T08:00:00Z" },
            ],
          }),
        },
      },
      subscriptions: bridge,
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));

    expect(initial).toContain("Dashboard");
    expect(initial).toContain("Projects: 3");
    expect(initial).toContain("Open tasks: 7");
    expect(initial).toContain("Runs 7d: 5");
    expect(initial).toContain("Bell: 1");
    expect(initial).toContain("codex");

    bus.emit("notifications.unreadCount", { count: 2 });
    bus.emit("runs.onRunUpdate", {
      id: "run-2",
      agent: "claude",
      status: "succeeded",
      startedAt: "2026-05-03T09:00:00Z",
    });

    const updated = renderPlain((renderer) => screen.render(renderer));
    expect(updated).toContain("Bell: 2");
    expect(updated.indexOf("claude")).toBeLessThan(updated.indexOf("codex"));

    screen.dispose();
    bus.emit("notifications.unreadCount", { count: 9 });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Bell: 2");
  });
});

describe("ProjectsScreen", () => {
  test("renders twenty projects, opens create overlay, navigates on Enter, and confirms delete", async () => {
    const projects = Array.from({ length: 20 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      slug: `project-${index + 1}`,
      status: "active",
      updatedAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const created: string[] = [];
    const deleted: string[] = [];
    const navigated: string[] = [];
    const screen = new ProjectsScreen({
      caller: {
        projects: {
          list: async () => projects,
          create: async (input) => {
            created.push(input.name);
            return { id: "project-new", name: input.name, slug: "new", status: "active", updatedAt: "2026-05-03T00:00:00Z" };
          },
          delete: async (input) => {
            deleted.push(input.id);
            return { ok: true };
          },
        },
      },
      onNavigateProject: (id) => {
        navigated.push(id);
      },
      viewportRows: 20,
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    expect(listing.match(/Project \d+/g)).toHaveLength(20);
    expect(screen.visibleProjects).toHaveLength(20);

    await screen.handleKey("\r");
    expect(navigated).toEqual(["project-1"]);

    await screen.handleKey("c");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Create project");
    await screen.submitCreate("New Project");
    expect(created).toEqual(["New Project"]);

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Confirm? [y/N]");
    await screen.handleKey("y");
    expect(deleted).toEqual(["project-new"]);
  });
});

describe("ProjectDetailScreen", () => {
  test("switches numbered tabs and preserves per-tab scroll position", async () => {
    const screen = new ProjectDetailScreen({
      project: { id: "project-1", name: "Alpha", slug: "alpha", status: "active" },
    });

    expect(renderPlain((renderer) => screen.render(renderer))).toContain("[board]");

    await screen.handleKey("j");
    await screen.handleKey("j");
    expect(screen.scrollFor("board")).toBe(2);

    await screen.handleKey("2");
    expect(screen.activeTab).toBe("list");
    expect(screen.scrollFor("list")).toBe(0);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("[list]");

    await screen.handleKey("6");
    expect(screen.activeTab).toBe("docs");

    await screen.handleKey("\t");
    expect(screen.activeTab).toBe("board");
    expect(screen.scrollFor("board")).toBe(2);
  });
});
