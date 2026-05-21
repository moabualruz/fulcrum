import { describe, expect, test } from "bun:test";

import { REQUIRED_RESILIENCE_STATES } from "@platform-core/application/interface-parity/resilience-state-matrix.ts";
import { TuiApp, type TuiCaller } from "../index.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("TUI E2E data display", () => {
  test("projects screen renders caller data", async () => {
    const text = await renderDomain("projects", makeCaller({
      projects: { list: async () => [{ id: "project-1", name: "interface Project" }] },
    }));
    expect(text).toContain("Projects");
    expect(text).toContain("interface Project");
  });

  test("status footer renders supplied trace, run, and branch identity", async () => {
    const tty = new FakeTTY({ columns: 140, rows: 30 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: makeCaller(),
      traceContext: {
        traceId: "trace-visible",
        runId: "run-visible",
        spanId: "span-visible",
        projectId: "project-visible",
      },
    });

    await app.mount();
    const text = tty.plainText();

    // OD StatusFooter: the `trace` segment renders the 8-char trace badge
    // (the `trace[-_:]?` prefix is stripped: DESIGN.md §4.10 TraceBadge); the
    // `run` segment carries the run id; `projectId` feeds the `branch` segment.
    // Span identity is yank-only (`y s` copy keybind, exercised in
    // apps/tui/src/widgets/widgets.test.ts), not a standalone footer segment.
    expect(text).toContain("trace:visible");
    expect(text).toContain("run: run-visible");
    expect(text).toContain("project-visible");
    app.stop();
  });

  test("runs screen renders run list data", async () => {
    const text = await renderDomain("runs", makeCaller({
      agent_runs: {
        list: async () => [{ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }],
        get: async () => ({ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }),
        create: async () => ({ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }),
        cancel: async () => ({ ok: true }),
      },
    }));
    expect(text).toContain("Run list");
    expect(text).toContain("codex");
  });

  test.each([
    ["tasks", { tasks: { list: async () => [{ id: "task-1", title: "Ship coverage", status: "open" }] } }, "Ship coverage  [open]  task-1"],
    ["sprints", { sprints: { list: async () => [{ id: "sprint-1", name: "Sprint 9.6", status: "active" }] } }, "Sprint 9.6  [active]  sprint-1"],
    ["repos", { repos: { list: async () => [{ id: "repo-1", slug: "fulcrum", status: "idle" }] } }, "fulcrum  [idle]  repo-1"],
    ["memory", { memories: { list: async () => [{ id: "mem-1", title: "Architecture note" }], promote: async () => ({ ok: true }) } }, "Architecture note  mem-1"],
    ["search", { search: { query: async () => [{ id: "search-1", title: "Search result" }] } }, "Search result  search-1"],
  ] as const)("renders %s domain rows from the in-process caller", async (screen, overrides, expected) => {
    const text = await renderDomain(screen, makeCaller(overrides as Partial<TuiCaller>));

    expect(text).toContain(expected);
    expect(text).toContain("Status footer");
  });

  test.each([
    ["docs"],
    ["skills"],
    ["components"],
    ["doctor"],
  ] as const)("renders empty %s domain state without a caller shortcut", async (screen) => {
    const text = await renderDomain(screen, makeCaller());

    expect(text).toContain("No ");
    expect(text).toContain("records.");
  });

  test("renders caller errors in the domain detail pane", async () => {
    const text = await renderDomain("projects", makeCaller({
      projects: {
        list: async () => {
          throw new Error("projects service unavailable");
        },
      },
    }));

    expect(text).toContain("Projects");
    expect(text).toContain("projects service unavailable");
    expect(text).toContain("Fix: check the API/service status");
    expect(text).toContain("Esc returns to navigation");
  });

  test("resilience matrix covers empty, unavailable, partial, and subscription TUI states", () => {
    expect(REQUIRED_RESILIENCE_STATES.filter((state) => state.surface === "tui").map((state) => state.state)).toEqual([
      "empty-list",
      "unavailable-sidecar",
      "failed-subscription",
      "partial-data",
    ]);
  });

  test("run subscription cleanup prevents stale status updates after stop", async () => {
    const handlers: Array<(payload: { id: string; status?: string }) => void> = [];
    let unsubscribed = 0;
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: makeCaller({
        agent_runs: {
          list: async () => [{ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }],
          get: async () => ({ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }),
          create: async () => ({ id: "run-2", agent: "codex", status: "queued", taskId: "task-2", projectId: "project-1" }),
          cancel: async () => ({ ok: true }),
        },
        runsSubscriptions: {
          subscribe: (_topic: string, handler: (payload: { id: string; status?: string }) => void) => {
            handlers.push(handler);
            return {
              unsubscribe: () => {
                unsubscribed += 1;
                handlers.length = 0;
              },
            };
          },
        } as never,
      }),
    });

    await app.mount();
    await app.navigateTo("runs");
    expect(tty.plainText()).toContain("state:running");

    app.stop();
    for (const handler of handlers) handler({ id: "run-1", status: "failed" });
    await app.renderForTest();

    expect(unsubscribed).toBe(1);
    expect(tty.plainText()).not.toContain("state:failed");
  });

  test("notification inbox loads unread items and handles read, mute, tab, and return keys", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const calls: string[] = [];
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: makeCaller({
        notify: {
          unreadCount: async () => ({ count: 2 }),
          list: async (input) => {
            calls.push(`list:${input.tab ?? "none"}:${input.unread ?? "all"}`);
            return {
              items: [{
                id: "n1",
                sourceKind: "task",
                sourceId: "task-1",
                entityKind: "task",
                entityId: "task-1",
                title: "Task assigned",
                read: false,
              }],
            };
          },
          markRead: async (input) => {
            calls.push(`read:${input.id}`);
            return { ok: true };
          },
          markAllRead: async () => {
            calls.push("read-all");
            return { count: 1 };
          },
          mute: async (input) => {
            calls.push(`mute:${"sourceKind" in input ? input.sourceKind : input.subjectKind}`);
            return { ok: true };
          },
          rules: {
            list: async () => [{ id: "rule-1", name: "Assignments", enabled: true, channels: ["in-app"] }],
            create: async (input) => ({ id: "rule-2", name: input.name, enabled: input.enabled, channels: input.channels }),
            update: async (input) => ({ id: input.id, name: input.name ?? "Assignments", enabled: input.enabled ?? true, channels: ["in-app"] }),
            delete: async () => ({ ok: true }),
          },
        },
      }),
    });

    await app.mount();
    await app.navigateTo("inbox");
    expect(tty.plainText()).toContain("Task assigned");
    expect(tty.plainText()).toContain("Rules: 1/1 enabled");

    tty.inject("R");
    await tick();
    tty.inject("M");
    await tick();
    tty.inject("\t");
    await tick();
    tty.inject("A");
    await tick();
    tty.inject("q");
    await tick();

    expect(calls).toEqual(expect.arrayContaining(["read:n1", "mute:task", "list:all:all", "read-all"]));
    expect(app.screen).toBe("nav");
    app.stop();
  });

  test("activity, notification rules, and audit screens render real caller data and key paths", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const calls: string[] = [];
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: makeCaller({
        audit: {
          query: async (input) => {
            calls.push(`audit:${input.subjectKind ?? "*"}`);
            return {
              items: [{
                id: "event-1",
                subjectKind: input.subjectKind ?? "task",
                verb: "created",
                actor: "agent",
                subjectId: "task-1",
                createdAt: "2026-05-12T00:00:00.000Z",
              }],
              total: 1,
              limit: 50,
              offset: 0,
            };
          },
          export: async () => ({ rows: [] }),
        },
        notify: {
          unreadCount: async () => ({ count: 0 }),
          list: async () => [],
          markRead: async () => ({ ok: true }),
          mute: async () => ({ ok: true }),
          rules: {
            list: async () => [{ id: "rule-1", name: "Builds", enabled: false, channels: ["email"] }],
            create: async () => ({ id: "rule-2", name: "New", enabled: true, channels: ["in-app"] }),
            update: async (input) => ({ id: input.id, name: "Builds", enabled: input.enabled ?? true, channels: ["email"] }),
            delete: async (input) => {
              calls.push(`delete-rule:${input.id}`);
              return { ok: true };
            },
          },
          quietHours: {
            get: async () => ({ tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] }),
            set: async (input) => input,
          },
        },
      }),
    });

    await app.mount();
    await app.navigateTo("activity");
    expect(tty.plainText()).toContain("Activity feed");
    expect(tty.plainText()).toContain("task created agent task-1");
    tty.inject(" ");
    await tick();
    expect(calls).toContain("audit:task");

    await app.navigateTo("notification-rules");
    expect(tty.plainText()).toContain("Settings > Notifications");
    expect(tty.plainText()).toContain("Builds");
    tty.inject(" ");
    await tick();
    expect(tty.plainText()).toContain("[on]");
    tty.inject("D");
    await tick();
    expect(calls).toContain("delete-rule:rule-1");

    await app.navigateTo("audit");
    expect(tty.plainText()).toContain("Audit log");
    expect(tty.plainText()).toContain("task  created  agent  task-1");
    tty.inject("E");
    await tick();
    expect(tty.plainText()).toContain("Export audit log");

    app.stop();
  });
});

async function renderDomain(
  screen: "projects" | "tasks" | "sprints" | "docs" | "memory" | "runs" | "repos" | "search" | "skills" | "components" | "doctor",
  caller: TuiCaller,
): Promise<string> {
  const tty = new FakeTTY({ columns: 100, rows: 30 });
  const app = new TuiApp({ output: tty, input: tty, caller });
  await app.mount();
  tty.clear();
  await app.navigateTo(screen);
  const text = tty.plainText();
  app.stop();
  return text;
}

function makeCaller(overrides: Partial<TuiCaller> = {}): TuiCaller {
  return {
    auth: { whoami: async () => ({ userId: "u1", orgId: "org1", email: "e2e@example.com", role: "admin" }) },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
    ...overrides,
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
