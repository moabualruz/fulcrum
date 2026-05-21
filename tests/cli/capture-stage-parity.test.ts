/**
 * Capture-stage CLI verb parity (`prd-cli-capture-stage-parity`).
 *
 * Proves that the full `CLI-TUI-UX.md` §1.1 Capture command grammar exists as
 * `fulcrum` verbs and that every Capture verb wraps its payload in the canonical
 * `fulcrum.cli.v1` JSON envelope (`CLI-TUI-UX.md` §3) under `--json`: so the
 * CLI is an equal-weight Capture surface, followable by `trace_id` in web / TUI.
 *
 * Verbs covered:
 *  - `fulcrum capture text|url|file`  : freeform intake
 *  - `fulcrum capture inbox`          : intake-queue triage (snooze/accept/decline)
 *  - `fulcrum capture note new|list`  : short-form note intake
 *  - `fulcrum capture review|status|action`: existing review-state verbs (no rename)
 *  - `fulcrum doc list/new/view/edit/attach/history/restore/comment/link/search`
 *
 * No production mocks: both commands take an injectable caller seam: the same
 * dependency-injection point the real HTTP client plugs into.
 */

import { describe, expect, test } from "bun:test";

import {
  run as runCapture,
  type CaptureCaller,
} from "@fulcrum/cli/commands/capture.ts";
import { run as runDocs, type DocsRunOptions } from "@fulcrum/cli/commands/docs.ts";

const ENVELOPE_SCHEMA = "fulcrum.cli.v1";
const TRACE = "8f29a4c1b3e0d5f74a6b9c2d1e0f3a5b";

const CANONICAL_KEYS = [
  "args",
  "command",
  "duration_ms",
  "errors",
  "next_actions",
  "project_id",
  "result",
  "run_id",
  "schema",
  "span_id",
  "timestamp",
  "trace_id",
];

/** Assert one stdout line is the canonical twelve-key `fulcrum.cli.v1` envelope. */
function expectCanonicalEnvelope(line: string, command: string): Record<string, unknown> {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  expect(Object.keys(parsed).sort()).toEqual([...CANONICAL_KEYS].sort());
  expect(parsed["schema"]).toBe(ENVELOPE_SCHEMA);
  expect(parsed["command"]).toBe(command);
  expect(typeof parsed["trace_id"]).toBe("string");
  expect(typeof parsed["span_id"]).toBe("string");
  expect(Array.isArray(parsed["errors"])).toBe(true);
  expect(Array.isArray(parsed["next_actions"])).toBe(true);
  return parsed;
}

/** Injectable capture caller: records every call, returns trace-bearing results. */
function fakeCaptureCaller(): CaptureCaller & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    capture: {
      submitReview: async (input) => {
        calls.push("submitReview");
        return { captureId: input.captureId, status: "review", action: "review", traceId: input.traceId ?? TRACE, message: "Review note saved" };
      },
      setStatus: async (input) => {
        calls.push("setStatus");
        return { captureId: input.captureId, status: input.status, action: "status", traceId: input.traceId ?? TRACE, message: `Status set to ${input.status}` };
      },
      runQuickAction: async (input) => {
        calls.push("runQuickAction");
        return { captureId: input.captureId, status: "review", action: input.action, traceId: input.traceId ?? TRACE, message: `Quick action ${input.action} queued` };
      },
      intake: async (input) => {
        calls.push(`intake:${input.kind}`);
        return { captureId: "cap_intake", kind: input.kind, traceId: input.traceId ?? TRACE, message: `Captured ${input.kind}` };
      },
      triageInbox: async (input) => {
        calls.push(`triageInbox:${input.action}`);
        return { captureId: input.captureId, kind: input.action, traceId: input.traceId ?? TRACE, message: `Inbox ${input.action}` };
      },
      createNote: async (input) => {
        calls.push("createNote");
        return { captureId: "cap_note", kind: "note", traceId: input.traceId ?? TRACE, message: "Note captured" };
      },
      listNotes: async () => {
        calls.push("listNotes");
        return [{ id: "note-1", text: "first idea", tag: "ideas" }];
      },
    },
  };
}

