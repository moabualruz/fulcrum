import { describe, expect, test } from "bun:test";

import { createNotifySubscriptionsCommand } from "../../apps/cli/src/generated/notifySubscriptions.ts";
import { createOrchestrationSubscriptionsCommand } from "../../apps/cli/src/generated/orchestrationSubscriptions.ts";
import { createRunsSubscriptionsCommand } from "../../apps/cli/src/generated/runsSubscriptions.ts";

describe("generated subscription watch commands", () => {
  test.each([
    {
      command: createNotifySubscriptionsCommand,
      argv: ["on-new-notification", "--watch", "--json"],
      procedurePath: "notifySubscriptions.onNewNotification",
    },
    {
      command: createOrchestrationSubscriptionsCommand,
      argv: ["on-state-change", "--watch", "--json"],
      procedurePath: "orchestrationSubscriptions.onStateChange",
    },
    {
      command: createRunsSubscriptionsCommand,
      argv: ["on-run-update", "--run-id", "run-1", "--watch", "--json"],
      procedurePath: "runsSubscriptions.onRunUpdate",
    },
  ])("$procedurePath exposes bounded JSON watch failure until adapter wiring exists", async ({ command, argv, procedurePath }) => {
    const lines: string[] = [];
    const originalLog = console.log;
    const originalExitCode = process.exitCode;
    console.log = (value?: unknown) => {
      lines.push(String(value));
    };
    process.exitCode = undefined;
    try {
      await command().parseAsync(argv, { from: "user" });
      expect(process.exitCode === 1).toBe(true);
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
    }

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: `Generated tRPC subscription for ${procedurePath} requires an explicit surface adapter.`,
      },
    });
  });
});
