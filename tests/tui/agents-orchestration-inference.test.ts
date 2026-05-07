import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { AgentsScreen } from "@fulcrum/tui/screens/agents.ts";
import { InferenceDashboardScreen } from "@fulcrum/tui/screens/inference.ts";
import { OrchestrationScreen } from "@fulcrum/tui/screens/orchestration.ts";
import { SubscriptionBridge } from "@fulcrum/tui/subscriptions.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("AgentsScreen", () => {
  test("lists registered agents, opens detail with capabilities, and dispatches selected agent", async () => {
    const created: unknown[] = [];
    const screen = new AgentsScreen({
      caller: {
        agents: {
          list: async () => [
            { id: "claude-code", label: "Claude Code", capabilities: ["review", "edit"] },
            { id: "codex", label: "Codex CLI", capabilities: ["code", "test"] },
            { id: "pi", label: "Pi CLI", capabilities: ["plan"] },
            { id: "opencode", label: "OpenCode", capabilities: ["code"] },
          ],
        },
        agent_runs: {
          create: async (input) => {
            created.push(input);
            return { id: "run-1", agent: input.agent, status: "pending" };
          },
        },
      },
    });

    await screen.load();
    const listing = renderPlain((renderer) => screen.render(renderer));
    for (const agent of ["claude-code", "codex", "pi", "opencode"]) expect(listing).toContain(agent);

    await screen.handleKey("\r");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Capabilities");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("review");

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Dispatch run");
    await screen.submitDispatch({ projectId: "project-1", taskId: "task-1" });

    expect(created).toEqual([{ projectId: "project-1", taskId: "task-1", agent: "claude-code" }]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("run-1");
  });
});

describe("OrchestrationScreen", () => {
  test("renders orchestrator status and updates claim state from subscription", async () => {
    const bus = new EventEmitter();
    const screen = new OrchestrationScreen({
      caller: {
        orchestration: {
          status: async () => ({ status: "running", leaderId: "orch-1" }),
          list: async () => [
            { id: "run-1", agent: "codex", claimState: "pending", taskTitle: "Ship TUI" },
            { id: "run-2", agent: "claude-code", claimState: "claimed", taskTitle: "Review plan" },
          ],
        },
      },
      subscriptions: new SubscriptionBridge(bus),
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Orchestrator: running");
    expect(initial).toContain("[pending]");
    expect(initial).toContain("[claimed]");

    bus.emit("orchestration.onStateChange", { id: "run-1", claimState: "running" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("[running]");

    bus.emit("orchestration.onStateChange", { id: "run-1", claimState: "completed" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("[completed]");

    screen.dispose();
    bus.emit("orchestration.onStateChange", { id: "run-1", claimState: "pending" });
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("[pending] codex");
  });
});

describe("InferenceDashboardScreen", () => {
  test("renders sidecar and models, toggles start and stop, and applies live status", async () => {
    const bus = new EventEmitter();
    const calls: string[] = [];
    const screen = new InferenceDashboardScreen({
      caller: {
        inference: {
          status: async () => ({ status: "stopped", pid: null }),
          start: async () => {
            calls.push("start");
            return { status: "running", pid: 42 };
          },
          stop: async () => {
            calls.push("stop");
            return { status: "stopped", pid: null };
          },
          models: {
            list: async () => [
              { id: "nomic-embed", kind: "embed", status: "ready", sizeBytes: 1024, default: true },
              { id: "qwen2.5", kind: "generate", status: "missing", sizeBytes: 2048 },
            ],
          },
        },
      },
      subscriptions: new SubscriptionBridge(bus),
    });

    await screen.load();
    const initial = renderPlain((renderer) => screen.render(renderer));
    expect(initial).toContain("Sidecar: [stopped]");
    expect(initial).toContain("nomic-embed");
    expect(initial).toContain("[default]");

    await screen.handleKey("s");
    expect(calls).toEqual(["start"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Sidecar: [running]");

    bus.emit("inference.onSidecarStatus", { status: "error", message: "socket unavailable" });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("socket unavailable");

    bus.emit("inference.onSidecarStatus", { status: "running", pid: 42 });
    await screen.handleKey("s");
    expect(calls).toEqual(["start", "stop"]);
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Sidecar: [stopped]");

    screen.dispose();
  });
});