/** Injectable docs caller: records every call, returns one fixed doc row. */
function fakeDocsCaller(): NonNullable<DocsRunOptions["caller"]> & { calls: string[] } {
  const calls: string[] = [];
  const doc = { id: "11111111-1111-4111-8111-111111111111", slug: "token-rotation", docType: "note", title: "Token rotation" };
  return {
    calls,
    docs: {
      list: async () => { calls.push("list"); return [doc]; },
      get: async () => { calls.push("get"); return doc; },
      create: async () => { calls.push("create"); return doc; },
      update: async () => { calls.push("update"); return doc; },
      delete: async () => { calls.push("delete"); return { deleted: true }; },
      search: async () => { calls.push("search"); return [doc]; },
      versionsList: async () => { calls.push("versionsList"); return [{ id: "v1", version: 1 }]; },
      restoreVersion: async () => { calls.push("restoreVersion"); return doc; },
      attach: async () => { calls.push("attach"); return { id: "att-1" }; },
      comment: async () => { calls.push("comment"); return { id: "cmt-1" }; },
      link: async () => { calls.push("link"); return { id: "lnk-1" }; },
      templates: { list: async () => { calls.push("templates.list"); return [doc]; } },
    },
  };
}

async function capture(argv: string[], caller: CaptureCaller): Promise<string[]> {
  const lines: string[] = [];
  await runCapture(argv, { caller, print: (l) => lines.push(l), printErr: () => {}, exit: () => {} });
  return lines;
}

async function docs(argv: string[], caller: NonNullable<DocsRunOptions["caller"]>): Promise<string[]> {
  const lines: string[] = [];
  await runDocs(argv, { caller, print: (l) => lines.push(l), printErr: () => {}, exit: () => {} });
  return lines;
}

describe("Capture-stage CLI verb parity: fulcrum capture", () => {
  test("capture text|url|file intake each dispatch and emit the fulcrum.cli.v1 envelope", async () => {
    const caller = fakeCaptureCaller();
    for (const [kind, value] of [["text", "half-baked idea"], ["url", "https://example.com"], ["file", "/tmp/note.md"]] as const) {
      const lines = await capture([kind, value, "--trace", TRACE, "--json"], caller);
      const env = expectCanonicalEnvelope(lines[0]!, `fulcrum capture ${kind}`);
      expect(env["trace_id"]).toBe(TRACE);
      expect((env["result"] as Record<string, unknown>)["kind"]).toBe(kind);
    }
    expect(caller.calls).toEqual(["intake:text", "intake:url", "intake:file"]);
  });

  test("capture inbox triages snooze/accept/decline through the envelope", async () => {
    const caller = fakeCaptureCaller();
    for (const action of ["--snooze", "--accept", "--decline"] as const) {
      const lines = await capture(["inbox", action, "cap_1", "--trace", TRACE, "--json"], caller);
      expectCanonicalEnvelope(lines[0]!, "fulcrum capture inbox");
    }
    expect(caller.calls).toEqual(["triageInbox:snooze", "triageInbox:accept", "triageInbox:decline"]);
  });

  test("capture note new + list dispatch and emit the canonical envelope", async () => {
    const caller = fakeCaptureCaller();
    const created = await capture(["note", "new", "remember this", "--trace", TRACE, "--json"], caller);
    expectCanonicalEnvelope(created[0]!, "fulcrum capture note new");

    const listed = await capture(["note", "list", "--tag", "ideas", "--json"], caller);
    const env = expectCanonicalEnvelope(listed[0]!, "fulcrum capture note list");
    expect((env["result"] as unknown[]).length).toBe(1);
    expect(caller.calls).toEqual(["createNote", "listNotes"]);
  });

  test("existing review|status|action verbs are not removed and emit the envelope", async () => {
    const caller = fakeCaptureCaller();
    const review = await capture(["review", "cap_1", "--note", "ready", "--trace", TRACE, "--json"], caller);
    expectCanonicalEnvelope(review[0]!, "fulcrum capture review");

    const status = await capture(["status", "cap_1", "--status", "approved", "--trace", TRACE, "--json"], caller);
    expectCanonicalEnvelope(status[0]!, "fulcrum capture status");

    const action = await capture(["action", "cap_1", "--action", "approve", "--trace", TRACE, "--json"], caller);
    expectCanonicalEnvelope(action[0]!, "fulcrum capture action");

    // `quick-action` is the documented compat alias for `action`: not removed.
    const alias = await capture(["quick-action", "cap_1", "--action", "escalate", "--trace", TRACE, "--json"], caller);
    expectCanonicalEnvelope(alias[0]!, "fulcrum capture quick-action");

    expect(caller.calls).toEqual(["submitReview", "setStatus", "runQuickAction", "runQuickAction"]);
  });

  test("plain (non --json) capture output prints the trace header line", async () => {
    const caller = fakeCaptureCaller();
    const lines = await capture(["text", "an idea", "--trace", TRACE], caller);
    expect(lines.join("\n")).toContain("cap_intake");
    expect(lines.some((l) => l.includes("trace:") && l.includes(TRACE.slice(0, 8)))).toBe(true);
  });
});

