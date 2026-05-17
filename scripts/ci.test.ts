// Unit tests for scripts/ci.ts tiered pipeline.
// Validates tier structure, step ordering, and web gates.
//
// Note: ci.ts guards the runner with `import.meta.main` so importing it here
// only evaluates the STEPS array without executing any subprocesses.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { buildAllSteps, ALL_STEPS, STEPS } from "./ci.ts";
import type { TieredStep } from "./ci.ts";

const webPackageJson = JSON.parse(readFileSync("apps/web/package.json", "utf8")) as {
  scripts?: Record<string, string>;
};

describe("ci tiered pipeline — tier structure", () => {
  it("has exactly 4 tiers: lint, unit, integration, build", () => {
    const tiers = [...new Set(ALL_STEPS.map((s) => s.tier))];
    expect(tiers).toEqual(["lint", "unit", "integration", "build"]);
  });

  it("tiers execute in order: lint → unit → integration → build", () => {
    const tierOrder = ["lint", "unit", "integration", "build"];
    let lastTierIndex = -1;
    for (const step of ALL_STEPS) {
      const idx = tierOrder.indexOf(step.tier);
      expect(idx).toBeGreaterThanOrEqual(lastTierIndex);
      lastTierIndex = idx;
    }
  });
});

describe("ci tiered pipeline — lint tier", () => {
  const lintSteps = ALL_STEPS.filter((s) => s.tier === "lint");

  it("includes install, typecheck, architecture, license-audit, ci:codegen, ci:schemas", () => {
    const names = lintSteps.map((s) => s.name);
    expect(names).toContain("install");
    expect(names).toContain("typecheck");
    expect(names).toContain("architecture");
    expect(names).toContain("license-audit");
    expect(names).toContain("ci:codegen");
    expect(names).toContain("ci:schemas");
  });

  it("install runs bun install --frozen-lockfile", () => {
    const step = lintSteps.find((s) => s.name === "install");
    expect(step!.cmd).toEqual(["bun", "install", "--frozen-lockfile"]);
  });

  it("architecture tests run on tests/architecture/", () => {
    const step = lintSteps.find((s) => s.name === "architecture");
    expect(step!.cmd).toEqual(["bun", "test", "tests/architecture/"]);
  });
});

describe("ci tiered pipeline — unit tier", () => {
  const unitSteps = ALL_STEPS.filter((s) => s.tier === "unit");

  it("has a single 'unit' step running fixture-backed service tests", () => {
    expect(unitSteps).toHaveLength(1);
    const step = unitSteps[0]!;
    expect(step.name).toBe("unit");
    expect(step.cmd).toContain("scripts/test-tier.ts");
    expect(step.cmd).toContain("unit");
    expect(step.cmd).toContain("--timeout");
  });
});

describe("ci tiered pipeline — integration tier", () => {
  const integrationSteps = ALL_STEPS.filter((s) => s.tier === "integration");

  it("has a single 'integration' step running external and DB contract tests", () => {
    expect(integrationSteps).toHaveLength(1);
    const step = integrationSteps[0]!;
    expect(step.name).toBe("integration");
    expect(step.cmd).toContain("scripts/test-tier.ts");
    expect(step.cmd).toContain("integration");
    expect(step.cmd).toContain("--timeout");
  });
});

describe("ci tiered pipeline — build tier", () => {
  const buildSteps = ALL_STEPS.filter((s) => s.tier === "build");

  it("includes build, web:check, web:build, web:test", () => {
    const names = buildSteps.map((s) => s.name);
    expect(names).toContain("build");
    expect(names).toContain("web:check");
    expect(names).toContain("web:build");
    expect(names).toContain("web:test");
  });

  it("web:test runs bun run web:test from apps/web", () => {
    const step = buildSteps.find((s) => s.name === "web:test");
    expect(step).toBeDefined();
    expect(step!.cwd).toBe("apps/web");
    expect(step!.cmd).toEqual(["bun", "run", "web:test"]);
  });

  it("web:check sets NODE_OPTIONS for heap size", () => {
    const step = buildSteps.find((s) => s.name === "web:check");
    expect(step).toBeDefined();
    expect(step!.env).toMatchObject({ NODE_OPTIONS: "--max-old-space-size=12288" });
  });
});

describe("ci tiered pipeline — removed stages", () => {
  const allNames = ALL_STEPS.map((s) => s.name);

  it("does not include coverage:root (redundant re-run)", () => {
    expect(allNames).not.toContain("coverage:root");
  });

  it("does not include coverage:web (redundant re-run)", () => {
    expect(allNames).not.toContain("coverage:web");
  });

  it("does not include web:install (handled by root install)", () => {
    expect(allNames).not.toContain("web:install");
  });

  it("does not include standalone symphony:lock (folded into unit)", () => {
    expect(allNames).not.toContain("symphony:lock");
  });

  it("does not include standalone symphony:conformance (folded into unit)", () => {
    expect(allNames).not.toContain("symphony:conformance");
  });

  it("does not include standalone trpc:permissions (folded into unit)", () => {
    expect(allNames).not.toContain("trpc:permissions");
  });

  it("does not include standalone migration:downgrade (folded into integration)", () => {
    expect(allNames).not.toContain("migration:downgrade");
  });

  it("does not include standalone graceful:shutdown (folded into integration)", () => {
    expect(allNames).not.toContain("graceful:shutdown");
  });

  it("keeps skills lint and compression out of pipeline", () => {
    expect(allNames).not.toContain("skills:lint");
    expect(allNames).not.toContain("compress:check");
  });
});

describe("ci tiered pipeline — buildAllSteps accepts env", () => {
  it("buildAllSteps returns consistent structure with custom env", () => {
    const steps = buildAllSteps({ ...process.env, HOME: "/tmp/fulcrum-home" });
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step).toHaveProperty("tier");
      expect(step).toHaveProperty("name");
      expect(step).toHaveProperty("cmd");
    }
  });
});

describe("web lockfile — vulnerable cookie resolution", () => {
  it("does not resolve cookie@0.6.0", () => {
    const lockfile = readFileSync("bun.lock", "utf8");
    expect(lockfile).not.toContain('"cookie": ["cookie@0.6.0"');
  });
});

describe("web package — e2e scripts declared", () => {
  it("declares smoke and full e2e scripts in the web package", () => {
    expect(webPackageJson.scripts).toMatchObject({
      "web:e2e:smoke": "playwright test tests/e2e/_smoke.spec.ts",
      "web:e2e:full": "playwright test tests/e2e/ --workers=1",
    });
  });
});
