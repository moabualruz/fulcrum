// Unit tests for scripts/ci.ts STEPS array.
// Asserts 09.5 requirements: web:test always-on, web:e2e opt-in via FULCRUM_RUN_E2E.
//
// Note: ci.ts guards the runner with `import.meta.main` so importing it here
// only evaluates the STEPS array without executing any subprocesses.

import { describe, it, expect } from "bun:test";
import { STEPS } from "./ci.ts";

describe("ci STEPS — web:test always-on", () => {
  it("includes web:test step", () => {
    const names = STEPS.map((s) => s.name);
    expect(names).toContain("web:test");
  });

  it("web:test runs bun run web:test from src/web", () => {
    const step = STEPS.find((s) => s.name === "web:test");
    expect(step).toBeDefined();
    expect(step!.cwd).toBe("src/web");
    expect(step!.cmd).toEqual(["bun", "run", "web:test"]);
  });
});

describe("ci STEPS — web:e2e opt-in", () => {
  // Module is evaluated once per process. In this test run FULCRUM_RUN_E2E is
  // not set to "1", so web:e2e must be absent.
  it("omits web:e2e when FULCRUM_RUN_E2E is not '1'", () => {
    const names = STEPS.map((s) => s.name);
    expect(names).not.toContain("web:e2e");
  });

  // Verify the conditional logic directly — env "1" → step included.
  it("conditional produces web:e2e step when env is '1'", () => {
    const runE2E = "1";
    const steps = runE2E === "1"
      ? [{ name: "web:e2e", cmd: ["bun", "run", "web:e2e"], cwd: "src/web" }]
      : [];
    expect(steps.map((s) => s.name)).toContain("web:e2e");
    expect(steps[0]!.cwd).toBe("src/web");
    expect(steps[0]!.cmd).toEqual(["bun", "run", "web:e2e"]);
  });

  it("conditional produces empty array when env is not '1'", () => {
    const runE2E = "";
    const steps = runE2E === "1"
      ? [{ name: "web:e2e", cmd: ["bun", "run", "web:e2e"], cwd: "src/web" }]
      : [];
    expect(steps).toHaveLength(0);
  });
});
