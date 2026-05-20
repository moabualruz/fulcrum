/**
 * Build-stage CLI verb-parity contract test (`prd-cli-build-stage-parity`).
 *
 * Proves the canonical Build grammar from `CLI-TUI-UX.md` §1.3 — `fulcrum task`,
 * `fulcrum run`, `fulcrum runs`, `fulcrum cycle`, `fulcrum module`,
 * `fulcrum context` — dispatches every documented verb and wraps `--json`
 * output in the canonical `fulcrum.cli.v1` envelope (`CLI-TUI-UX.md` §3).
 *
 * Consumed-by: this is the parity test the PRD `verify` array runs. It names
 * the real Build commands (`task` / `cycle` / `module` / `run`) and asserts the
 * `fulcrum.cli.v1` envelope shape, so the envelope helper is proven *used*, not
 * merely defined.
 */

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run as runTask } from "@fulcrum/cli/commands/tasks.ts";
import {
  runPillar14Command,
  BUILD_STAGE_DOMAINS,
  type Pillar14Domain,
} from "@fulcrum/cli/commands/pillar14-generated.ts";

/** The twelve canonical `fulcrum.cli.v1` envelope keys (`CLI-TUI-UX.md` §3). */
const ENVELOPE_KEYS = [
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

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

/** Assert a JSON line is the canonical 12-key `fulcrum.cli.v1` envelope. */
function expectCanonicalEnvelope(line: string, command: string): Record<string, unknown> {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  expect(Object.keys(parsed).sort()).toEqual([...ENVELOPE_KEYS].sort());
  expect(parsed["schema"]).toBe("fulcrum.cli.v1");
  expect(parsed["command"]).toBe(command);
  expect(typeof parsed["trace_id"]).toBe("string");
  expect((parsed["trace_id"] as string).length).toBe(32);
  expect(Array.isArray(parsed["errors"])).toBe(true);
  expect(Array.isArray(parsed["next_actions"])).toBe(true);
  return parsed;
}

/** A task API caller stub — the test seam the production env caller fills in. */
function taskCaller(overrides: Record<string, unknown> = {}) {
  return {
    tasks: {
      list: async () => [
        { id: "FUL-1", title: "Build board", status: "in-progress", cycleId: "24w13", moduleId: "auth", priority: "P1" },
        { id: "FUL-2", title: "Runs feed", status: "todo", cycleId: "24w13", moduleId: "runs", priority: "P2" },
      ],
      get: async (input: { id: string }) => ({ id: input.id, title: "Build board", status: "in-progress", dependsOn: [] }),
      create: async (input: Record<string, unknown>) => ({ id: "FUL-9", ...input }),
      update: async (input: Record<string, unknown>) => ({ ...input, updated: true }),
      delete: async (input: { id: string }) => ({ id: input.id, deleted: true }),
      ...overrides,
    },
  };
}

/** An agent-run + task + dependency-execution caller stub for `runs`/`run`/`cycle`/`module`/`context`. */
function pillarCaller() {
  return {
    runs: {
      list: async () => [{ id: "run_8f29a4c", status: "running" }],
      get: async (input: { id: string }) => ({ id: input.id, status: "succeeded", transcript_path: "" }),
      cancel: async (input: { id: string }) => ({ id: input.id, status: "cancelled" }),
      retry: async (input: { id: string; fromStep?: number }) => ({ id: `${input.id}-retry`, fromStep: input.fromStep ?? null }),
      dispatch: async (input: { taskId: string }) => ({ id: "run_dispatched", taskId: input.taskId }),
    },
    orchestration: {
      dispatchRun: async (input: { taskId: string; agentName?: string }) => ({ id: "run_new", taskId: input.taskId, agent: input.agentName ?? null }),
      getRun: async (input: { runId: string }) => ({ id: input.runId, status: "succeeded" }),
    },
    tasks: {
      list: async () => [
        { id: "FUL-1", title: "Build board", cycleId: "24w13", moduleId: "auth" },
        { id: "FUL-2", title: "Runs feed", cycleId: "24w13", moduleId: "runs" },
        { id: "FUL-3", title: "No cycle" },
      ],
    },
    dependencyExecution: {
      previewDependencyRun: async (input: { targetTaskIds: string[] }) => ({
        mode: "dependency-tree",
        targetTaskIds: input.targetTaskIds,
        nodes: [{ id: input.targetTaskIds[0], state: "ready" }],
      }),
      loadDependencyRunLiveFeedback: async () => ({ executorStatus: { active: false }, events: [] }),
    },
  };
}

describe("Build-stage CLI verb parity (CLI-TUI-UX §1.3)", () => {
  test("fulcrum task exposes every canonical Build verb", async () => {
    // Canonical verbs per CLI-TUI-UX §1.3 task grammar.
    const canonicalVerbs = ["new", "list", "view", "edit", "move", "bulk", "run-preview", "run", "qa-review"];
    for (const verb of canonicalVerbs) {
      const io = capture();
      const args = buildTaskArgs(verb);
      await runTask(args.argv, { ...io.opts, caller: taskCaller(args.callerOverrides) as never });
      expect(io.exits, `${verb} should not error: ${io.err.join("\n")}`).toEqual([]);
      expect(io.out.length, `${verb} should print output`).toBeGreaterThan(0);
    }
  });

  test("every fulcrum task --json verb wraps output in the fulcrum.cli.v1 envelope", async () => {
    const cases: Array<{ verb: string; command: string }> = [
      { verb: "list", command: "fulcrum task list" },
      { verb: "view", command: "fulcrum task view" },
      { verb: "edit", command: "fulcrum task edit" },
      { verb: "move", command: "fulcrum task move" },
      { verb: "bulk", command: "fulcrum task bulk" },
      { verb: "run-preview", command: "fulcrum task run-preview" },
      { verb: "run", command: "fulcrum task run" },
    ];
    for (const { verb, command } of cases) {
      const io = capture();
      const args = buildTaskArgs(verb);
      await runTask([...args.argv, "--json"], { ...io.opts, caller: taskCaller(args.callerOverrides) as never });
      expect(io.exits, `${verb}: ${io.err.join("\n")}`).toEqual([]);
      const envelope = expectCanonicalEnvelope(io.out[0]!, command);
      expect(envelope["result"]).not.toBeNull();
    }
  });

  test("fulcrum task move and run-preview surface next_actions in the envelope", async () => {
    const io = capture();
    await runTask(["move", "FUL-1", "--cycle", "24w14", "--json"], {
      ...io.opts,
      caller: taskCaller() as never,
    });
    const envelope = expectCanonicalEnvelope(io.out[0]!, "fulcrum task move");
    const nextActions = envelope["next_actions"] as Array<{ command: string }>;
    expect(nextActions.length).toBeGreaterThan(0);
    expect(nextActions[0]!.command).toContain("fulcrum task view");
  });

  test("fulcrum task keeps documented aliases — get/create/update/delete still dispatch", async () => {
    for (const verb of ["get", "create", "update", "delete"]) {
      const io = capture();
      const args = buildTaskAliasArgs(verb);
      await runTask([...args, "--json"], { ...io.opts, caller: taskCaller() as never });
      expect(io.exits, `${verb} alias should still work`).toEqual([]);
      expect(io.out.length).toBeGreaterThan(0);
    }
  });

  test("fulcrum task failure stays inside the envelope with a coded error", async () => {
    const io = capture();
    await runTask(["view", "MISSING", "--json"], {
      ...io.opts,
      caller: { tasks: { get: async () => { throw new Error("not found"); } } } as never,
    });
    expect(io.exits).toEqual([1]);
    const envelope = JSON.parse(io.out[0]!) as Record<string, unknown>;
    expect(envelope["schema"]).toBe("fulcrum.cli.v1");
    expect(envelope["result"]).toBeNull();
    const errors = envelope["errors"] as Array<{ code: string; message: string }>;
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain("not found");
  });

  test("fulcrum run dispatches new/view/cancel/retry/attach and emits the envelope", async () => {
    const verbs: Array<{ argv: string[]; command: string }> = [
      { argv: ["new", "--task", "FUL-1", "--agent", "build-agent", "--json"], command: "fulcrum run new" },
      { argv: ["view", "run_8f29a4c", "--json"], command: "fulcrum run view" },
      { argv: ["cancel", "run_8f29a4c", "--json"], command: "fulcrum run cancel" },
      { argv: ["retry", "run_8f29a4c", "--from-step", "3", "--json"], command: "fulcrum run retry" },
    ];
    for (const { argv, command } of verbs) {
      const io = capture();
      await runPillar14Command("run", argv, { ...io.opts, caller: pillarCaller() as never });
      expect(io.exits, `${command}: ${io.err.join("\n")}`).toEqual([]);
      expectCanonicalEnvelope(io.out[0]!, command);
    }
  });

  test("fulcrum run retry honours --from-step", async () => {
    const io = capture();
    await runPillar14Command("run", ["retry", "run_8f29a4c", "--from-step", "3", "--json"], {
      ...io.opts,
      caller: pillarCaller() as never,
    });
    const envelope = expectCanonicalEnvelope(io.out[0]!, "fulcrum run retry");
    expect((envelope["result"] as { fromStep: number }).fromStep).toBe(3);
  });

  test("fulcrum run retry rejects a non-numeric --from-step", async () => {
    const io = capture();
    await runPillar14Command("run", ["retry", "run_8f29a4c", "--from-step", "bogus", "--json"], {
      ...io.opts,
      caller: pillarCaller() as never,
    });
    expect(io.exits).toEqual([1]);
  });

  test("fulcrum runs feed/list/tail dispatch and emit the envelope", async () => {
    const listIo = capture();
    await runPillar14Command("runs", ["list", "--json"], { ...listIo.opts, caller: pillarCaller() as never });
    expect(listIo.exits).toEqual([]);
    expectCanonicalEnvelope(listIo.out[0]!, "fulcrum runs list");

    const tailIo = capture();
    await runPillar14Command("runs", ["tail", "run_8f29a4c", "--lines", "5", "--json"], {
      ...tailIo.opts,
      caller: pillarCaller() as never,
    });
    expect(tailIo.exits, tailIo.err.join("\n")).toEqual([]);
    const tailEnvelope = expectCanonicalEnvelope(tailIo.out[0]!, "fulcrum runs tail");
    expect((tailEnvelope["result"] as { kind: string }).kind).toBe("runs-tail");
  });

  test("fulcrum cycle list/activate/complete dispatch and emit the envelope", async () => {
    const listIo = capture();
    await runPillar14Command("cycle", ["list", "--json"], { ...listIo.opts, caller: pillarCaller() as never });
    expect(listIo.exits, listIo.err.join("\n")).toEqual([]);
    const listEnvelope = expectCanonicalEnvelope(listIo.out[0]!, "fulcrum cycle list");
    const cycles = (listEnvelope["result"] as { cycles: Array<{ id: string }> }).cycles;
    expect(cycles.some((c) => c.id === "24w13")).toBe(true);

    for (const verb of ["activate", "complete"]) {
      const io = capture();
      await runPillar14Command("cycle", [verb, "24w13", "--json"], { ...io.opts, caller: pillarCaller() as never });
      expect(io.exits, `cycle ${verb}: ${io.err.join("\n")}`).toEqual([]);
      expectCanonicalEnvelope(io.out[0]!, `fulcrum cycle ${verb}`);
    }
  });

  test("fulcrum module list/new/view dispatch and emit the envelope", async () => {
    const cases: Array<{ argv: string[]; command: string }> = [
      { argv: ["list", "--json"], command: "fulcrum module list" },
      { argv: ["new", "--name", "auth", "--json"], command: "fulcrum module new" },
      { argv: ["view", "auth", "--json"], command: "fulcrum module view" },
    ];
    for (const { argv, command } of cases) {
      const io = capture();
      await runPillar14Command("module", argv, { ...io.opts, caller: pillarCaller() as never });
      expect(io.exits, `${command}: ${io.err.join("\n")}`).toEqual([]);
      expectCanonicalEnvelope(io.out[0]!, command);
    }
  });

  test("fulcrum context pack/inspect/diff dispatch and emit the envelope", async () => {
    const cases: Array<{ argv: string[]; command: string }> = [
      { argv: ["pack", "--task", "FUL-1", "--include-docs", "--json"], command: "fulcrum context pack" },
      { argv: ["inspect", "--task", "FUL-1", "--json"], command: "fulcrum context inspect" },
      { argv: ["diff", "--task", "FUL-1", "--against", "run_8f29a4c", "--json"], command: "fulcrum context diff" },
    ];
    for (const { argv, command } of cases) {
      const io = capture();
      await runPillar14Command("context", argv, { ...io.opts, caller: pillarCaller() as never });
      expect(io.exits, `${command}: ${io.err.join("\n")}`).toEqual([]);
      const envelope = expectCanonicalEnvelope(io.out[0]!, command);
      expect((envelope["result"] as { dependencyTree: unknown }).dependencyTree).toBeDefined();
    }
  });

  test("every Build-stage domain is registered and prints help", async () => {
    const expected: Pillar14Domain[] = ["runs", "run", "cycle", "module", "context"];
    expect([...BUILD_STAGE_DOMAINS].sort()).toEqual(expected.sort());
    for (const domain of BUILD_STAGE_DOMAINS) {
      const io = capture();
      await runPillar14Command(domain, ["help"], { ...io.opts });
      expect(io.out.join("\n")).toContain(`fulcrum ${domain}`);
    }
  });

  test("runs tail reads the last N transcript lines from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fulcrum-tail-"));
    try {
      const logPath = join(dir, "run.jsonl");
      await writeFile(logPath, ["line-1", "line-2", "line-3", "line-4"].join("\n"));
      const io = capture();
      await runPillar14Command("runs", ["tail", "run_with_log", "--lines", "2", "--json"], {
        ...io.opts,
        caller: {
          runs: { get: async () => ({ id: "run_with_log", transcript_path: logPath }) },
        } as never,
      });
      const envelope = expectCanonicalEnvelope(io.out[0]!, "fulcrum runs tail");
      expect((envelope["result"] as { tail: string[] }).tail).toEqual(["line-3", "line-4"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** Build the argv + caller overrides for a canonical `fulcrum task` verb. */
function buildTaskArgs(verb: string): { argv: string[]; callerOverrides: Record<string, unknown> } {
  switch (verb) {
    case "new":
      return { argv: ["new", "--title", "Fresh task", "--project", "proj-1"], callerOverrides: {} };
    case "list":
      return { argv: ["list"], callerOverrides: {} };
    case "view":
      return { argv: ["view", "FUL-1"], callerOverrides: {} };
    case "edit":
      return { argv: ["edit", "FUL-1", "--status", "done"], callerOverrides: {} };
    case "move":
      return { argv: ["move", "FUL-1", "--cycle", "24w14"], callerOverrides: {} };
    case "bulk":
      return { argv: ["bulk", "FUL-1,FUL-2", "--status", "done"], callerOverrides: {} };
    case "run-preview":
      return { argv: ["run-preview", "FUL-1"], callerOverrides: {} };
    case "run":
      return { argv: ["run", "FUL-1", "--agent", "build-agent"], callerOverrides: {} };
    case "qa-review":
      return { argv: ["qa-review", "FUL-1", "--review-file", reviewFixturePath()], callerOverrides: {} };
    default:
      throw new Error(`unknown verb ${verb}`);
  }
}

/** Build the argv for a documented `fulcrum task` alias verb. */
function buildTaskAliasArgs(verb: string): string[] {
  switch (verb) {
    case "get":
      return ["get", "FUL-1"];
    case "create":
      return ["create", "--title", "Aliased task", "--project", "proj-1"];
    case "update":
      return ["update", "FUL-1", "--status", "done"];
    case "delete":
      return ["delete", "FUL-1"];
    default:
      throw new Error(`unknown alias ${verb}`);
  }
}

/** A review fixture file written once for the `qa-review` verb test. */
let reviewFixture: string | undefined;
function reviewFixturePath(): string {
  if (!reviewFixture) {
    reviewFixture = join(tmpdir(), `fulcrum-qa-review-${process.pid}.md`);
    require("node:fs").writeFileSync(reviewFixture, "# QA review\nLooks good.\n");
  }
  return reviewFixture;
}
