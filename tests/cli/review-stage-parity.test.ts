/**
 * Review-stage CLI verb parity (`prd-cli-review-stage-parity`).
 *
 * Asserts the full `CLI-TUI-UX.md` §1.4 Review grammar — `review`, `qa`,
 * `uat`, `e2e` — dispatches the right verb to the API caller, and that every
 * verb emits the canonical `fulcrum.cli.v1` envelope under `--json` while plain
 * output stays followable. The envelope is validated against the locked 12-key
 * shape via `isCanonicalEnvelope`.
 */

import { describe, expect, test } from "bun:test";

import {
  isCanonicalEnvelope,
  ENVELOPE_SCHEMA,
} from "../../apps/cli/src/lib/envelope.ts";
import {
  REVIEW_STAGE_VERBS,
  run,
  type ReviewStageCaller,
  type ReviewStageResult,
} from "../../apps/cli/src/commands/review-stage.ts";

const TRACE = "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e";

function resultFor(
  domain: ReviewStageResult["domain"],
  verb: string,
  subjectId: string | null,
  traceId: string,
  details?: Record<string, unknown>,
): ReviewStageResult {
  return {
    domain,
    verb,
    subjectId,
    status: domain === "review" && verb === "approve" ? "approved" : "pending",
    traceId,
    message: `${domain} ${verb} ok`,
    details,
  };
}

/** Records every caller invocation so dispatch can be asserted verb-by-verb. */
function fakeCaller(): ReviewStageCaller & { calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  const record = (
    name: string,
    domain: ReviewStageResult["domain"],
    verb: string,
    subjectId: string | null,
    input: { traceId?: string },
    details?: Record<string, unknown>,
  ) => {
    calls.push([name, input]);
    return resultFor(domain, verb, subjectId, input.traceId ?? TRACE, details);
  };
  return {
    calls,
    review: {
      list: async (input) =>
        record("review.list", "review", "list", null, input, {
          items: [{ reviewId: "r-1", title: "Build board fix", status: "open", reviewerId: "u-1" }],
        }) as ReviewStageResult & { details: { items: never[] } },
      view: async (input) => record("review.view", "review", "view", input.reviewId, input),
      approve: async (input) => record("review.approve", "review", "approve", input.reviewId, input),
      requestChanges: async (input) =>
        record("review.requestChanges", "review", "request-changes", input.reviewId, input),
    },
    qa: {
      run: async (input) => record("qa.run", "qa", "run", input.taskId, input),
      report: async (input) => record("qa.report", "qa", "report", input.taskId, input),
    },
    uat: {
      run: async (input) => record("uat.run", "uat", "run", input.taskId, input),
      handoff: async (input) => record("uat.handoff", "uat", "handoff", input.taskId, input),
      decision: async (input) => record("uat.decision", "uat", "decision", input.taskId, input),
    },
    e2e: {
      run: async (input) => record("e2e.run", "e2e", "run", input.projectId, input),
      report: async (input) => record("e2e.report", "e2e", "report", input.runId, input),
    },
  };
}

