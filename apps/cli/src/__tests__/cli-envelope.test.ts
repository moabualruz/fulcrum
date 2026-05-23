/**
 * Canonical `fulcrum.cli.v1` envelope contract test.
 *
 * Proves that real CLI commands: one representative per implemented workflow
 * stage: emit the canonical JSON envelope defined in `CLI-TUI-UX.md` §3, with
 * exactly the twelve documented keys and the array invariants on `errors` and
 * `next_actions`. Also exercises the streaming JSONL contract, the `--jq`
 * `.result` filter, and the one-release `--json-raw` compatibility shape.
 *
 * Stage coverage (the commands that route through the shared envelope helper):
 *  - Capture   → `fulcrum capture status`
 *  - Build     → `fulcrum runs list`
 *  - Operate   → `fulcrum audit query`, `fulcrum flags list`
 *  - AI Assist → `fulcrum ai start`
 *
 * Plan / Review / Ship per-stage command verbs are owned by the wave-3
 * `prd-cli-<stage>-stage-parity` PRDs (closure-review Issue 7); when those land
 * they route through this same `wrapEnvelope` helper and extend this matrix.
 */

import { describe, expect, test } from "bun:test";

import { run as runCapture } from "../commands/capture.ts";
import { run as runAi } from "../commands/ai.ts";
import { runPillar14Command } from "../commands/pillar14-generated.ts";
import { ENVELOPE_SCHEMA } from "../lib/envelope.ts";

const CANONICAL_KEYS = [
  "schema",
  "trace_id",
  "span_id",
  "run_id",
  "project_id",
  "command",
  "args",
  "result",
  "errors",
  "next_actions",
  "duration_ms",
  "timestamp",
] as const;

/** Assert a parsed object is the canonical 12-key `fulcrum.cli.v1` envelope. */
function expectCanonicalEnvelope(parsed: unknown, command: string): Record<string, unknown> {
  expect(typeof parsed === "object" && parsed !== null).toBe(true);
  const envelope = parsed as Record<string, unknown>;
  // Exactly the CLI-TUI-UX §3 keys: no more, no fewer.
  expect(Object.keys(envelope).sort()).toEqual([...CANONICAL_KEYS].sort());
  expect(envelope["schema"]).toBe(ENVELOPE_SCHEMA);
  expect(envelope["command"]).toBe(command);
  expect(typeof envelope["trace_id"]).toBe("string");
  expect((envelope["trace_id"] as string).length).toBe(32);
  expect(typeof envelope["span_id"]).toBe("string");
  expect((envelope["span_id"] as string).length).toBe(16);
  expect(typeof envelope["duration_ms"]).toBe("number");
  expect(typeof envelope["timestamp"]).toBe("string");
  expect(Number.isNaN(Date.parse(envelope["timestamp"] as string))).toBe(false);
  // errors / next_actions are always arrays, never null.
  expect(Array.isArray(envelope["errors"])).toBe(true);
  expect(Array.isArray(envelope["next_actions"])).toBe(true);
  return envelope;
}

function captureLines() {
  const lines: string[] = [];
  const errLines: string[] = [];
  let exitCode: number | undefined;
  return {
    lines,
    errLines,
    get exitCode() {
      return exitCode;
    },
    opts: {
      print: (line: string) => lines.push(line),
      printErr: (line: string) => errLines.push(line),
      exit: (code: number) => {
        exitCode = code;
      },
    },
  };
}

function captureCaller() {
  return {
    capture: {
      submitReview: async () => ({
        captureId: "cap-1",
        status: "review" as const,
        action: "review" as const,
        traceId: "trace-1",
        message: "Review note saved",
      }),
      setStatus: async (input: { captureId: string; status: "triage" | "review" | "approved" }) => ({
        captureId: input.captureId,
        status: input.status,
        action: "status" as const,
        traceId: "abcdef0123456789abcdef0123456789",
        message: `Status set to ${input.status}`,
      }),
      runQuickAction: async () => ({
        captureId: "cap-1",
        status: "review" as const,
        action: "assign" as const,
        traceId: "trace-1",
        message: "Quick action assign queued",
      }),
    },
  };
}

function runsCaller() {
  return {
    runs: {
      list: async () => [
        { id: "run-1", status: "running" },
        { id: "run-2", status: "succeeded" },
      ],
    },
    audit: {
      query: async () => [{ id: "evt-1", kind: "task" }],
    },
    flags: {
      list: async () => [{ name: "router-llm", enabled: false }],
    },
  };
}

