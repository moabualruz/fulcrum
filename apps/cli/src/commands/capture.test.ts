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
      intake: async (input) => {
        calls.push(["intake", input]);
        return { captureId: "cap-intake", kind: input.kind, traceId: input.traceId ?? "trace-intake", message: `Captured ${input.kind}` };
      },
      triageInbox: async (input) => {
        calls.push(["triageInbox", input]);
        return { captureId: input.captureId, kind: input.action, traceId: input.traceId ?? "trace-inbox", message: `Inbox ${input.action}` };
      },
      createNote: async (input) => {
        calls.push(["createNote", input]);
        return { captureId: "cap-note", kind: "note", traceId: input.traceId ?? "trace-note", message: "Note captured" };
      },
      listNotes: async (input) => {
        calls.push(["listNotes", input]);
        return [{ id: "note-1", text: "first idea", tag: input.tag }];
      },
    },
  };
}

describe("fulcrum capture command", () => {
  test("submits capture review notes as traceable JSON", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];

    await run(["review", "cap-1", "--note", "ready for approval", "--trace", "trace-1", "--json-raw"], {
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

    await run(["status", "cap-2", "--status", "approved", "--json-raw"], {
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

    await run(["action", "cap-3", "--action", "assign", "--assignee", "user-1", "--json-raw"], opts);
    await run(["action", "cap-3", "--action", "block", "--reason", "missing source", "--json-raw"], opts);
    await run(["action", "cap-3", "--action", "approve", "--json-raw"], opts);
    await run(["quick-action", "cap-3", "--action", "escalate", "--trace", "trace-escalate", "--json-raw"], opts);

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

    await run(["review", "cap-api", "--note", "api note", "--trace", "trace-api", "--json-raw"], {
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
    // Under `--json-raw` the legacy `{error:{code,message}}` shape is emitted on
    // stdout; in plain mode the recovery block goes to stderr. Capture both so
    // the assertion proves the failure surfaces regardless of output mode.
    const out: string[] = [];
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["status", "cap-4", "--status", "review", "--json-raw"], {
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
      print: (line) => out.push(line),
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(exitCode).toBe(1);
    expect([...out, ...errors].join("\n")).toContain("Capture API caller is not configured");
  });

  test("emits the canonical fulcrum.cli.v1 envelope for an intake under --json", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];

    await run(["text", "rough idea", "--trace", "8f29a4c1b3e0d5f7c2a90e6b4d138a72", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    const envelope = JSON.parse(lines[0] as string);
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.errors).toEqual([]);
    expect(envelope.result.kind).toBe("text");
    // The trace spine carries the same id the intake was tagged with.
    expect(envelope.trace_id).toBe("8f29a4c1b3e0d5f7c2a90e6b4d138a72");
  });
});
