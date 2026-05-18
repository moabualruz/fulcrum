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
        message: `Generated tRPC subscription for ${procedurePath} requires FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.`,
      },
    });
    process.exitCode = 0;
    restoreEnv();
  });

  test("runs watch command consumes public event stream schema as JSON lines", async () => {
    process.env.FULCRUM_SERVER_URL = "http://fulcrum.test";
    process.env.FULCRUM_ORG_ID = "org-1";
    process.env.FULCRUM_USER_ID = "user-1";
    const lines: string[] = [];
    const originalLog = console.log;
    const originalFetch = globalThis.fetch;
    console.log = (value?: unknown) => {
      lines.push(String(value));
    };
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      expect(String(input)).toContain("/api/v1/events/runs");
      expect(String(input)).toContain("runId=run-1");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            `id: evt-1\nevent: agent_run.run-1\ndata: ${JSON.stringify({
              id: "evt-1",
              topic: "agent_run.run-1",
              type: "agent_run.run-1",
              traceId: "trace-1",
              timestamp: "2026-05-18T00:00:00.000Z",
              payload: { runId: "run-1", status: "running" },
            })}\n\n`,
          ));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;

    try {
      await createRunsSubscriptionsCommand().parseAsync(["on-run-update", "--run-id", "run-1", "--watch", "--json"], { from: "user" });
    } finally {
      console.log = originalLog;
      globalThis.fetch = originalFetch;
      restoreEnv();
    }

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      id: "evt-1",
      type: "agent_run.run-1",
      traceId: "trace-1",
      payload: { runId: "run-1", status: "running" },
    });
  });
});
