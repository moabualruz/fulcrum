import { describe, expect, test } from "bun:test";
import { runChecks } from "./runner.ts";
import type { DoctorCheckDef } from "./types.ts";

function okCheck(name: string, subsystem = "test"): DoctorCheckDef {
  return {
    name,
    subsystem,
    run: async () => ({ status: "ok", message: "passed" }),
  };
}

function failCheck(name: string, subsystem = "test"): DoctorCheckDef {
  return {
    name,
    subsystem,
    run: async () => ({ status: "fail", message: "broken" }),
  };
}

describe("runChecks", () => {
  test("runs all checks in parallel and returns results", async () => {
    const checks = [okCheck("a"), okCheck("b"), okCheck("c")];
    const results = await runChecks(checks);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(results.every((r) => r.durationMs >= 0)).toBe(true);
  });

  test("filters by subsystem when specified", async () => {
    const checks = [
      okCheck("a", "api"),
      okCheck("b", "cli"),
      okCheck("c", "api"),
    ];
    const results = await runChecks(checks, { subsystem: "api" });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.subsystem === "api")).toBe(true);
  });

  test("returns empty when subsystem matches nothing", async () => {
    const checks = [okCheck("a", "api")];
    const results = await runChecks(checks, { subsystem: "nonexistent" });
    expect(results).toHaveLength(0);
  });

  test("timeout produces fail status", async () => {
    const slowCheck: DoctorCheckDef = {
      name: "slow",
      subsystem: "test",
      run: () => new Promise((resolve) => setTimeout(() => resolve({ status: "ok", message: "done" }), 5000)),
    };
    const results = await runChecks([slowCheck], { timeoutMs: 50, maxRetries: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("timed out");
  });

  test("retries failing checks with exponential backoff", async () => {
    let calls = 0;
    const flakyCheck: DoctorCheckDef = {
      name: "flaky",
      subsystem: "test",
      run: async () => {
        calls++;
        if (calls < 3) return { status: "fail", message: `attempt ${calls}` };
        return { status: "ok", message: "recovered" };
      },
    };
    const results = await runChecks([flakyCheck], { maxRetries: 2 });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("ok");
    expect(results[0]!.message).toBe("recovered");
  });

  test("permanently failing check stays fail after retries", async () => {
    const results = await runChecks([failCheck("broken")], { maxRetries: 2 });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
  });

  test("ok checks are not retried", async () => {
    let calls = 0;
    const countCheck: DoctorCheckDef = {
      name: "counter",
      subsystem: "test",
      run: async () => { calls++; return { status: "ok", message: "good" }; },
    };
    await runChecks([countCheck], { maxRetries: 2 });
    expect(calls).toBe(1);
  });
});
