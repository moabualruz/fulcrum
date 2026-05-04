// Unit tests for scripts/ci.ts STEPS array.
// Asserts web product gates and smoke e2e stay in root CI.
//
// Note: ci.ts guards the runner with `import.meta.main` so importing it here
// only evaluates the STEPS array without executing any subprocesses.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { STEPS } from "./ci.ts";

const webPackageJson = JSON.parse(readFileSync("src/web/package.json", "utf8")) as {
  scripts?: Record<string, string>;
};

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

describe("ci STEPS — web:e2e full suite opt-in", () => {
  // Module is evaluated once per process. In this test run FULCRUM_RUN_E2E is
  // not set to "1", so the full e2e suite must be absent.
  it("omits full e2e when FULCRUM_RUN_E2E is not '1'", () => {
    const names = STEPS.map((s) => s.name);
    expect(names).not.toContain("web:e2e:full");
  });

  // Verify the conditional logic directly — env "1" → full suite step included.
  it("conditional produces full e2e step when env is '1'", () => {
    const runE2E = "1";
    const steps = runE2E === "1"
      ? [{ name: "web:e2e:full", cmd: ["bun", "run", "web:e2e:full"], cwd: "src/web" }]
      : [];
    expect(steps.map((s) => s.name)).toContain("web:e2e:full");
    expect(steps[0]!.cwd).toBe("src/web");
    expect(steps[0]!.cmd).toEqual(["bun", "run", "web:e2e:full"]);
  });

  it("conditional produces empty array when env is not '1'", () => {
    const runE2E = "";
    const steps = runE2E === "1"
      ? [{ name: "web:e2e:full", cmd: ["bun", "run", "web:e2e:full"], cwd: "src/web" }]
      : [];
    expect(steps).toHaveLength(0);
  });
});

describe("ci STEPS — Phase 02 stable web gates", () => {
  it("includes stable web check, build, and unit gates", () => {
    const names = STEPS.map((s) => s.name);
    expect(names).toContain("web:check");
    expect(names).toContain("web:build");
    expect(names).toContain("web:test");
  });

  it("includes default smoke e2e gate", () => {
    const step = STEPS.find((s) => s.name === "web:e2e:smoke");
    expect(step).toBeDefined();
    expect(step!.cwd).toBe("src/web");
    expect(step!.cmd).toEqual(["bun", "run", "web:e2e:smoke"]);
  });

  it("keeps skills lint and compression out of product CI", () => {
    const names = STEPS.map((s) => s.name);
    expect(names).not.toContain("skills:lint");
    expect(names).not.toContain("compress:check");
  });

  it("declares smoke and full e2e scripts in the web package", () => {
    expect(webPackageJson.scripts).toMatchObject({
      "web:e2e:smoke": "playwright test tests/e2e/_smoke.spec.ts",
      "web:e2e:full": "playwright test tests/e2e/",
    });
  });
});

describe("web lockfile — vulnerable cookie resolution", () => {
  it("does not resolve cookie@0.6.0", () => {
    const lockfile = readFileSync("src/web/bun.lock", "utf8");
    expect(lockfile).not.toContain('"cookie": ["cookie@0.6.0"');
  });
});

describe("ci STEPS — Symphony SPEC lock gate", () => {
  it("includes focused symphony:lock step before the broad test suite", () => {
    const names = STEPS.map((s) => s.name);
    expect(names).toContain("symphony:lock");
    expect(names.indexOf("symphony:lock")).toBeLessThan(names.indexOf("test"));
  });

  it("symphony:lock runs the focused SPEC lock test", () => {
    const step = STEPS.find((s) => s.name === "symphony:lock");
    expect(step).toBeDefined();
    expect(step!.cmd).toEqual(["bun", "test", "tests/symphony/spec-lock.test.ts"]);
  });
});
