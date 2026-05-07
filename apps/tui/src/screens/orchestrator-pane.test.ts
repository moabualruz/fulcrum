import { describe, expect, test } from "bun:test";
import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import {
  OrchestratorPane,
  type OrchestratorPaneOptions,
  type SymphonyRun,
} from "./orchestrator-pane.ts";

function renderer() {
  const tty = new FakeTTY();
  return { tty, renderer: new Renderer(tty) };
}

function makeRun(overrides: Partial<SymphonyRun> = {}): SymphonyRun {
  return {
    id: "aaaa-1111",
    taskTitle: "Fix login bug",
    agent: "claude",
    symphonyState: "running",
    attemptCount: 1,
    startedAt: new Date("2026-05-01T10:00:00Z"),
    workspacePath: "/home/user/workspace/project-alpha",
    lastErrorKind: null,
    nextRetryAt: null,
    ...overrides,
  };
}

function makeCaller(
  runs: SymphonyRun[] = [],
  overrides: Partial<OrchestratorPaneOptions["caller"]["symphony"]> = {},
) {
  const calls: string[] = [];
  const caller: OrchestratorPaneOptions["caller"] = {
    symphony: {
      listRuns: async () => runs,
      retryRun: async (input) => {
        calls.push(`retry:${input.runId}`);
        return { ok: true };
      },
      cancelRun: async (input) => {
        calls.push(`cancel:${input.runId}`);
        return { ok: true };
      },
      ...overrides,
    },
  };
  return { caller, calls };
}

describe("OrchestratorPane", () => {
  test("renders correct row count from listRuns response", async () => {
    const runs = [
      makeRun({ id: "r1", taskTitle: "Task A", agent: "claude" }),
      makeRun({ id: "r2", taskTitle: "Task B", agent: "codex" }),
      makeRun({ id: "r3", taskTitle: "Task C", agent: "gemini" }),
    ];
    const { caller } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();
    const v = renderer();
    pane.render(v.renderer);
    const text = v.tty.plainText();
    expect(text).toContain("Task A");
    expect(text).toContain("Task B");
    expect(text).toContain("Task C");
    expect(text).toContain("claude");
    expect(text).toContain("codex");
    expect(text).toContain("gemini");
  });

  test("renders symphony_state badges", async () => {
    const runs = [
      makeRun({ id: "r1", symphonyState: "running" }),
      makeRun({ id: "r2", symphonyState: "retry_queued" }),
      makeRun({ id: "r3", symphonyState: "failed" }),
      makeRun({ id: "r4", symphonyState: "stalled" }),
    ];
    const { caller } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();
    const v = renderer();
    pane.render(v.renderer);
    const text = v.tty.plainText();
    expect(text).toContain("[running]");
    expect(text).toContain("[retry_queued]");
    expect(text).toContain("[failed]");
    expect(text).toContain("[stalled]");
  });

  test("renders attempt count and truncated workspace path", async () => {
    const runs = [
      makeRun({
        id: "r1",
        attemptCount: 3,
        workspacePath: "/very/long/path/to/workspace/deep/nested",
      }),
    ];
    const { caller } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();
    const v = renderer();
    pane.render(v.renderer);
    const text = v.tty.plainText();
    expect(text).toContain("3");
    // workspace path truncated
    expect(text).toContain("…");
  });

  test("'r' keypress on retry_queued row calls retryRun mutation", async () => {
    const runs = [
      makeRun({ id: "retry-target", symphonyState: "retry_queued" }),
    ];
    const { caller, calls } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();
    await pane.handleKey("r");
    expect(calls).toContain("retry:retry-target");
  });

  test("'x' keypress on running row calls cancelRun mutation", async () => {
    const runs = [makeRun({ id: "cancel-target", symphonyState: "running" })];
    const { caller, calls } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();
    await pane.handleKey("x");
    expect(calls).toContain("cancel:cancel-target");
  });

  test("state filter tabs filter runs by symphony_state", async () => {
    const runs = [
      makeRun({ id: "r1", symphonyState: "running", taskTitle: "Running Task" }),
      makeRun({ id: "r2", symphonyState: "retry_queued", taskTitle: "Queued Task" }),
      makeRun({ id: "r3", symphonyState: "failed", taskTitle: "Failed Task" }),
      makeRun({ id: "r4", symphonyState: "stalled", taskTitle: "Stalled Task" }),
    ];
    const { caller } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();

    // Default: All tab — all visible
    const v1 = renderer();
    pane.render(v1.renderer);
    const text1 = v1.tty.plainText();
    expect(text1).toContain("Running Task");
    expect(text1).toContain("Failed Task");

    // Switch to Running tab
    await pane.handleKey("2");
    const v2 = renderer();
    pane.render(v2.renderer);
    const text2 = v2.tty.plainText();
    expect(text2).toContain("Running Task");
    expect(text2).not.toContain("Failed Task");

    // Switch to Failed tab
    await pane.handleKey("5");
    const v3 = renderer();
    pane.render(v3.renderer);
    const text3 = v3.tty.plainText();
    expect(text3).toContain("Failed Task");
    expect(text3).not.toContain("Running Task");
  });

  test("j/k keys navigate cursor; detail overlay on Enter", async () => {
    const runs = [
      makeRun({ id: "r1", taskTitle: "First" }),
      makeRun({ id: "r2", taskTitle: "Second", lastErrorKind: "timeout" }),
    ];
    const { caller } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();

    // Move down to second row
    await pane.handleKey("j");
    // Open detail overlay
    await pane.handleKey("\r");
    const v = renderer();
    pane.render(v.renderer);
    const text = v.tty.plainText();
    expect(text).toContain("Second");
    expect(text).toContain("timeout");
  });

  test("Esc closes detail overlay", async () => {
    const runs = [makeRun({ id: "r1", taskTitle: "Detail Run" })];
    const { caller } = makeCaller(runs);
    const pane = new OrchestratorPane({ caller });
    await pane.load();

    await pane.handleKey("\r"); // open overlay
    await pane.handleKey("\x1b"); // Esc — close overlay
    const v = renderer();
    pane.render(v.renderer);
    const text = v.tty.plainText();
    // Should be back to table view, not overlay
    expect(text).not.toContain("last_error_kind");
  });

  test("empty runs renders 'No symphony runs' message", async () => {
    const { caller } = makeCaller([]);
    const pane = new OrchestratorPane({ caller });
    await pane.load();
    const v = renderer();
    pane.render(v.renderer);
    expect(v.tty.plainText()).toContain("No symphony runs");
  });
});
