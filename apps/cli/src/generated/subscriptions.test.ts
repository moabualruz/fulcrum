import { afterEach, describe, expect, test } from "bun:test";

import { createNotifySubscriptionsCommand } from "./notifySubscriptions.ts";
import { createOrchestrationSubscriptionsCommand } from "./orchestrationSubscriptions.ts";
import { createRunsSubscriptionsCommand } from "./runsSubscriptions.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];
const originalOrgId = process.env["FULCRUM_ORG_ID"];
const originalUserId = process.env["FULCRUM_USER_ID"];
const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  restoreEnv("FULCRUM_SERVER_URL", originalServerUrl);
  restoreEnv("FULCRUM_PUBLIC_API_URL", originalPublicApiUrl);
  restoreEnv("FULCRUM_ORG_ID", originalOrgId);
  restoreEnv("FULCRUM_USER_ID", originalUserId);
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  process.exitCode = undefined;
});

describe("generated subscription commands", () => {
  test("routes subscription watch commands through the Nest event stream API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    process.env["FULCRUM_ORG_ID"] = "org-1";
    process.env["FULCRUM_USER_ID"] = "user-owner";
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return sseResponse(responseFor(new URL(String(url)).pathname));
    }) as typeof fetch;

    await createRunsSubscriptionsCommand().parseAsync(["on-run-update", "--run-id", "run-1", "--watch"], { from: "user" });
    await createOrchestrationSubscriptionsCommand().parseAsync(["on-state-change", "--watch"], { from: "user" });
    await createNotifySubscriptionsCommand().parseAsync(["on-new-notification", "--watch"], { from: "user" });

    expect(calls).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/events/runs?orgId=org-1&userId=user-owner&runId=run-1",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/events/orchestration?orgId=org-1&userId=user-owner",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:3210/api/v1/events/notifications?orgId=org-1&userId=user-owner",
      },
    ]);
    expect(output.map((line) => JSON.parse(line))).toEqual([
      { runId: "run-1", status: "running" },
      { state: "reviewing", previousState: "running" },
      { id: "notification-1", title: "Ready" },
    ]);
  });
});

function responseFor(path: string): Record<string, unknown> {
  if (path === "/api/v1/events/runs") return { runId: "run-1", status: "running" };
  if (path === "/api/v1/events/orchestration") return { state: "reviewing", previousState: "running" };
  if (path === "/api/v1/events/notifications") return { id: "notification-1", title: "Ready" };
  throw new Error(`unexpected request ${path}`);
}

function sseResponse(payload: Record<string, unknown>): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(payload)}\n\n`));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
