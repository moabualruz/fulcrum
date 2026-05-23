import { describe, expect, test } from "bun:test";

import { createNotifySubscriptionsCommand } from "../../apps/cli/src/generated/notifySubscriptions.ts";
import { createOrchestrationSubscriptionsCommand } from "../../apps/cli/src/generated/orchestrationSubscriptions.ts";
import { createRunsSubscriptionsCommand } from "../../apps/cli/src/generated/runsSubscriptions.ts";

describe("generated subscription watch commands", () => {
  const originalEnv = {
    FULCRUM_SERVER_URL: process.env.FULCRUM_SERVER_URL,
    FULCRUM_ORG_ID: process.env.FULCRUM_ORG_ID,
    FULCRUM_USER_ID: process.env.FULCRUM_USER_ID,
  };

  function restoreEnv(): void {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

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
    delete process.env.FULCRUM_SERVER_URL;
    delete process.env.FULCRUM_ORG_ID;
    delete process.env.FULCRUM_USER_ID;
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
      process.exitCode = originalExitCode ?? 0;
    }

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: `Generated tRPC subscription for ${procedurePath} requires an explicit surface adapter.`,
      },
    });
    process.exitCode = 0;
    restoreEnv();
  });

  test("runs watch command without a wired adapter emits the same bounded JSON error as other subscriptions", async () => {
    process.env.FULCRUM_SERVER_URL = "http://fulcrum.test";
    process.env.FULCRUM_ORG_ID = "org-1";
    process.env.FULCRUM_USER_ID = "user-1";
    const lines: string[] = [];
    const originalLog = console.log;
    const originalExitCode = process.exitCode;
    console.log = (value?: unknown) => {
      lines.push(String(value));
    };
    process.exitCode = undefined;
    try {
      await createRunsSubscriptionsCommand().parseAsync(["on-run-update", "--run-id", "run-1", "--watch", "--json"], { from: "user" });
      expect(process.exitCode === 1).toBe(true);
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode ?? 0;
      restoreEnv();
    }

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Generated tRPC subscription for runsSubscriptions.onRunUpdate requires an explicit surface adapter.",
      },
    });
  });
});
