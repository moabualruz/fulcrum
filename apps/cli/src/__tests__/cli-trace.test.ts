/**
 * CLI trace spine contract test (`prd-cli-trace-spine-v1`).
 *
 * Proves the `DESIGN.md` §4.10 cross-surface trace spine in CLI plain output:
 *
 *  - run-bearing commands print a stable `trace: …  run: …  project: …` header
 *    line in plain (non-`--json`) mode — asserted for one command per stage;
 *  - the trace id printed in plain mode is the SAME id the `fulcrum.cli.v1`
 *    JSON envelope carries for the same invocation (trace continuity);
 *  - error output prints the `COPY.md` §3 recovery block (`Fix:` + `trace=<id>`);
 *  - the line respects `--no-color`, `NO_COLOR`, `FULCRUM_NO_COLOR`, `TERM=dumb`,
 *    and non-TTY conditions (`CLI-TUI-UX.md` §2.3).
 *
 * Stage coverage (one run-bearing command each):
 *  - Capture   → `fulcrum capture status`
 *  - Build     → `fulcrum runs list`
 *  - Operate   → `fulcrum flags list`
 *  - AI Assist → `fulcrum ai start`
 */

import { describe, expect, test } from "bun:test";

import { run as runCapture } from "../commands/capture.ts";
import { run as runAi } from "../commands/ai.ts";
import { runPillar14Command } from "../commands/pillar14-generated.ts";
import {
  formatErrorRecovery,
  formatTraceLine,
  isColorEnabled,
} from "../lib/trace-line.ts";

const TRACE_RE = /^trace: [0-9a-f]{8}…(  span: [0-9a-f]+…?)?(  run: \S+)?(  project: \S+)?$/;
const FIXED_TRACE = "0123456789abcdef0123456789abcdef";

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

/** The plain trace line is always present before content for a run-bearing command. */
function traceLineOf(lines: readonly string[]): string {
  return lines.find((line) => line.startsWith("trace:")) ?? "";
}

function captureCaller() {
  return {
    capture: {
      submitReview: async () => ({
        captureId: "cap-1",
        status: "review" as const,
        action: "review" as const,
        traceId: FIXED_TRACE,
        message: "Review note saved",
      }),
      setStatus: async (input: { captureId: string; status: "triage" | "review" | "approved" }) => ({
        captureId: input.captureId,
        status: input.status,
        action: "status" as const,
        traceId: FIXED_TRACE,
        message: `Status set to ${input.status}`,
      }),
      runQuickAction: async () => ({
        captureId: "cap-1",
        status: "review" as const,
        action: "assign" as const,
        traceId: FIXED_TRACE,
        message: "Quick action assign queued",
      }),
    },
  };
}

function runsCaller() {
  return {
    runs: {
      list: async () => [{ id: "run-1", status: "running" }],
      get: async () => null,
    },
    flags: {
      list: async () => [{ name: "router-llm", enabled: false }],
    },
  };
}

describe("trace-line module — DESIGN.md §4.10 plain header", () => {
  test("formatTraceLine renders trace/run/project with an 8-char truncated id", () => {
    const line = formatTraceLine(
      { trace_id: FIXED_TRACE, span_id: "8b2d4a6f9c1e3a5b", run_id: "01HXYZ123ABC", project_id: "fulcrum" },
      { env: {}, isTty: false } as never,
    );
    expect(line).toBe("trace: 01234567…  run: 01HXYZ12…  project: fulcrum");
    expect(line).toMatch(TRACE_RE);
  });

  test("formatTraceLine omits run/project when the invocation has none", () => {
    const line = formatTraceLine(
      { trace_id: FIXED_TRACE, span_id: "8b2d4a6f9c1e3a5b", run_id: null, project_id: null },
      { env: {}, isTty: false } as never,
    );
    expect(line).toBe("trace: 01234567…");
  });

  test("formatTraceLine adds the span segment when withSpan is set", () => {
    const line = formatTraceLine(
      { trace_id: FIXED_TRACE, span_id: "8b2d4a6f9c1e3a5b", run_id: null, project_id: null },
      { withSpan: true, env: {}, isTty: false } as never,
    );
    expect(line).toBe("trace: 01234567…  span: 8b2d4a6f…");
  });

  test("trace line is plain ASCII apart from the ellipsis — copy-pasteable", () => {
    const line = formatTraceLine(
      { trace_id: FIXED_TRACE, span_id: "abc", run_id: "run-9", project_id: "fulcrum" },
      { env: {}, isTty: false } as never,
    );
    // No ANSI escape sequences leak into a non-TTY / colour-disabled line.
    expect(line.includes("")).toBe(false);
  });
});

