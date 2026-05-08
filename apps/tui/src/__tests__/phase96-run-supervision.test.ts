import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { RunDetailScreen } from "../screens/runs.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("phase 09.6 TUI run supervision", () => {
  test("run detail renders observability panes for context, artifacts, audit, memory, and recovery", async () => {
    const screen = new RunDetailScreen({
      runId: "run-1",
      caller: {
        agent_runs: {
          get: async () => ({
            id: "run-1",
            agent: "codex",
            status: "running",
            taskTitle: "Ship agent workflow",
            projectName: "Fulcrum",
            logLines: ["boot"],
            observability: {
              context: { sourceRefs: [{ kind: "task", id: "task-1", reason: "selected-task", scope: "project" }] },
              artifacts: [{ filename: "summary.md", lifecycleState: "accepted" }],
              memoryCandidates: [{ key: "decision.agent.workflow" }],
              followUpTasks: [{ title: "Review artifact" }],
              audit: [{ verb: "dispatched" }],
              recovery: { retryable: true, retryCount: 1, lastErrorKind: "stall_timeout" },
            },
          }),
          cancel: async () => ({ ok: true }),
        },
      },
    });

    await screen.load();
    const body = renderPlain((renderer) => screen.render(renderer));

    expect(body).toContain("Context");
    expect(body).toContain("task-1");
    expect(body).toContain("Artifacts");
    expect(body).toContain("summary.md");
    expect(body).toContain("Memory");
    expect(body).toContain("decision.agent.workflow");
    expect(body).toContain("Follow-ups");
    expect(body).toContain("Review artifact");
    expect(body).toContain("Audit");
    expect(body).toContain("dispatched");
    expect(body).toContain("Recovery");
    expect(body).toContain("stall_timeout");
  });
});
