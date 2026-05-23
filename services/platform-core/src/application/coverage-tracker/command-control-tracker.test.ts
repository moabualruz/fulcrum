import { describe, expect, test } from "bun:test";

import {
  buildCommandControlCoverageArtifact,
  mergeCoverageAnnotations,
  parseCliCommandInventory,
  parseTuiActionInventory,
} from "./command-control-tracker.ts";

describe("command/control coverage tracker", () => {
  test("generates CLI command rows with flags and output modes from source inventory", () => {
    const rows = parseCliCommandInventory("apps/cli/src/product.ts", `
      fulcrum product tasks run-feed --trace <T> [--project <P>] [--run <R>] [--task <id>] [--watch] [--json]
      const onRunUpdateCommand = command.command("on-run-update");
      onRunUpdateCommand.option("--json", "Emit JSON output");
      onRunUpdateCommand.option("--watch", "Stream subscription events as JSON lines");
      onRunUpdateCommand.option("--run-id <string>", "run-id");
    `);

    expect(rows.map((row) => row.id)).toEqual([
      "cli:on-run-update",
      "cli:product:tasks:run-feed",
    ]);
    expect(rows.find((row) => row.id === "cli:product:tasks:run-feed")).toMatchObject({
      sourcePath: "apps/cli/src/product.ts",
      flags: expect.arrayContaining(["--trace", "--project", "--run", "--task", "--watch", "--json"]),
      outputModes: ["json"],
    });
  });

  test("generates TUI key rows from screen hints", () => {
    const rows = parseTuiActionInventory("apps/tui/src/screens/runs.ts", `
      async handleKey(key: string): Promise<boolean> {
        return key === "x";
      }
      renderer.writeln(c.dim("  x cancel  q back"));
    `);

    expect(rows).toEqual([
      expect.objectContaining({ id: "tui:apps/tui/src/screens/runs.ts:q", keybindings: ["q"] }),
      expect.objectContaining({ id: "tui:apps/tui/src/screens/runs.ts:x", keybindings: ["x"] }),
    ]);
  });

  test("keeps regenerated rows unproven until manual evidence marks pass", () => {
    const artifact = buildCommandControlCoverageArtifact({
      inventory: [
        {
          id: "cli:notify:watch",
          surface: "cli",
          action: "notify watch",
          sourcePath: "apps/cli/src/commands/pillar14-generated.ts",
          flags: ["--json", "--unread"],
          outputModes: ["json"],
        },
        {
          id: "tui:notifications:R",
          surface: "tui",
          action: "mark notification read",
          sourcePath: "apps/tui/src/screens/notifications.ts",
          keybindings: ["R"],
        },
      ],
      annotations: [
        {
          id: "cli:notify:watch",
          testPath: "tests/cli/runs-notify-audit-webhooks.test.ts",
          manualSimulation: ["fulcrum notify watch --unread --json"],
          status: "pass",
        },
        {
          id: "tui:notifications:R",
          testPath: "tests/tui/search-notifications.test.ts",
          manualSimulation: ["TUI keys: / n Enter R"],
          evidencePaths: ["snapshots/notification-read.json"],
          status: "pass",
        },
      ],
    });

    expect(artifact.rows.find((row) => row.id === "cli:notify:watch")).toMatchObject({
      passes: false,
      status: "pass",
      evidencePaths: [],
    });
    expect(artifact.rows.find((row) => row.id === "tui:notifications:R")).toMatchObject({
      passes: true,
      status: "pass",
      evidencePaths: ["snapshots/notification-read.json"],
    });
  });

  test("regeneration preserves manual annotations and evidence paths by row id", () => {
    const existing = buildCommandControlCoverageArtifact({
      inventory: [{
        id: "cli:runs:watch",
        surface: "cli",
        action: "runs watch",
        sourcePath: "apps/cli/src/commands/pillar14-generated.ts",
      }],
      annotations: [{
        id: "cli:runs:watch",
        testPath: "tests/cli/agent-workflow.test.ts",
        manualSimulation: ["fulcrum runs watch run-1 --json"],
        evidencePaths: ["logs/runs-watch.json"],
        status: "pass",
      }],
    });
    const regenerated = buildCommandControlCoverageArtifact({
      inventory: [{
        id: "cli:runs:watch",
        surface: "cli",
        action: "runs watch",
        sourcePath: "apps/cli/src/commands/pillar14-generated.ts",
        flags: ["--json", "--follow"],
      }],
    });

    expect(mergeCoverageAnnotations({ regenerated, existing }).rows[0]).toMatchObject({
      flags: ["--follow", "--json"],
      testPath: "tests/cli/agent-workflow.test.ts",
      evidencePaths: ["logs/runs-watch.json"],
      passes: true,
    });
  });
});