describe("canonical fulcrum.cli.v1 JSON envelope", () => {
  test("Capture stage: `fulcrum capture status --json` emits the canonical envelope", async () => {
    const io = captureLines();
    await runCapture(["status", "cap-1", "--status", "approved", "--json"], {
      caller: captureCaller(),
      ...io.opts,
    });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum capture status");
    expect(envelope["result"]).toMatchObject({
      captureId: "cap-1",
      status: "approved",
      action: "status",
    });
    // The result's own 32-hex trace id propagates onto the envelope.
    expect(envelope["trace_id"]).toBe("abcdef0123456789abcdef0123456789");
  });

  test("Build stage: `fulcrum runs list --json` emits the canonical envelope", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["list", "--json"], { caller: runsCaller(), ...io.opts });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum runs list");
    expect(envelope["result"]).toEqual([
      { id: "run-1", status: "running" },
      { id: "run-2", status: "succeeded" },
    ]);
    expect(io.exitCode).toBeUndefined();
  });

  test("Operate stage: `fulcrum audit query --json` emits the canonical envelope", async () => {
    const io = captureLines();
    await runPillar14Command("audit", ["query", "--json"], { caller: runsCaller(), ...io.opts });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum audit query");
    expect(envelope["result"]).toEqual([{ id: "evt-1", kind: "task" }]);
  });

  test("Operate stage: `fulcrum flags list --json` emits the canonical envelope", async () => {
    const io = captureLines();
    await runPillar14Command("flags", ["list", "--json"], { caller: runsCaller(), ...io.opts });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum flags list");
    expect(envelope["result"]).toEqual([{ name: "router-llm", enabled: false }]);
  });

  test("AI Assist stage: `fulcrum ai start --json` emits the canonical envelope", async () => {
    const io = captureLines();
    await runAi(
      ["start", "--task", "task-1", "--title", "Ship drawer", "--route", "plan", "--json"],
      io.opts,
    );

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum ai start");
    expect(envelope["result"]).toMatchObject({ taskId: "task-1", taskTitle: "Ship drawer" });
    // `next_actions` is populated for AI Assist: still an array, never null.
    expect(envelope["next_actions"]).toEqual([
      { label: "Open in TUI", command: "fulcrum tui :ai" },
    ]);
  });

  test("plain output uses the same underlying result data as `--json`", async () => {
    const jsonIo = captureLines();
    const humanIo = captureLines();
    await runCapture(["status", "cap-9", "--status", "review", "--json"], {
      caller: captureCaller(),
      ...jsonIo.opts,
    });
    await runCapture(["status", "cap-9", "--status", "review"], {
      caller: captureCaller(),
      ...humanIo.opts,
    });

    const envelopeResult = JSON.parse(jsonIo.lines[0]!).result as { captureId: string; status: string };
    // Human line renders the same captureId + status the envelope `result` carries.
    const humanResultLine = humanIo.lines.find((line) => line.includes(envelopeResult.captureId)) ?? "";
    expect(humanResultLine).toContain(envelopeResult.captureId);
    expect(humanResultLine).toContain(envelopeResult.status);
  });

  test("failed `--json` output stays inside the envelope with a populated `errors` array", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["show", "missing", "--json"], {
      caller: {
        runs: {
          list: async () => [],
          get: async () => null,
        },
      },
      ...io.opts,
    });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum runs show");
    expect(envelope["result"]).toBeNull();
    const errors = envelope["errors"] as Array<{ code: string; message: string; trace_id?: string }>;
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain("missing");
    expect(errors[0]!.trace_id).toBe(envelope["trace_id"] as string);
    expect(io.exitCode).toBe(1);
  });

  test("streaming command emits JSONL: one envelope per line plus an end sentinel", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["watch", "run-1", "--json"], {
      caller: {
        runs: { list: async () => [] },
        orchestration: {
          watchRun: async function* () {
            yield { type: "tool_call", runId: "run-1" };
            yield { type: "approval", runId: "run-1" };
          },
        },
      },
      ...io.opts,
    });

    const lines = io.lines.map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    // Each streamed item is a full canonical envelope.
    const first = expectCanonicalEnvelope(lines[0], "fulcrum runs watch");
    const second = expectCanonicalEnvelope(lines[1], "fulcrum runs watch");
    expect(first["result"]).toMatchObject({ type: "tool_call" });
    expect(second["result"]).toMatchObject({ type: "approval" });
    // Every streamed line shares one trace id.
    expect(second["trace_id"]).toBe(first["trace_id"] as string);
    // The stream is terminated by the end sentinel from CLI-TUI-UX §3.
    expect(lines[2]).toEqual({
      schema: ENVELOPE_SCHEMA,
      result: null,
      end: true,
      trace_id: first["trace_id"],
    });
  });

  test("`--jq <expr>` operates on `.result` of the envelope", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["list", "--json", "--jq", ".[].id"], {
      caller: runsCaller(),
      ...io.opts,
    });

    // jq runs against `.result` (the runs array), not the whole envelope.
    expect(io.lines.join("\n").trim()).toBe(['"run-1"', '"run-2"'].join("\n"));
  });

  test("`--json-raw` preserves the pre-envelope shape for one-release compatibility", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["list", "--json", "--json-raw"], {
      caller: runsCaller(),
      ...io.opts,
    });

    // The legacy direct array: no envelope wrapper.
    expect(JSON.parse(io.lines[0]!)).toEqual([
      { id: "run-1", status: "running" },
      { id: "run-2", status: "succeeded" },
    ]);
  });

  test("`FULCRUM_TRACE_ID` propagates into the envelope trace id", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["list", "--json"], {
      caller: runsCaller(),
      env: { FULCRUM_TRACE_ID: "0123456789abcdef0123456789abcdef" },
      ...io.opts,
    });

    const envelope = JSON.parse(io.lines[0]!) as Record<string, unknown>;
    expect(envelope["trace_id"]).toBe("0123456789abcdef0123456789abcdef");
  });
});
