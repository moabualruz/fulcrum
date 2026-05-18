import { describe, expect, test } from "bun:test";

import {
  createManualSimulationWorkspace,
  readManualSimulationEvidence,
  runTuiSimulation,
  writeManualSimulationEvidence,
} from "@platform-core/application/manual-simulation/harness.ts";
import { TuiApp, type TuiCaller } from "../index.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("TUI E2E navigation flow", () => {
  test("opens task list from nav and returns without direct DB access", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });
    await app.mount();

    tty.inject("j");
    tty.inject("\r");
    await tick();
    expect(tty.plainText()).toContain("Tasks");
    expect(tty.plainText()).toContain("E2E task");

    tty.clear();
    tty.inject("\x1b");
    await tick();
    expect(tty.plainText()).toContain("Domain nav");
    app.stop();
  });

  test("command palette toggles from nav", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });
    await app.mount();

    tty.clear();
    tty.inject("/");
    await tick();
    expect(tty.plainText()).toContain("Command palette");
    expect(tty.plainText()).toContain("Create task");
    app.stop();
  });

  test("manual simulation harness scripts FakeTTY navigation and writes snapshots", async () => {
    const workspace = await createManualSimulationWorkspace("tui-navigation");
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });

    try {
      const result = await runTuiSimulation({
        workspace,
        label: "navigation-and-palette",
        app,
        terminal: tty,
        keys: ["j", "\r", "\x1b", "/"],
      });
      const evidencePath = await writeManualSimulationEvidence({ workspace, tui: [result] });
      const evidence = await readManualSimulationEvidence(evidencePath);

      expect(result.evidencePath).toContain(workspace.snapshotsDir);
      expect(result.snapshots.map((snapshot) => snapshot.key)).toEqual(["mount", "j", "Enter", "Escape", "/"]);
      expect(result.snapshots.some((snapshot) => snapshot.text.includes("E2E task"))).toBe(true);
      expect(result.snapshots.at(-1)?.text).toContain("Command palette");
      expect(evidence).toMatchObject({
        schema: "fulcrum.manual-simulation.v1",
        id: "tui-navigation",
        tempHome: workspace.homeDir,
      });
      expect(evidence.artifacts).toContain(result.evidencePath);
    } finally {
      app.stop();
      await workspace.cleanup();
    }
  });
});

function makeCaller(): TuiCaller {
  return {
    auth: { whoami: async () => ({ userId: "u1", orgId: "org1", email: "e2e@example.com", role: "admin" }) },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    tasks: { list: async () => [{ id: "task-1", orgId: "org1", title: "E2E task", status: "todo" }] },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
