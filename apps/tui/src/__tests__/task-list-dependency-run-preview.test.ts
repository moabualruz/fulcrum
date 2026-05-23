import { describe, expect, test } from "bun:test";

import { TuiApp, type TuiCaller } from "../index.ts";
import { TaskListScreen } from "../screens/task-list.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { Renderer } from "../renderer.ts";
import type { DependencyRunPreview } from "@execution-orchestration/domain/dependency-run-preview.ts";
import type { DispatchDependencyRunForTasksOutput } from "@execution-orchestration/application/dependency-run-actions.ts";
import type { DependencyRunLiveFeedbackOutput } from "@execution-orchestration/application/dependency-run-live-feedback.ts";

const PREVIEW: DependencyRunPreview = {
  mode: "task" as const,
  traceId: "trace-tui-preview",
  targetTaskIds: ["task-release"],
  orderedTaskIds: ["task-db", "task-release"],
  tasks: [
    {
      id: "task-db",
      title: "Provision database",
      column: "done" as const,
      selected: false,
      dependencyDepth: 1,
      dependencyIds: [],
      blockers: [],
    },
    {
      id: "task-release",
      title: "Run release board",
      column: "todo" as const,
      selected: true,
      dependencyDepth: 0,
      dependencyIds: ["task-db"],
      blockers: [],
    },
  ],
  omittedTaskIds: [],
  missingTaskIds: [],
  warnings: ["Target task-release requires 1 prerequisite task(s) before it runs."],
  requiresDisclosure: true,
  blocked: false,
};
const DISPATCH: DispatchDependencyRunForTasksOutput = {
  runGroupId: "trace-tui-dispatch",
  preview: PREVIEW,
  scheduledRuns: [
    {
      id: "run-release",
      taskId: "task-release",
      agent: "codex",
      status: "queued",
      queuePosition: 1,
      dependencyIds: ["task-db"],
    },
  ],
  skippedTasks: [
    {
      id: "task-db",
      title: "Provision database",
      column: "done",
      reason: "already satisfied",
    },
  ],
  warnings: [],
};
const FEEDBACK: DependencyRunLiveFeedbackOutput = {
  projectId: "project-tui",
  traceId: "trace-tui-dispatch",
  runGroupId: "trace-tui-dispatch",
  fetchedAt: "2026-05-13T00:00:00.000Z",
  executorStatus: {
    queuedTaskCount: 1,
    runningTaskCount: 0,
    succeededTaskCount: 0,
    failedTaskCount: 0,
    blockedTaskCount: 0,
    inReviewCount: 0,
    active: true,
    lastActivityAt: "2026-05-13T00:00:00.000Z",
  },
  runs: [
    {
      id: "run-release",
      taskId: "task-release",
      traceId: "trace-tui-dispatch",
      status: "queued",
      queuePosition: 1,
      dependencyIds: ["task-db"],
      latestEventSummary: null,
      lastActivityAt: "2026-05-13T00:00:00.000Z",
    },
  ],
  events: [
    {
      id: "event-release",
      runId: "run-release",
      taskId: "task-release",
      traceId: "trace-tui-dispatch",
      sequence: 1,
      domain: "executor",
      mutationType: "dependency_tree_dispatched",
      targetKind: "task",
      targetId: "task-release",
      agentId: "codex",
      taskLineageId: "trace-tui-dispatch",
      summary: "Dependency tree dispatched",
      output: null,
      payload: {},
      createdAt: "2026-05-13T00:00:00.000Z",
    },
  ],
  latestEvent: null,
};