describe("colour-disable conditions — CLI-TUI-UX.md §2.3", () => {
  test("non-TTY disables colour", () => {
    expect(isColorEnabled({ env: {}, isTty: false })).toBe(false);
  });

  test("--no-color flag disables colour", () => {
    expect(isColorEnabled({ env: {}, argv: ["--no-color"], isTty: true })).toBe(false);
  });

  test("NO_COLOR set (even empty) disables colour", () => {
    expect(isColorEnabled({ env: { NO_COLOR: "" }, isTty: true })).toBe(false);
  });

  test("FULCRUM_NO_COLOR set disables colour", () => {
    expect(isColorEnabled({ env: { FULCRUM_NO_COLOR: "1" }, isTty: true })).toBe(false);
  });

  test("TERM=dumb disables colour", () => {
    expect(isColorEnabled({ env: { TERM: "dumb" }, isTty: true })).toBe(false);
  });

  test("a real TTY with no opt-out enables colour", () => {
    expect(isColorEnabled({ env: { TERM: "xterm-256color" }, isTty: true })).toBe(true);
  });

  test("formatTraceLine emits no ANSI when colour is disabled", () => {
    const noColour = formatTraceLine(
      { trace_id: FIXED_TRACE, span_id: "abc", run_id: null, project_id: null },
      { argv: ["--no-color"], env: { TERM: "xterm" }, isTty: true } as never,
    );
    expect(noColour.includes("")).toBe(false);
    expect(noColour).toBe("trace: 01234567…");
  });

  test("formatTraceLine emits dim ANSI on a colour-enabled TTY", () => {
    const coloured = formatTraceLine(
      { trace_id: FIXED_TRACE, span_id: "abc", run_id: null, project_id: null },
      { env: { TERM: "xterm" }, isTty: true } as never,
    );
    expect(coloured.includes("[2m")).toBe(true);
  });
});

describe("error recovery block — COPY.md §3 / CLI-TUI-UX.md §5", () => {
  test("formatErrorRecovery prints message, Fix, and trace=<id>", () => {
    const block = formatErrorRecovery(
      { code: "FUL_AUTH_REQUIRED", message: "Authentication required.", fix: "fulcrum auth login" },
      { traceId: FIXED_TRACE, env: {}, isTty: false } as never,
    );
    expect(block).toBe(
      ["Authentication required.", "  Fix: fulcrum auth login", `  trace=${FIXED_TRACE}`].join("\n"),
    );
  });

  test("formatErrorRecovery always ends with the full untruncated trace id", () => {
    const block = formatErrorRecovery(
      { code: "FUL_X", message: "Boom." },
      { traceId: FIXED_TRACE, env: {}, isTty: false } as never,
    );
    expect(block.endsWith(`  trace=${FIXED_TRACE}`)).toBe(true);
  });
});

describe("plain trace line per stage — run-bearing commands", () => {
  test("Capture stage — `fulcrum capture status` prints a plain trace line", async () => {
    const io = captureLines();
    await runCapture(["status", "cap-1", "--status", "approved", "--no-color"], {
      caller: captureCaller(),
      env: {} as never,
      ...io.opts,
    });
    const line = traceLineOf(io.lines);
    expect(line).toMatch(TRACE_RE);
    // The result's own 32-hex trace id appears truncated in the plain line.
    expect(line).toBe("trace: 01234567…");
  });

  test("Build stage — `fulcrum runs list` prints a plain trace line", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["list", "--no-color"], {
      caller: runsCaller(),
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...io.opts,
    });
    expect(traceLineOf(io.lines)).toBe("trace: 01234567…");
  });

  test("Operate stage — `fulcrum flags list` prints a plain trace line", async () => {
    const io = captureLines();
    await runPillar14Command("flags", ["list", "--no-color"], {
      caller: runsCaller(),
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...io.opts,
    });
    expect(traceLineOf(io.lines)).toBe("trace: 01234567…");
  });

  test("AI Assist stage — `fulcrum ai start` prints a plain trace line", async () => {
    const io = captureLines();
    await runAi(["start", "--task", "task-1", "--title", "Ship drawer", "--no-color"], {
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...io.opts,
    });
    expect(traceLineOf(io.lines)).toBe("trace: 01234567…");
  });
});