describe("Capture-stage CLI verb parity: fulcrum doc grammar", () => {
  test("doc list/new/view/edit/history/restore/search/delete/template each emit the envelope", async () => {
    const caller = fakeDocsCaller();
    const cases: Array<[string[], string, string]> = [
      [["list", "--json"], "list", "fulcrum doc list"],
      [["new", "--title", "Token rotation", "--json"], "create", "fulcrum doc new"],
      [["view", "token-rotation", "--json"], "get", "fulcrum doc view"],
      [["history", "11111111-1111-4111-8111-111111111111", "--json"], "versionsList", "fulcrum doc history"],
      [["restore", "11111111-1111-4111-8111-111111111111", "--version", "1", "--json"], "restoreVersion", "fulcrum doc restore"],
      [["search", "rotation", "--json"], "search", "fulcrum doc search"],
      [["delete", "11111111-1111-4111-8111-111111111111", "--json"], "delete", "fulcrum doc delete"],
      [["template", "list", "--json"], "templates.list", "fulcrum doc template list"],
    ];
    for (const [argv, expectedCall, command] of cases) {
      const lines = await docs(argv, caller);
      expectCanonicalEnvelope(lines[0]!, command);
      expect(caller.calls).toContain(expectedCall);
    }
  });

  test("doc attach/comment/link dispatch and emit the canonical envelope", async () => {
    const caller = fakeDocsCaller();
    const attach = await docs(["attach", "token-rotation", "/tmp/spec.pdf", "--json"], caller);
    expectCanonicalEnvelope(attach[0]!, "fulcrum doc attach");

    const comment = await docs(["comment", "token-rotation", "--body", "needs detail", "--json"], caller);
    expectCanonicalEnvelope(comment[0]!, "fulcrum doc comment");

    const link = await docs(["link", "token-rotation", "--task", "TASK-123", "--json"], caller);
    expectCanonicalEnvelope(link[0]!, "fulcrum doc link");

    expect(caller.calls).toEqual(expect.arrayContaining(["attach", "comment", "link"]));
  });

  test("old verb names (create/get/versions list) keep working as documented aliases", async () => {
    const caller = fakeDocsCaller();
    expectCanonicalEnvelope((await docs(["create", "--title", "X", "--json"], caller))[0]!, "fulcrum doc new");
    expectCanonicalEnvelope((await docs(["get", "token-rotation", "--json"], caller))[0]!, "fulcrum doc view");
    expectCanonicalEnvelope(
      (await docs(["versions", "list", "11111111-1111-4111-8111-111111111111", "--json"], caller))[0]!,
      "fulcrum doc history",
    );
  });

  test("--json-raw keeps the pre-envelope shape for one-release compatibility", async () => {
    const caller = fakeDocsCaller();
    const lines = await docs(["list", "--json-raw"], caller);
    const parsed = JSON.parse(lines[0]!);
    // Raw shape is the bare result payload, not the twelve-key envelope.
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].slug).toBe("token-rotation");
  });
});
