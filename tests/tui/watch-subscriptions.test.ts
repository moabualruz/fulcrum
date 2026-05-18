import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import { NotificationsScreen } from "@fulcrum/tui/screens/notifications.ts";
import { OrchestrationScreen } from "@fulcrum/tui/screens/orchestration.ts";
import { RunDetailScreen } from "@fulcrum/tui/screens/runs.ts";
import { SubscriptionBridge } from "@fulcrum/tui/subscriptions.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 120, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("TUI live subscription screens", () => {
  test("inventory covers run, orchestration, and notification topics with cleanup on exit", async () => {
    const bus = new EventEmitter();
    const subscriptions = new SubscriptionBridge(bus);

    const run = new RunDetailScreen({
      runId: "run-1",
      caller: {
        agent_runs: {
          get: async () => ({ id: "run-1", agent: "codex", status: "running", logLines: [] }),
          cancel: async () => ({ ok: true }),
        },
      },
      subscriptions,
    });
    await run.load();
    expect(bus.listenerCount("runs.onRunUpdate")).toBe(1);
    run.dispose();
    expect(bus.listenerCount("runs.onRunUpdate")).toBe(0);

    const orchestration = new OrchestrationScreen({
      caller: {
        orchestration: {
          status: async () => ({ status: "running", leaderId: "orch-1" }),
          list: async () => [{ id: "run-1", agent: "codex", claimState: "pending", taskTitle: "Ship TUI" }],
        },
      },
      subscriptions,
    });
    await orchestration.load();
    expect(bus.listenerCount("orchestration.onStateChange")).toBe(1);
    orchestration.dispose();
    expect(bus.listenerCount("orchestration.onStateChange")).toBe(0);

    const notifications = new NotificationsScreen({
      caller: {
        notify: {
          list: async () => [{ id: "n-1", sourceId: "task-1", sourceKind: "task", title: "Mentioned", read: false }],
          markRead: async () => ({ ok: true }),
          mute: async () => ({ ok: true }),
        },
      },
      subscriptions,
      initialBellCount: 1,
    });
    await notifications.load();
    expect(bus.listenerCount("notifications.unreadCount")).toBe(1);
    notifications.dispose();
    expect(bus.listenerCount("notifications.unreadCount")).toBe(0);
  });

  test("resubscribe does not duplicate run events or leak inactive screens", async () => {
    const bus = new EventEmitter();
    const subscriptions = new SubscriptionBridge(bus);
    const makeRun = () => new RunDetailScreen({
      runId: "run-1",
      caller: {
        agent_runs: {
          get: async () => ({ id: "run-1", agent: "codex", status: "running", logLines: [] }),
          cancel: async () => ({ ok: true }),
        },
      },
      subscriptions,
    });

    const first = makeRun();
    await first.load();
    first.dispose();

    const second = makeRun();
    await second.load();
    await second.load();
    expect(bus.listenerCount("runs.onRunUpdate")).toBe(1);

    bus.emit("runs.onRunUpdate", { id: "run-1", status: "running", logLine: "streamed once" });
    const text = renderPlain((renderer) => second.render(renderer));
    expect(text.match(/streamed once/g)).toHaveLength(1);
    expect(renderPlain((renderer) => first.render(renderer))).not.toContain("streamed once");

    second.dispose();
    expect(bus.listenerCount("runs.onRunUpdate")).toBe(0);
  });
});