describe("trace continuity — plain line matches the JSON envelope", () => {
  test("Build stage — plain trace line carries the same trace id as `--json`", async () => {
    const jsonIo = captureLines();
    const plainIo = captureLines();
    await runPillar14Command("runs", ["list", "--json"], {
      caller: runsCaller(),
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...jsonIo.opts,
    });
    await runPillar14Command("runs", ["list", "--no-color"], {
      caller: runsCaller(),
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...plainIo.opts,
    });
    const envelope = JSON.parse(jsonIo.lines[0]!) as { trace_id: string };
    // The plain header shows the 8-char prefix of the envelope's trace_id.
    expect(traceLineOf(plainIo.lines)).toBe(`trace: ${envelope.trace_id.slice(0, 8)}…`);
    expect(envelope.trace_id).toBe(FIXED_TRACE);
  });

  test("Capture stage — plain line and envelope share the result trace id", async () => {
    const jsonIo = captureLines();
    const plainIo = captureLines();
    await runCapture(["status", "cap-1", "--status", "review", "--json"], {
      caller: captureCaller(),
      env: {} as never,
      ...jsonIo.opts,
    });
    await runCapture(["status", "cap-1", "--status", "review", "--no-color"], {
      caller: captureCaller(),
      env: {} as never,
      ...plainIo.opts,
    });
    const envelope = JSON.parse(jsonIo.lines[0]!) as { trace_id: string };
    expect(envelope.trace_id).toBe(FIXED_TRACE);
    expect(traceLineOf(plainIo.lines)).toBe(`trace: ${envelope.trace_id.slice(0, 8)}…`);
  });
});

describe("error path — recovery copy plus trace reference", () => {
  test("`fulcrum runs show <missing>` plain error prints recovery copy + trace=<id>", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["show", "missing"], {
      caller: { runs: { list: async () => [], get: async () => null } },
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...io.opts,
    });
    const stderr = io.errLines.join("\n");
    // COPY.md §3 template: message, then a `Fix:` action, then `trace=<id>`.
    expect(stderr).toContain("missing");
    expect(stderr).toContain("Fix:");
    expect(stderr).toContain(`trace=${FIXED_TRACE}`);
    expect(io.exitCode).toBe(1);
  });

  test("plain error trace id matches the `--json` envelope error trace id", async () => {
    const jsonIo = captureLines();
    const plainIo = captureLines();
    await runPillar14Command("runs", ["show", "missing", "--json"], {
      caller: { runs: { list: async () => [], get: async () => null } },
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...jsonIo.opts,
    });
    await runPillar14Command("runs", ["show", "missing"], {
      caller: { runs: { list: async () => [], get: async () => null } },
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...plainIo.opts,
    });
    const envelope = JSON.parse(jsonIo.lines[0]!) as {
      trace_id: string;
      errors: Array<{ trace_id?: string }>;
    };
    expect(envelope.errors[0]!.trace_id).toBe(FIXED_TRACE);
    expect(plainIo.errLines.join("\n")).toContain(`trace=${envelope.trace_id}`);
  });

  test("plain error block carries no ANSI when --no-color is passed", async () => {
    const io = captureLines();
    await runPillar14Command("runs", ["show", "missing", "--no-color"], {
      caller: { runs: { list: async () => [], get: async () => null } },
      env: { FULCRUM_TRACE_ID: FIXED_TRACE } as never,
      ...io.opts,
    });
    expect(io.errLines.join("\n").includes("")).toBe(false);
  });
});
