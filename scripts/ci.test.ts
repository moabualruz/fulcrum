// Unit tests for scripts/ci.ts STEPS array.
// Asserts web product gates and smoke e2e stay in root CI.
//
// Note: ci.ts guards the runner with `import.meta.main` so importing it here
// only evaluates the STEPS array without executing any subprocesses.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { buildAllSteps, STEPS } from "./ci.ts";

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

describe("ci STEPS — web:e2e full suite", () => {
  it("STEPS includes full e2e without env opt-in", () => {
    const step = STEPS.find((s) => s.name === "web:e2e:full");
    expect(step).toBeDefined();
    expect("skipReason" in step!).toBe(false);
  });
});

describe("ci STEPS — WR-03 explicit full E2E semantics", () => {
  it("WR-03 includes web:e2e:full in e2e tier", () => {
    const steps = buildAllSteps({ ...process.env, FULCRUM_RUN_E2E: "", HOME: "/tmp/fulcrum-home" });
    const step = steps.find((s) => s.name === "web:e2e:full");

    expect(step).toBeDefined();
    expect(step!.tier).toBe("e2e");
    expect(step!.domain).toBe("web");
    expect(step!.cwd).toBe("src/web");
    expect(step!.cmd).toEqual(["bun", "run", "web:e2e:full"]);
    expect("skipReason" in step!).toBe(false);
  });

  it("WR-03 full CI includes web:e2e:full", () => {
    const names = buildAllSteps({ ...process.env, FULCRUM_RUN_E2E: "", HOME: "/tmp/fulcrum-home" })
      .map((s) => s.name);

    expect(names).toContain("web:e2e:full");
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

describe("ci STEPS — tRPC permission gate", () => {
  it("includes hard-fail trpc:permissions step before the broad test suite", () => {
    const names = STEPS.map((s) => s.name);
    const step = STEPS.find((s) => s.name === "trpc:permissions");

    expect(step).toBeDefined();
    expect(step!.soft).not.toBe(true);
    expect(names.indexOf("trpc:permissions")).toBeLessThan(names.indexOf("test"));
  });

  it("runs the focused tRPC permission lint tests", () => {
    const step = STEPS.find((s) => s.name === "trpc:permissions");

    expect(step).toBeDefined();
    expect(step!.cmd).toEqual([
      "bun",
      "test",
      "tests/trpc/app-router-scaffold.test.ts",
      "tests/trpc/router.test.ts",
    ]);
  });
});

describe("ci STEPS — Phase 09 infrastructure gates", () => {
  it("runs migration downgrade and graceful shutdown before build:all", () => {
    const names = STEPS.map((s) => s.name);

    expect(names).toContain("migration:downgrade");
    expect(names).toContain("graceful:shutdown");
    expect(names.indexOf("migration:downgrade")).toBeLessThan(names.indexOf("build:all"));
    expect(names.indexOf("graceful:shutdown")).toBeLessThan(names.indexOf("build:all"));
  });

  it("uses focused infrastructure test commands", () => {
    expect(STEPS.find((s) => s.name === "migration:downgrade")?.cmd).toEqual([
      "bun",
      "test",
      "tests/db/migration-downgrade.test.ts",
    ]);
    expect(STEPS.find((s) => s.name === "graceful:shutdown")?.cmd).toEqual([
      "bun",
      "test",
      "tests/platform/graceful-shutdown.test.ts",
    ]);
  });
});

describe("ci STEPS — Phase 09 coverage gates", () => {
  it("runs root and web coverage after normal unit gates", () => {
    const names = STEPS.map((s) => s.name);

    expect(names).toContain("coverage:root");
    expect(names).toContain("coverage:web");
    expect(names.indexOf("coverage:root")).toBeGreaterThan(names.indexOf("test"));
    expect(names.indexOf("coverage:web")).toBeGreaterThan(names.indexOf("web:test"));
  });

  it("uses focused coverage commands", () => {
    expect(STEPS.find((s) => s.name === "coverage:root")?.cmd).toEqual([
      "bun",
      "run",
      "scripts/test-root.ts",
      "--coverage",
    ]);
    expect(STEPS.find((s) => s.name === "coverage:web")?.cmd).toEqual([
      "bun",
      "run",
      "web:test",
      "--",
      "--coverage",
    ]);
  });
});
