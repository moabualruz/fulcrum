/**
 * `fulcrum plan|mission|prototype` Plan-stage command parity.
 *
 * Proves the Plan-stage CLI grammar from `CLI-TUI-UX.md` §1.2 / `IA-MAP.md` §3:
 *  - every `plan` / `mission` / `prototype` verb dispatches to its caller, and
 *  - every verb emits the canonical twelve-key `fulcrum.cli.v1` envelope under
 *    `--json` (the same envelope contract as the rest of the CLI surface).
 *
 * The existing `fulcrum product planning …` commands are kept as documented
 * aliases — they are exercised elsewhere and unchanged by this PRD.
 */

import { describe, expect, test } from "bun:test";

import {
  run as runPlan,
  runMission,
  runPrototype,
  type PlanStageCaller,
} from "../../apps/cli/src/commands/plan-stage.ts";
import { ENVELOPE_SCHEMA } from "../../apps/cli/src/lib/envelope.ts";

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

/** A fake Plan-stage caller that records every dispatched verb + input. */
function fakeCaller(): PlanStageCaller & { calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const record = (verb: string, payload: unknown) => {
    return async (input: Record<string, unknown>) => {
      calls.push([verb, input]);
      return { verb, ...input, payload };
    };
  };
  return {
    calls,
    plan: {
      start: record("plan.start", { sessionId: "ses-1" }),
      list: record("plan.list", [{ id: "pln-1" }]),
      view: record("plan.view", { id: "pln-1" }),
      edit: record("plan.edit", { id: "pln-1" }),
      approve: record("plan.approve", { id: "pln-1", status: "approved" }),
      reject: record("plan.reject", { id: "pln-1", status: "rejected" }),
      materialize: record("plan.materialize", { id: "pln-1", taskCount: 4 }),
      preview: record("plan.preview", { id: "pln-1", taskCount: 4 }),
    },
    mission: {
      create: record("mission.create", { id: "msn-1" }),
      list: record("mission.list", [{ id: "msn-1" }]),
      show: record("mission.show", { id: "msn-1" }),
      activate: record("mission.activate", { waveId: "wav-1" }),
      delete: record("mission.delete", { id: "msn-1", deleted: true }),
    },
    prototype: {
      create: record("prototype.new", { id: "pro-1" }),
      view: record("prototype.view", { id: "pro-1" }),
      attach: record("prototype.attach", { planId: "pln-1", attached: true }),
    },
  };
}

describe("fulcrum plan command parity", () => {
  const planVerbCases: Array<{ verb: string; argv: string[]; command: string; callerKey: string }> = [
    { verb: "start", argv: ["start", "--agent", "claude", "--cwd", "/tmp"], command: "fulcrum plan start", callerKey: "plan.start" },
    { verb: "list", argv: ["list", "--status", "approved"], command: "fulcrum plan list", callerKey: "plan.list" },
    { verb: "view", argv: ["view", "pln-1", "--include-tasks"], command: "fulcrum plan view", callerKey: "plan.view" },
    { verb: "edit", argv: ["edit", "pln-1", "--title", "New"], command: "fulcrum plan edit", callerKey: "plan.edit" },
    { verb: "approve", argv: ["approve", "pln-1"], command: "fulcrum plan approve", callerKey: "plan.approve" },
    { verb: "reject", argv: ["reject", "pln-1", "--reason", "scope"], command: "fulcrum plan reject", callerKey: "plan.reject" },
    { verb: "materialize", argv: ["materialize", "pln-1", "--file", "plan.md"], command: "fulcrum plan materialize", callerKey: "plan.materialize" },
    { verb: "preview", argv: ["preview", "pln-1", "--file", "plan.md"], command: "fulcrum plan preview", callerKey: "plan.preview" },
  ];

  for (const { verb, argv, command, callerKey } of planVerbCases) {
    test(`plan ${verb} dispatches and emits the canonical envelope under --json`, async () => {
      const caller = fakeCaller();
      const io = captureLines();
      await runPlan([...argv, "--json"], { caller, ...io.opts });

      const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), command);
      expect(envelope["result"]).toBeDefined();
      expect(io.exitCode).toBeUndefined();
      // The verb dispatched to exactly its caller method.
      expect(caller.calls.map(([key]) => key)).toEqual([callerKey]);
    });
  }
});

