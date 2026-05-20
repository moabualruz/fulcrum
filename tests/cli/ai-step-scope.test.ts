/**
 * CLI AI Assist Step-scope parity (`prd-cli-ai-assist-step-scope`).
 *
 * Proves that `fulcrum ai start` is anchored to a Step the way the OD
 * `ai-assist.html` drawer is — its header reads `Step 3 / 8 · …` and `@scope`
 * attaches the current step. The CLI mirror:
 *
 *  - accepts `--step <step-id>` (a bare step id, NOT a `<stage>/<id>` ref) and
 *    echoes the resolved Step scope in both plain and `--json` output;
 *  - carries the SAME trace identity as the originating Step run — the trace
 *    id propagates via `FULCRUM_TRACE_ID` so the session is followable in the
 *    web drawer / TUI `:ai` pane by one id (DESIGN.md §4.10);
 *  - wraps `--json` output in the canonical `fulcrum.cli.v1` envelope
 *    (`prd-cli-json-envelope-v1`);
 *  - prints the COPY.md §3 recovery block on provider / rate / permission
 *    failure (message + `Fix:` action + `trace=<id>`).
 *
 * No production mocks: the command takes injectable `print`/`printErr`/`exit`
 * sinks and an `env` seam — the same seams the real CLI entrypoint passes.
 */

import { describe, expect, test } from "bun:test";

import { run as runAi } from "@fulcrum/cli/commands/ai.ts";
import { ENVELOPE_SCHEMA } from "@fulcrum/cli/lib/envelope.ts";

/** A 32-hex trace id used to prove cross-surface trace continuity. */
const STEP_RUN_TRACE_ID = "4f3a1c9e2b7d6a8c4f3a1c9e2b7d6a8c";

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

/** Capture every `fulcrum ai` output stream for one invocation. */
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

describe("fulcrum ai — Step scope + trace continuity", () => {
  test("`--step` is echoed as the resolved Step scope in plain output", async () => {
    const io = captureLines();
    await runAi(
      ["start", "--task", "task-1", "--title", "Persist issuance row", "--step", "step-3"],
      io.opts,
    );

    // The CLI analog of the OD drawer header `Step 3 / 8 · …` — the resolved
    // Step scope is echoed before the session object.
    expect(io.lines[0]).toBe("AI Assist scoped to step step-3");
    expect(io.exitCode).toBeUndefined();
  });

  test("`--step` Step scope rides in the `--json` fulcrum.cli.v1 envelope", async () => {
    const io = captureLines();
    await runAi(
      ["start", "--task", "task-1", "--title", "Persist issuance row", "--step", "step-3", "--json"],
      io.opts,
    );

    const envelope = JSON.parse(io.lines[0]!) as Record<string, unknown>;
    // The canonical 12-key envelope from prd-cli-json-envelope-v1.
    expect(Object.keys(envelope).sort()).toEqual([...CANONICAL_KEYS].sort());
    expect(envelope["schema"]).toBe(ENVELOPE_SCHEMA);
    expect(envelope["command"]).toBe("fulcrum ai start");
    // The Step scope rides in `args` alongside the trace identity — scope and
    // trace travel together.
    expect(envelope["args"]).toMatchObject({ task: "task-1", step: "step-3" });
    // …and the session `result` echoes the same resolved Step scope.
    expect(envelope["result"]).toMatchObject({ taskId: "task-1", stepScope: "step-3" });
  });

  test("AI Assist session carries the originating Step run's trace identity", async () => {
    const jsonIo = captureLines();
    const plainIo = captureLines();
    // `FULCRUM_TRACE_ID` is the trace id of the originating Step run — the AI
    // Assist session must inherit it so it is followable in web / TUI.
    const env = { FULCRUM_TRACE_ID: STEP_RUN_TRACE_ID };
    await runAi(
      ["start", "--task", "task-1", "--title", "Persist issuance row", "--step", "step-3", "--json"],
      { ...jsonIo.opts, env },
    );
    await runAi(
      ["start", "--task", "task-1", "--title", "Persist issuance row", "--step", "step-3"],
      { ...plainIo.opts, env },
    );

    const envelope = JSON.parse(jsonIo.lines[0]!) as Record<string, unknown>;
    // The envelope trace id IS the Step run's trace id — trace continuity.
    expect(envelope["trace_id"]).toBe(STEP_RUN_TRACE_ID);
    // The plain-output trace header line carries the same trace id (truncated
    // to the DESIGN.md §4.10 8-char prefix) — one identity across both modes.
    const traceLine = plainIo.lines.find((l) => l.startsWith("trace:"));
    expect(traceLine).toBeDefined();
    expect(traceLine).toContain(STEP_RUN_TRACE_ID.slice(0, 8));
  });

  test("a stage-qualified `--step` ref is rejected — scope is a bare step id", async () => {
    const io = captureLines();
    await runAi(
      ["start", "--task", "task-1", "--title", "Persist issuance row", "--step", "plan/step-3"],
      io.opts,
    );

    expect(io.exitCode).toBe(2);
    expect(io.errLines.join("\n")).toContain("bare step id");
  });

  test("provider / rate / permission failures print COPY.md recovery copy", async () => {
    for (const kind of ["provider", "rate", "permission"] as const) {
      const io = captureLines();
      await runAi(
        [
          "start",
          "--task",
          "task-1",
          "--title",
          "Persist issuance row",
          "--step",
          "step-3",
          "--fail",
          kind,
        ],
        { ...io.opts, env: { FULCRUM_TRACE_ID: STEP_RUN_TRACE_ID } },
      );

      const recovery = io.errLines.join("\n");
      // COPY.md §3: name the recovery action (`Fix:`) and echo the trace id.
      // Ban-list: "Something went wrong" / "Please try again" / "Contact support".
      expect(recovery).toContain("Fix:");
      expect(recovery).toContain(`trace=${STEP_RUN_TRACE_ID}`);
      expect(recovery).not.toContain("Something went wrong");
      expect(recovery).not.toContain("Please try again");
      expect(recovery).not.toContain("Contact support");
      expect(io.exitCode).toBe(1);
    }
  });

  test("a failed `--json` AI Assist run stays inside the envelope with a coded error", async () => {
    const io = captureLines();
    await runAi(
      [
        "start",
        "--task",
        "task-1",
        "--title",
        "Persist issuance row",
        "--step",
        "step-3",
        "--fail",
        "rate",
        "--json",
      ],
      io.opts,
    );

    const envelope = JSON.parse(io.lines[0]!) as Record<string, unknown>;
    expect(envelope["schema"]).toBe(ENVELOPE_SCHEMA);
    expect(envelope["result"]).toBeNull();
    const errors = envelope["errors"] as Array<{ code: string; context?: { step?: string } }>;
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("FUL_AI_RATE_LIMITED");
    // The error keeps the Step scope so a failure is still attributable to its Step.
    expect(errors[0]!.context?.step).toBe("step-3");
  });

  test("`--step` omitted — scope falls back to the task id, never unscoped", async () => {
    const io = captureLines();
    await runAi(["start", "--task", "task-9", "--title", "Persist issuance row"], io.opts);

    expect(io.lines[0]).toBe("AI Assist scoped to step task-9");
    expect(io.exitCode).toBeUndefined();
  });
});