describe("TUI dependency run preview", () => {
  test("task list screen discloses selected task dependencies through the caller", async () => {
    const calls: unknown[] = [];
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => [
            { id: "task-db", title: "Provision database", status: "completed" },
            { id: "task-release", title: "Run release board", status: "pending" },
          ],
          bulk: async () => ({ ok: true }),
          previewDependencyRun: async (input) => {
            calls.push(input);
            return PREVIEW;
          },
        },
      },
    });
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);

    await screen.load();
    await screen.handleKey("j");
    await screen.handleKey(" ");
    await screen.handleKey("R");
    screen.render(renderer);

    expect(calls).toEqual([{
      mode: "task",
      targetTaskIds: ["task-release"],
    }]);
    const output = tty.plainText();
    expect(output).toContain("Dependency run preview");
    expect(output).toContain("trace-tui-preview");
    expect(output).toContain("Provision database");
    expect(output).toContain("Run release board");
    expect(output).toContain("Target task-release requires 1 prerequisite task(s) before it runs.");
  });

  test("root task domain exposes run preview with selected task trace ids", async () => {
    const calls: unknown[] = [];
    const caller = makeCaller({
      tasks: {
        list: async () => [
          { id: "task-release", orgId: "org-1", title: "Run release board", status: "pending" },
        ],
        previewDependencyRun: async (input) => {
          calls.push(input);
          return PREVIEW;
        },
      },
    });
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({ output: tty, input: tty, caller });

    await app.mount();
    await app.navigateTo("tasks");
    tty.inject(" ");
    await tick();
    tty.inject("R");
    await tick();

    expect(calls).toEqual([{
      mode: "task",
      targetTaskIds: ["task-release"],
    }]);
    expect(tty.plainText()).toContain("Dependency run preview");
    expect(tty.plainText()).toContain("Run release board");
    app.stop();
  });

  test("task list screen dispatches selected dependency runs through the caller", async () => {
    const calls: unknown[] = [];
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => [
            { id: "task-db", title: "Provision database", status: "completed" },
            { id: "task-release", title: "Run release board", status: "pending" },
          ],
          dispatchDependencyRun: async (input) => {
            calls.push(input);
            return DISPATCH;
          },
        },
      },
    });
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);

    await screen.load();
    await screen.handleKey("j");
    await screen.handleKey(" ");
    await screen.handleKey("D");
    screen.render(renderer);

    expect(calls).toEqual([{
      mode: "task",
      targetTaskIds: ["task-release"],
      agent: "codex",
    }]);
    const output = tty.plainText();
    expect(output).toContain("Dependency run dispatched");
    expect(output).toContain("run-release");
    expect(output).toContain("Provision database");
  });

  test("task list screen loads live dependency-run feedback through the caller", async () => {
    const calls: unknown[] = [];
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => [
            { id: "task-release", title: "Run release board", status: "pending" },
          ],
          dispatchDependencyRun: async () => DISPATCH,
          dependencyRunLiveFeedback: async (input) => {
            calls.push(input);
            return FEEDBACK;
          },
        },
      },
    });
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);

    await screen.load();
    await screen.handleKey(" ");
    await screen.handleKey("D");
    await screen.handleKey("F");
    screen.render(renderer);

    expect(calls).toEqual([{ traceId: "trace-tui-dispatch", runGroupId: "trace-tui-dispatch" }]);
    const output = tty.plainText();
    expect(output).toContain("Dependency run feedback");
    expect(output).toContain("Trace: trace-tui-dispatch");
    expect(output).toContain("Queued: 1");
    expect(output).toContain("Group: trace-tui-dispatch");
    expect(output).toContain("Dependency tree dispatched");
  });

  test("task list screen refreshes dependency-run feedback from subscription events", async () => {
    const streamCalls: unknown[] = [];
    const streamState: { observer?: { next(value: DependencyRunLiveFeedbackOutput): void } } = {};
    let unsubscribed = false;
    const screen = new TaskListScreen({
      caller: {
        tasks: {
          list: async () => [
            { id: "task-release", title: "Run release board", status: "pending" },
          ],
          dispatchDependencyRun: async () => DISPATCH,
          dependencyRunLiveFeedback: async () => FEEDBACK,
          dependencyRunLiveFeedbackStream: async (input) => {
            streamCalls.push(input);
            return {
              subscribe(opts) {
                streamState.observer = opts;
                return {
                  unsubscribe() {
                    unsubscribed = true;
                  },
                };
              },
            };
          },
        },
      },
    });
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);

    await screen.load();
    await screen.handleKey(" ");
    await screen.handleKey("D");
    await screen.handleKey("F");
    expect(streamCalls).toEqual([{
      projectId: "project-tui",
      traceId: "trace-tui-dispatch",
      runGroupId: "trace-tui-dispatch",
    }]);
    const observer = streamState.observer;
    if (!observer) throw new Error("dependency-run feedback stream did not subscribe");
    observer.next({
      ...FEEDBACK,
      executorStatus: {
        ...FEEDBACK.executorStatus,
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 1,
        active: false,
      },
      runs: [
        {
          ...FEEDBACK.runs[0]!,
          status: "succeeded",
          latestEventSummary: "Agent run completed",
        },
      ],
      events: [
        ...FEEDBACK.events,
        {
          id: "event-complete",
          runId: "run-release",
          taskId: "task-release",
          traceId: "trace-tui-dispatch",
          sequence: 2,
          domain: "executor",
          mutationType: "agent_run_completed",
          targetKind: "task",
          targetId: "task-release",
          agentId: "codex",
          taskLineageId: "trace-tui-dispatch",
          summary: "Agent run completed",
          output: "worker complete",
          payload: {},
          createdAt: "2026-05-13T00:00:01.000Z",
        },
      ],
      latestEvent: {
        id: "event-complete",
        runId: "run-release",
        taskId: "task-release",
        traceId: "trace-tui-dispatch",
        sequence: 2,
        domain: "executor",
        mutationType: "agent_run_completed",
        targetKind: "task",
        targetId: "task-release",
        agentId: "codex",
        taskLineageId: "trace-tui-dispatch",
        summary: "Agent run completed",
        output: "worker complete",
        payload: {},
        createdAt: "2026-05-13T00:00:01.000Z",
      },
    } satisfies DependencyRunLiveFeedbackOutput);
    screen.render(renderer);
    screen.dispose();

    const output = tty.plainText();
    expect(output).toContain("Succeeded: 1");
    expect(output).toContain("Agent run completed");
    expect(output).toContain("worker complete");
    expect(unsubscribed).toBe(true);
  });
});

function makeCaller(overrides: Partial<TuiCaller> = {}): TuiCaller {
  return {
    auth: { whoami: async () => ({ userId: "u1", orgId: "org1", email: "operator@example.com", role: "admin" }) },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
    ...overrides,
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
