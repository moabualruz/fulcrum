import { describe, expect, test } from "bun:test";

import { run, type CaptureCaller } from "./capture.ts";

function fakeCaller(): CaptureCaller & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    capture: {
      submitReview: async (input) => {
        calls.push(["submitReview", input]);
        return {
          captureId: input.captureId,
          status: "review",
          action: "review",
          traceId: input.traceId ?? "trace-review",
          message: "Review note saved",
        };
      },
      setStatus: async (input) => {
        calls.push(["setStatus", input]);
        return {
          captureId: input.captureId,
          status: input.status,
          action: "status",
          traceId: input.traceId ?? "trace-status",
          message: `Status set to ${input.status}`,
        };
      },
      runQuickAction: async (input) => {
        calls.push(["runQuickAction", input]);
        return {
          captureId: input.captureId,
          status: input.action === "approve" ? "approved" : "review",
          action: input.action,
          traceId: input.traceId ?? "trace-action",
          message: `Quick action ${input.action} queued`,
        };
      },
    },
  };
}

describe("fulcrum capture command", () => {
  test("submits capture review notes as traceable JSON", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];

    await run(["review", "cap-1", "--note", "ready for approval", "--trace", "trace-1", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.calls).toEqual([
      ["submitReview", { captureId: "cap-1", note: "ready for approval", traceId: "trace-1" }],
    ]);
    expect(JSON.parse(lines[0] as string)).toEqual({
      captureId: "cap-1",
      status: "review",
      action: "review",
      traceId: "trace-1",
      message: "Review note saved",
    });
  });

  test("sets capture status through the caller", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];

    await run(["status", "cap-2", "--status", "approved", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.calls).toEqual([
      ["setStatus", { captureId: "cap-2", status: "approved", traceId: undefined }],
    ]);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      captureId: "cap-2",
      status: "approved",
      action: "status",
    });
  });

  test("runs assign, block, approve, and escalate quick actions", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];
    const opts = {
      caller,
      print: (line: string) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    };

    await run(["action", "cap-3", "--action", "assign", "--assignee", "user-1", "--json"], opts);
    await run(["action", "cap-3", "--action", "block", "--reason", "missing source", "--json"], opts);
    await run(["action", "cap-3", "--action", "approve", "--json"], opts);
    await run(["quick-action", "cap-3", "--action", "escalate", "--trace", "trace-escalate", "--json"], opts);

    expect(caller.calls).toEqual([
      ["runQuickAction", { captureId: "cap-3", action: "assign", assigneeId: "user-1", reason: undefined, traceId: undefined }],
      ["runQuickAction", { captureId: "cap-3", action: "block", assigneeId: undefined, reason: "missing source", traceId: undefined }],
      ["runQuickAction", { captureId: "cap-3", action: "approve", assigneeId: undefined, reason: undefined, traceId: undefined }],
      ["runQuickAction", { captureId: "cap-3", action: "escalate", assigneeId: undefined, reason: undefined, traceId: "trace-escalate" }],
    ]);
    expect(lines.map((line) => JSON.parse(line).action)).toEqual(["assign", "block", "approve", "escalate"]);
  });

  test("posts to the configured capture API without an injected caller", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const lines: string[] = [];
    const fetchFn = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url: String(url), body });
      return Response.json({
        captureId: body.captureId,
        status: "review",
        action: "review",
        traceId: body.traceId,
        message: "Review note saved",
      });
    }) as unknown as typeof fetch;

    await run(["review", "cap-api", "--note", "api note", "--trace", "trace-api", "--json"], {
      env: { FULCRUM_SERVER_URL: "http://127.0.0.1:3210" },
      fetch: fetchFn,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/captures/cap-api/reviews",
        body: { captureId: "cap-api", note: "api note", traceId: "trace-api" },
      },
    ]);
    expect(JSON.parse(lines[0] as string).traceId).toBe("trace-api");
  });

  test("requires a configured capture API without injected caller", async () => {
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["status", "cap-4", "--status", "review", "--json"], {
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
      print: () => {},
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Capture API caller is not configured");
  });
});
