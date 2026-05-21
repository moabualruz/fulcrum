/**
 * TDD: fulcrum symphony CLI surface parity (P3#19).
 *
 * All commands tested via dependency-injected caller stubs.
 */

import { describe, expect, it } from "bun:test";
import { run, type SymphonyCaller } from "./symphony.ts";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode: number | undefined;
  return {
    out,
    err,
    exitCode: () => exitCode,
    opts: {
      print: (l: string) => out.push(l),
      printErr: (l: string) => err.push(l),
      exit: (c: number) => { exitCode = c; },
    },
  };
}

function stubCaller(overrides: Partial<SymphonyCaller> = {}): SymphonyCaller {
  return {
    getOrchestratorStatus: async () => ({ running: 2, queued: 5, stalled: 0 }),
    listRuns: async () => [],
    getRun: async () => null,
    cancelRun: async () => ({ success: true }),
    retryRun: async () => ({ success: true }),
    syncDaily: async () => ({ synced: 3, errors: 0 }),
    dispatchRun: async () => ({ runId: "r-stub", state: "unclaimed", agent: "codex", sandboxMode: "noSandbox" }),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* symphony help                                                       */
/* ------------------------------------------------------------------ */

describe("symphony help", () => {
  it("prints help on no args", async () => {
    const h = harness();
    await run([], { ...h.opts, caller: stubCaller() });
    expect(h.out.join("\n")).toContain("fulcrum symphony");
  });
});

/* ------------------------------------------------------------------ */
/* symphony status                                                     */
/* ------------------------------------------------------------------ */

describe("symphony status", () => {
  it("prints human-readable status", async () => {
    const h = harness();
    await run(["status"], { ...h.opts, caller: stubCaller() });
    const text = h.out.join("\n");
    expect(text).toContain("Running");
    expect(text).toContain("2");
    expect(text).toContain("Queued");
    expect(text).toContain("5");
  });

  it("prints JSON with --json", async () => {
    const h = harness();
    await run(["status", "--json"], { ...h.opts, caller: stubCaller() });
    const parsed = JSON.parse(h.out[0]!);
    expect(parsed).toEqual({ running: 2, queued: 5, stalled: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* symphony sync                                                       */
/* ------------------------------------------------------------------ */

describe("symphony sync", () => {
  it("calls syncDaily and prints result", async () => {
    const h = harness();
    const calls: unknown[] = [];
    await run(["sync", "--daily"], {
      ...h.opts,
      caller: stubCaller({
        syncDaily: async () => { calls.push("daily"); return { synced: 7, errors: 1 }; },
      }),
    });
    expect(calls).toEqual(["daily"]);
    expect(h.out.join("\n")).toContain("7");
  });

  it("returns JSON with --json", async () => {
    const h = harness();
    await run(["sync", "--daily", "--json"], {
      ...h.opts,
      caller: stubCaller(),
    });
    const parsed = JSON.parse(h.out[0]!);
    expect(parsed).toEqual({ synced: 3, errors: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* symphony runs list                                                  */
/* ------------------------------------------------------------------ */

describe("symphony runs list", () => {
  it("outputs valid JSON array with --json", async () => {
    const h = harness();
    await run(["runs", "list", "--json"], {
      ...h.opts,
      caller: stubCaller({
        listRuns: async () => [
          { id: "r1", state: "running", attemptCount: 1, startedAt: "2026-01-01T00:00:00Z" },
        ],
      }),
    });
    const parsed = JSON.parse(h.out[0]!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("r1");
  });

  it("filters by --state running", async () => {
    const h = harness();
    const calls: unknown[] = [];
    await run(["runs", "list", "--state", "running", "--json"], {
      ...h.opts,
      caller: stubCaller({
        listRuns: async (input) => {
          calls.push(input);
          return [];
        },
      }),
    });
    expect(calls[0]).toEqual(expect.objectContaining({ state: "running" }));
  });

  it("filters by --project", async () => {
    const h = harness();
    const calls: unknown[] = [];
    await run(["runs", "list", "--project", "proj-1", "--json"], {
      ...h.opts,
      caller: stubCaller({
        listRuns: async (input) => {
          calls.push(input);
          return [];
        },
      }),
    });
    expect(calls[0]).toEqual(expect.objectContaining({ projectId: "proj-1" }));
  });
});

/* ------------------------------------------------------------------ */
/* symphony runs show                                                  */
/* ------------------------------------------------------------------ */

describe("symphony runs show", () => {
  it("prints run details as JSON", async () => {
    const h = harness();
    await run(["runs", "show", "r1", "--json"], {
      ...h.opts,
      caller: stubCaller({
        getRun: async (input) => {
          expect(input).toEqual({ runId: "r1" });
          return {
            id: "r1",
            state: "running",
            attemptCount: 2,
            nextRetryAt: null,
            lastErrorKind: null,
            workspacePath: "/tmp/ws",
            renderedPrompt: null,
          };
        },
      }),
    });
    const parsed = JSON.parse(h.out[0]!);
    expect(parsed.id).toBe("r1");
    expect(parsed.workspacePath).toBe("/tmp/ws");
  });

  it("prints verbose prompt excerpt", async () => {
    const h = harness();
    await run(["runs", "show", "r1", "--verbose"], {
      ...h.opts,
      caller: stubCaller({
        getRun: async () => ({
          id: "r1",
          state: "running",
          renderedPrompt: "Fix the login bug",
        }),
      }),
    });
    const text = h.out.join("\n");
    expect(text).toContain("RENDERED PROMPT");
    expect(text).toContain("Fix the login bug");
  });

  it("errors on missing runId", async () => {
    const h = harness();
    await run(["runs", "show"], { ...h.opts, caller: stubCaller() });
    expect(h.exitCode()).toBe(2);
    expect(h.err.join("\n")).toContain("missing");
  });

  it("errors when run not found", async () => {
    const h = harness();
    await run(["runs", "show", "nope", "--json"], {
      ...h.opts,
      caller: stubCaller({ getRun: async () => null }),
    });
    expect(h.exitCode()).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* symphony runs cancel                                                */
/* ------------------------------------------------------------------ */

describe("symphony runs cancel", () => {
  it("returns {success:true} as JSON", async () => {
    const h = harness();
    const calls: unknown[] = [];
    await run(["runs", "cancel", "r1", "--json"], {
      ...h.opts,
      caller: stubCaller({
        cancelRun: async (input) => {
          calls.push(input);
          return { success: true };
        },
      }),
    });
    expect(calls).toEqual([{ runId: "r1" }]);
    expect(JSON.parse(h.out[0]!)).toEqual({ success: true });
  });

  it("errors on missing runId", async () => {
    const h = harness();
    await run(["runs", "cancel"], { ...h.opts, caller: stubCaller() });
    expect(h.exitCode()).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* symphony runs retry                                                 */
/* ------------------------------------------------------------------ */

describe("symphony runs retry", () => {
  it("returns {success:true} as JSON", async () => {
    const h = harness();
    await run(["runs", "retry", "r1", "--json"], {
      ...h.opts,
      caller: stubCaller(),
    });
    expect(JSON.parse(h.out[0]!)).toEqual({ success: true });
  });
});

/* ------------------------------------------------------------------ */
/* symphony conformance                                                */
/* ------------------------------------------------------------------ */

describe("symphony conformance", () => {
  it("outputs per-section pass/fail array as JSON", async () => {
    const h = harness();
    await run(["conformance", "--json"], {
      ...h.opts,
      // conformance is hand-rolled, no caller needed: uses subprocess
      caller: stubCaller(),
      // inject a stub conformance runner
      runConformanceCheck: async () => ({
        sections: [
          { section: "§4.1 State Machine", pass: true },
          { section: "§4.2 Hooks", pass: true },
          { section: "§4.3 Retry", pass: false, reason: "missing backoff test" },
        ],
        pass: false,
      }),
    });
    const parsed = JSON.parse(h.out[0]!);
    expect(Array.isArray(parsed.sections)).toBe(true);
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.pass).toBe(false);
    expect(parsed.sections[2].pass).toBe(false);
  });

  it("prints human-readable PASS/FAIL per section", async () => {
    const h = harness();
    await run(["conformance", "--verbose"], {
      ...h.opts,
      caller: stubCaller(),
      runConformanceCheck: async () => ({
        sections: [
          { section: "§4.1 State Machine", pass: true },
        ],
        pass: true,
      }),
    });
    const text = h.out.join("\n");
    expect(text).toContain("PASS");
    expect(text).toContain("§4.1");
  });
});