describe("fulcrum mission command parity", () => {
  const missionVerbCases: Array<{ verb: string; argv: string[]; command: string; callerKey: string }> = [
    { verb: "create", argv: ["create", "--title", "Recovery"], command: "fulcrum mission create", callerKey: "mission.create" },
    { verb: "list", argv: ["list", "--depth", "2"], command: "fulcrum mission list", callerKey: "mission.list" },
    { verb: "show", argv: ["show", "msn-1"], command: "fulcrum mission show", callerKey: "mission.show" },
    { verb: "activate", argv: ["activate", "--wave", "wav-1"], command: "fulcrum mission activate", callerKey: "mission.activate" },
    { verb: "delete", argv: ["delete", "msn-1"], command: "fulcrum mission delete", callerKey: "mission.delete" },
  ];

  for (const { verb, argv, command, callerKey } of missionVerbCases) {
    test(`mission ${verb} dispatches and emits the canonical envelope under --json`, async () => {
      const caller = fakeCaller();
      const io = captureLines();
      await runMission([...argv, "--json"], { caller, ...io.opts });

      const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), command);
      expect(envelope["result"]).toBeDefined();
      expect(io.exitCode).toBeUndefined();
      expect(caller.calls.map(([key]) => key)).toEqual([callerKey]);
    });
  }
});

describe("fulcrum prototype command parity", () => {
  const prototypeVerbCases: Array<{ verb: string; argv: string[]; command: string; callerKey: string }> = [
    { verb: "new", argv: ["new", "--plan", "pln-1", "--target", "src/x.tsx"], command: "fulcrum prototype new", callerKey: "prototype.new" },
    { verb: "view", argv: ["view", "pro-1"], command: "fulcrum prototype view", callerKey: "prototype.view" },
    { verb: "attach", argv: ["attach", "pln-1", "proto/x.html"], command: "fulcrum prototype attach", callerKey: "prototype.attach" },
  ];

  for (const { verb, argv, command, callerKey } of prototypeVerbCases) {
    test(`prototype ${verb} dispatches and emits the canonical envelope under --json`, async () => {
      const caller = fakeCaller();
      const io = captureLines();
      await runPrototype([...argv, "--json"], { caller, ...io.opts });

      const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), command);
      expect(envelope["result"]).toBeDefined();
      expect(io.exitCode).toBeUndefined();
      expect(caller.calls.map(([key]) => key)).toEqual([callerKey]);
    });
  }
});

describe("fulcrum Plan-stage envelope + trace contract", () => {
  test("FULCRUM_TRACE_ID propagates into the Plan envelope trace_id", async () => {
    const caller = fakeCaller();
    const io = captureLines();
    await runPlan(["preview", "pln-1", "--file", "plan.md", "--trace", "0123456789abcdef0123456789abcdef", "--json"], {
      caller,
      ...io.opts,
    });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum plan preview");
    expect(envelope["trace_id"]).toBe("0123456789abcdef0123456789abcdef");
  });

  test("plain output renders the same result data as the --json envelope", async () => {
    const jsonIo = captureLines();
    const humanIo = captureLines();
    await runPlan(["list", "--status", "approved", "--json"], { caller: fakeCaller(), ...jsonIo.opts });
    await runPlan(["list", "--status", "approved"], { caller: fakeCaller(), ...humanIo.opts });

    const envelopeResult = JSON.parse(jsonIo.lines[0]!).result;
    // Plain output prints the same result payload plus the DESIGN.md §4.10 trace line.
    expect(humanIo.lines[0]).toBe(JSON.stringify(envelopeResult, null, 2));
  });

  test("a failed Plan verb stays inside the envelope with a populated errors array", async () => {
    const io = captureLines();
    const failing = fakeCaller();
    failing.plan.materialize = async () => {
      throw new Error("plan not found");
    };
    await runPlan(["materialize", "missing", "--file", "plan.md", "--json"], { caller: failing, ...io.opts });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum plan materialize");
    expect(envelope["result"]).toBeNull();
    const errors = envelope["errors"] as Array<{ code: string; message: string }>;
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain("plan not found");
    expect(io.exitCode).toBe(1);
  });

  test("a missing required flag is a usage error (exit 2) inside the envelope", async () => {
    const io = captureLines();
    await runPlan(["reject", "pln-1", "--json"], { caller: fakeCaller(), ...io.opts });

    const envelope = expectCanonicalEnvelope(JSON.parse(io.lines[0]!), "fulcrum plan reject");
    const errors = envelope["errors"] as Array<{ message: string }>;
    expect(errors[0]!.message).toContain("--reason");
    expect(io.exitCode).toBe(2);
  });

  test("an unknown Plan verb reports usage and exits 2", async () => {
    const io = captureLines();
    await runPlan(["bogus", "--json"], { caller: fakeCaller(), ...io.opts });

    expect(io.exitCode).toBe(2);
    expect(io.errLines.join("\n")).toContain("unknown command 'bogus'");
  });
});
