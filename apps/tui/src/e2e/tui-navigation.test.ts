import { describe, expect, test } from "bun:test";

import {
  createManualSimulationWorkspace,
  readManualSimulationEvidence,
  runTuiSimulation,
  writeManualSimulationEvidence,
} from "@platform-core/application/manual-simulation/harness.ts";
import { listTuiNavigationEntries, TuiApp, type TuiCaller } from "../index.ts";
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

  test("navigates every launcher item with visible selection and changing detail pane", async () => {
    const entries = listTuiNavigationEntries();

    for (let index = 0; index < entries.length; index++) {
      const tty = new FakeTTY({ columns: 120, rows: 40 });
      const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });
      await app.mount();

      for (let step = 0; step < index; step++) tty.inject("j");
      await tick();
      expect(tty.plainText()).toContain(`Selected: ${entries[index]!.label}`);

      tty.inject("\r");
      await tick();
      expect(tty.plainText()).toContain(entries[index]!.label.split("/")[0]!);

      tty.inject("\x1b");
      await tick();
      expect(tty.plainText()).toContain("Domain nav");
      app.stop();
    }
  });

  test("runs command palette actions from the keyboard", async () => {
    const expectations = [
      "Create task",
      "New Document",
      "Search",
      "Run list",
      "Doctor/Settings",
      "ran Toggle dark mode",
    ];

    for (let index = 0; index < expectations.length; index++) {
      const tty = new FakeTTY({ columns: 120, rows: 40 });
      const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });
      await app.mount();
      tty.inject("/");
      for (let step = 0; step < index; step++) tty.inject("j");
      tty.inject("\r");
      await tick();

      expect(tty.plainText()).toContain(expectations[index]!);
      app.stop();
    }
  });

  test("build board names exact disconnected API recovery", async () => {
    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const caller = makeCaller();
    caller.tasks = { list: async () => [{ id: "task-1", orgId: "org1", title: "E2E task", status: "todo" }] };
    const app = new TuiApp({ output: tty, input: tty, caller });
    await app.mount();

    await app.navigateTo("build-board");

    expect(tty.plainText()).toContain("Build Board API disconnected");
    expect(tty.plainText()).toContain("missing tasks.list, tasks.update, or tasks.create");
    expect(tty.plainText()).toContain("Recovery: run fulcrum doctor, export FULCRUM_SERVER_URL");
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
    tasks: {
      list: async () => [{ id: "task-1", orgId: "org1", title: "E2E task", status: "todo" }],
      update: async (input) => ({ id: input.id, orgId: "org1", title: "E2E task", status: input.status }),
      create: async (input) => ({ id: "task-new", orgId: "org1", title: input.title, status: input.status }),
    },
    agent_runs: {
      list: async () => [{ id: "run-1", agent: "codex", status: "running", taskTitle: "E2E task", projectName: "Fulcrum", logLines: ["boot"] }],
      get: async () => ({ id: "run-1", agent: "codex", status: "running", taskTitle: "E2E task", projectName: "Fulcrum", logLines: ["boot"] }),
      create: async (input) => ({ id: "run-new", agent: input.agent, status: "queued" }),
      cancel: async () => ({ ok: true }),
    },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