describe("fulcrum Review-stage command tree (CLI-TUI-UX §1.4)", () => {
  test("declares every CLI-TUI-UX §1.4 verb per domain", () => {
    expect(REVIEW_STAGE_VERBS.review).toEqual(["list", "view", "approve", "request-changes"]);
    expect(REVIEW_STAGE_VERBS.qa).toEqual(["run", "report"]);
    expect(REVIEW_STAGE_VERBS.uat).toEqual(["run", "handoff", "decision"]);
    expect(REVIEW_STAGE_VERBS.e2e).toEqual(["run", "report"]);
  });

  test("fulcrum review list/view/approve/request-changes dispatch to the caller", async () => {
    const caller = fakeCaller();
    const opts = { caller, print: () => {}, printErr: () => {}, exit: () => {} };

    await run("review", ["list", "--status", "open", "--reviewer", "u-1"], opts);
    await run("review", ["view", "r-2"], opts);
    await run("review", ["approve", "r-3", "--message", "ship it"], opts);
    await run("review", ["request-changes", "r-4", "--message", "fix tests"], opts);

    expect(caller.calls.map(([name]) => name)).toEqual([
      "review.list",
      "review.view",
      "review.approve",
      "review.requestChanges",
    ]);
    expect(caller.calls[0]?.[1]).toMatchObject({ status: "open", reviewerId: "u-1" });
    expect(caller.calls[2]?.[1]).toMatchObject({ reviewId: "r-3", message: "ship it" });
  });

  test("fulcrum qa run/report dispatch to the caller", async () => {
    const caller = fakeCaller();
    const opts = { caller, print: () => {}, printErr: () => {}, exit: () => {} };

    await run("qa", ["run", "--task", "t-9"], opts);
    await run("qa", ["report", "--task", "t-9", "--format", "json"], opts);

    expect(caller.calls.map(([name]) => name)).toEqual(["qa.run", "qa.report"]);
    expect(caller.calls[1]?.[1]).toMatchObject({ taskId: "t-9", format: "json" });
  });

  test("fulcrum uat run/handoff/decision dispatch to the caller", async () => {
    const caller = fakeCaller();
    const opts = { caller, print: () => {}, printErr: () => {}, exit: () => {} };

    await run("uat", ["run", "--task", "t-1"], opts);
    await run("uat", ["handoff", "t-1"], opts);
    await run("uat", ["decision", "t-1", "--decision", "approve", "--feedback", "good"], opts);

    expect(caller.calls.map(([name]) => name)).toEqual(["uat.run", "uat.handoff", "uat.decision"]);
    expect(caller.calls[2]?.[1]).toMatchObject({
      taskId: "t-1",
      decision: "approve",
      feedback: "good",
    });
  });

  test("fulcrum e2e run/report dispatch to the caller", async () => {
    const caller = fakeCaller();
    const opts = { caller, print: () => {}, printErr: () => {}, exit: () => {} };

    await run("e2e", ["run", "--project", "fulcrum", "--runner", "playwright", "--plan-only"], opts);
    await run("e2e", ["report", "run-77"], opts);

    expect(caller.calls.map(([name]) => name)).toEqual(["e2e.run", "e2e.report"]);
    expect(caller.calls[0]?.[1]).toMatchObject({
      projectId: "fulcrum",
      runner: "playwright",
      planOnly: true,
    });
    expect(caller.calls[1]?.[1]).toMatchObject({ runId: "run-77" });
  });

  test("every Review verb emits the canonical fulcrum.cli.v1 --json envelope", async () => {
    const caller = fakeCaller();
    const invocations: Array<[ReviewStageResult["domain"], string[]]> = [
      ["review", ["list", "--json", "--trace", TRACE]],
      ["review", ["view", "r-2", "--json", "--trace", TRACE]],
      ["review", ["approve", "r-3", "--json", "--trace", TRACE]],
      ["review", ["request-changes", "r-4", "--message", "fix", "--json", "--trace", TRACE]],
      ["qa", ["run", "--task", "t-9", "--json", "--trace", TRACE]],
      ["qa", ["report", "--task", "t-9", "--json", "--trace", TRACE]],
      ["uat", ["run", "--task", "t-1", "--json", "--trace", TRACE]],
      ["uat", ["handoff", "t-1", "--json", "--trace", TRACE]],
      ["uat", ["decision", "t-1", "--decision", "reject", "--json", "--trace", TRACE]],
      ["e2e", ["run", "--project", "fulcrum", "--json", "--trace", TRACE]],
      ["e2e", ["report", "run-77", "--json", "--trace", TRACE]],
    ];

    for (const [domain, argv] of invocations) {
      const lines: string[] = [];
      await run(domain, argv, {
        caller,
        print: (line) => lines.push(line),
        printErr: () => {},
        exit: () => {},
      });
      const envelope = JSON.parse(lines[0] as string);
      // The canonical 12-key envelope shape — schema + trace_id + arrays.
      expect(isCanonicalEnvelope(envelope)).toBe(true);
      expect(envelope.schema).toBe(ENVELOPE_SCHEMA);
      expect(envelope.schema).toBe("fulcrum.cli.v1");
      expect(envelope.trace_id).toBe(TRACE);
      expect(envelope.command).toBe(`fulcrum ${domain} ${argv[0]}`);
      expect(Array.isArray(envelope.errors)).toBe(true);
      expect(Array.isArray(envelope.next_actions)).toBe(true);
      expect(envelope.result.domain).toBe(domain);
      expect(envelope.result.traceId).toBe(TRACE);
    }
  });

  test("plain output carries the DESIGN.md §4.10 trace line with the envelope trace id", async () => {
    const caller = fakeCaller();
    const plain: string[] = [];
    await run("review", ["approve", "r-9", "--trace", TRACE], {
      caller,
      print: (line) => plain.push(line),
      printErr: () => {},
      exit: () => {},
    });
    const traceLine = plain.find((line) => line.startsWith("trace:"));
    expect(traceLine).toBeDefined();
    // The plain trace line shows the SAME identity the --json envelope carries.
    expect(traceLine).toContain(TRACE.slice(0, 8));

    const json: string[] = [];
    await run("review", ["approve", "r-9", "--trace", TRACE, "--json"], {
      caller,
      print: (line) => json.push(line),
      printErr: () => {},
      exit: () => {},
    });
    expect(JSON.parse(json[0] as string).trace_id).toBe(TRACE);
  });

  test("a failed Review verb keeps the error inside the canonical envelope", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];
    let exitCode: number | undefined;
    await run("uat", ["decision", "t-1", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: (code) => {
        exitCode = code;
      },
    });
    expect(exitCode).toBe(1);
    const envelope = JSON.parse(lines[0] as string);
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.result).toBeNull();
    expect(envelope.errors).toHaveLength(1);
    expect(envelope.errors[0].code).toBe("FUL_REVIEW_FAILED");
  });

  test("an unknown Review verb fails with exit 2 and lists the known verbs", async () => {
    const errors: string[] = [];
    let exitCode: number | undefined;
    await run("qa", ["bogus", "--task", "t-1"], {
      caller: fakeCaller(),
      print: () => {},
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });
    expect(exitCode).toBe(2);
    expect(errors.join("\n")).toContain("fulcrum qa: unknown verb 'bogus'");
    expect(errors.join("\n")).toContain("Known qa verbs: run, report");
  });

  test("validates --decision, --status, --runner, and --format inputs", async () => {
    const caller = fakeCaller();
    const opts = { caller, print: () => {}, printErr: () => {}, exit: () => {} };

    for (const argv of [
      ["decision", "t-1", "--decision", "maybe"],
    ]) {
      let exitCode: number | undefined;
      await run("uat", argv, { ...opts, exit: (c) => { exitCode = c; } });
      expect(exitCode).toBe(1);
    }

    let statusExit: number | undefined;
    await run("review", ["list", "--status", "merged"], { ...opts, exit: (c) => { statusExit = c; } });
    expect(statusExit).toBe(1);

    let runnerExit: number | undefined;
    await run("e2e", ["run", "--project", "p", "--runner", "vitest"], { ...opts, exit: (c) => { runnerExit = c; } });
    expect(runnerExit).toBe(1);
  });

  test("review list --json envelope carries the queue rows in .result.details.items", async () => {
    const caller = fakeCaller();
    const lines: string[] = [];
    await run("review", ["list", "--json", "--trace", TRACE], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });
    const envelope = JSON.parse(lines[0] as string);
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.result.details.items).toHaveLength(1);
    expect(envelope.result.details.items[0]).toMatchObject({ reviewId: "r-1", status: "open" });
  });

  test("no injected caller and no API env fails with recovery copy", async () => {
    const errors: string[] = [];
    let exitCode: number | undefined;
    await run("review", ["view", "r-1"], {
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
    expect(errors.join("\n")).toContain("Review API caller is not configured");
  });
});
