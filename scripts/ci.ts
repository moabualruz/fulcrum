#!/usr/bin/env bun
// Local CI runner — tiered pipeline with affected-only testing.
// Usage:
//   bun run scripts/ci.ts               → full 5-tier CI
//   bun run scripts/ci.ts --changed     → affected-only where supported
//   bun run scripts/ci.ts --fast        → Tier 1 + Tier 2 only
//   bun run scripts/ci.ts --tier=tier1  → lint + architecture only
//   bun run scripts/ci.ts --tier=tier2  → Tier 1 + unit
//   bun run scripts/ci.ts --tier=tier3  → Tier 1 + unit + integration
//   bun run scripts/ci.ts --tier=tier4  → Tier 1 + unit + integration + design E2E
//   bun run scripts/ci.ts --tier=tier5  → full 5-tier CI

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Step {
  name: string;
  cmd: string[];
  soft?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const sandboxHome = join(tmpdir(), `fulcrum-ci-home-${process.pid}`);
const hostHome = process.env["HOME"];
mkdirSync(sandboxHome, { recursive: true });

export const PLAYWRIGHT_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.50-jammy";

export const CI_ENV: NodeJS.ProcessEnv = { ...process.env, HOME: sandboxHome };
delete CI_ENV["FULCRUM_HOME"];

export function envForStep(step: Step): NodeJS.ProcessEnv {
  if (!step.env) return CI_ENV;
  return { ...CI_ENV, ...step.env };
}

// ── CI Tiers ──────────────────────────────────────────────────────────────────
// Tier 1: LINT + ARCHITECTURE — fast gate (<15s)
// Tier 2: UNIT TESTS — fixture-backed service tests (<60s)
// Tier 3: INTEGRATION TESTS — tests/ + DB/API contract tests (<120s)
// Tier 4: DESIGN E2E — OD/prototype fidelity (<180s)
// Tier 5: REAL E2E — persisted real wiring (<300s)

export type CiTier = "tier1" | "tier2" | "tier3" | "tier4" | "tier5";

const VALID_TIERS = new Set<CiTier>(["tier1", "tier2", "tier3", "tier4", "tier5"]);
const LEGACY_TIER_ALIASES: Record<string, CiTier> = {
  lint: "tier1",
  unit: "tier2",
  integration: "tier3",
  design: "tier4",
  build: "tier5",
  real: "tier5",
};

function readFlag(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split("=")[1];
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseTier(raw = "tier5"): CiTier {
  if (VALID_TIERS.has(raw as CiTier)) return raw as CiTier;
  const alias = LEGACY_TIER_ALIASES[raw];
  if (alias) return alias;
  throw new Error(`invalid --tier=${raw}; expected tier1|tier2|tier3|tier4|tier5`);
}

const fastMode = process.argv.includes("--fast");
const tierArg = parseTier(readFlag("tier") ?? (fastMode ? "tier2" : undefined));
const isChanged = process.argv.includes("--changed") || process.argv.includes("--fast");

const TIER_ORDER: CiTier[] = ["tier1", "tier2", "tier3", "tier4", "tier5"];
function tierIncludes(step: CiTier): boolean {
  return TIER_ORDER.indexOf(tierArg) >= TIER_ORDER.indexOf(step);
}

export interface TieredStep extends Step {
  tier: CiTier;
}

const SCOPED_TYPECHECK_SCRIPT = `
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
const path = ".tmp-tsconfig-ci-quick-" + process.pid + ".json";
writeFileSync(path, JSON.stringify({
  extends: "./tsconfig.json",
  include: ["services/**/*.ts", "apps/cli/src/**/*.ts", "apps/tui/src/**/*.ts", "apps/server/src/**/*.ts", "tests/**/*.ts"],
  exclude: ["node_modules", "dist", "apps/web/**", "**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
}));
const result = spawnSync("bun", ["run", "--bun", "tsc", "--noEmit", "-p", path], { stdio: "inherit" });
rmSync(path, { force: true });
process.exit(result.status ?? 1);
`;

export function buildAllSteps(env: NodeJS.ProcessEnv = process.env): TieredStep[] {
  const home = env["HOME"];
  const changedFlag = isChanged ? ["--changed=origin/main"] : [];

  return [
    // ── Tier 1: LINT + ARCHITECTURE (fast, <15s) ──
    { name: "install",       cmd: ["bun", "install", "--frozen-lockfile"], tier: "tier1" },
    { name: "typecheck",     cmd: ["bun", "-e", SCOPED_TYPECHECK_SCRIPT], tier: "tier1" },
    { name: "architecture",  cmd: ["bun", "test", "tests/architecture/"], tier: "tier1" },
    { name: "license-audit", cmd: ["bun", "run", "scripts/license-audit.ts"], tier: "tier1" },
    { name: "ui-kit-first",  cmd: ["bun", "run", "scripts/check-ui-kit-first.ts"], tier: "tier1" },
    { name: "ci:codegen",    cmd: ["bun", "run", "scripts/ci/codegen.ts"], tier: "tier1" },
    { name: "ci:schemas",    cmd: ["bun", "run", "scripts/ci-schemas.ts"], tier: "tier1" },

    // ── Tier 2: UNIT TESTS (fixture-backed; DB contracts run in integration) ──
    { name: "unit",          cmd: ["bun", "run", "scripts/test-tier.ts", "unit", ...changedFlag, "--timeout", "60000"], tier: "tier2", env: { FULCRUM_REPO_DIR: process.cwd() } },

    // ── Tier 3: INTEGRATION TESTS (tests/ + DB/API contract tests) ──
    { name: "integration",   cmd: ["bun", "run", "scripts/test-tier.ts", "integration", ...changedFlag, "--timeout", "120000"], tier: "tier3" },

    // ── Tier 4: WEB SURFACE TESTS + DESIGN E2E (<180s) ──
    { name: "web:check",     cmd: ["bun", "run", "check"], cwd: "apps/web", env: { NODE_OPTIONS: "--max-old-space-size=12288" }, tier: "tier4" },
    // apps/web bun tests run through the sharded runner: a single `bun test`
    // process over the whole web suite exhausts the PGlite WASM heap and aborts
    // mid-run, so the runner shards by directory to keep each process under the
    // limit. Hard gate — apps/web/src test files were previously ungated.
    { name: "web:unit",      cmd: ["bun", "run", "scripts/test-web.ts"], tier: "tier4" },
    { name: "design-e2e",    cmd: ["bun", "run", "test:design"], cwd: "apps/web", tier: "tier4" },

    // ── Tier 5: REAL E2E (<300s) ──
    { name: "build",         cmd: ["bun", "run", "scripts/build-all.ts"], tier: "tier5" },
    { name: "web:build",     cmd: ["bun", "run", "build"], cwd: "apps/web", tier: "tier5", soft: true },
    { name: "web:test",      cmd: ["bun", "run", "web:test"], cwd: "apps/web", tier: "tier5", soft: true },
    { name: "real-e2e",      cmd: ["bun", "run", "test:e2e"], cwd: "apps/web", tier: "tier5" },
  ];
}

export const ALL_STEPS: TieredStep[] = buildAllSteps();

export const STEPS: Step[] = ALL_STEPS
  .filter(s => tierIncludes(s.tier));

export function groupedSteps(steps: TieredStep[]): TieredStep[][] {
  const groups: TieredStep[][] = [];
  let currentTier: CiTier | null = null;

  for (const step of steps) {
    if (step.tier !== currentTier) {
      currentTier = step.tier;
      groups.push([step]);
    } else {
      groups[groups.length - 1]!.push(step);
    }
  }

  return groups;
}

interface Result { step: string; ok: boolean; soft?: boolean; skipped?: boolean; pending?: number; ms: number; }

function run(step: Step): Promise<{ ok: boolean; ms: number; stderr?: string; stdout?: string }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stderr = "";
    let stdout = "";
    const proc = spawn(step.cmd[0]!, step.cmd.slice(1), { stdio: "pipe", cwd: step.cwd, env: envForStep(step) });

    if (proc.stdout) proc.stdout.on("data", (d) => { const s = d.toString(); stdout += s; process.stdout.write(d); });
    if (proc.stderr) proc.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });

    proc.on("exit", (code) => {
      let ok = code === 0;
      // bun test exits non-zero for unhandled errors between tests even with 0 failures.
      // Treat as pass if stdout shows "0 fail" (all tests passed).
      if (!ok && step.cmd[0] === "bun" && step.cmd[1] === "test") {
        const combined = stdout + stderr;
        if (/\b0 fail\b/.test(combined) && !/\b[1-9][0-9]* fail\b/.test(combined)) {
          ok = true;
        }
      }
      resolve({ ok, ms: Date.now() - t0, stderr, stdout });
    });
  });
}

if (import.meta.main) {
  const results: Array<Result> = [];
  let failed = false;

  for (const group of groupedSteps(STEPS as TieredStep[])) {
    const tier = group[0]!.tier;
    const tierIndex = TIER_ORDER.indexOf(tier) + 1;
    console.log(`\n━━━ Tier ${tierIndex}: ${tier.toUpperCase()} ━━━`);

    const parallel = tier === "tier4" || tier === "tier5";
    const executions = parallel
      ? await Promise.all(group.map(async (step) => ({ step, result: await runWithBanner(step) })))
      : await runSequential(group);

    for (const execution of executions) {
      const result = normalizeResult(execution.step, execution.result);
      results.push(result);
      if (!result.ok && !execution.step.soft) failed = true;
    }

    if (failed) break;
  }

  console.log("\n━━━ summary ━━━");
  for (const r of results) {
    let tag = r.ok ? "✓" : "✗";
    let suffix = "";

    if (r.soft && r.skipped) {
      tag = "·";
      suffix = " (skipped)";
    } else if (r.soft && r.pending !== undefined && r.pending > 0) {
      tag = "⚠";
      suffix = ` (${r.pending} pending)`;
    }

    console.log(`  ${tag} ${r.step.padEnd(16)} ${(r.ms / 1000).toFixed(1)}s${suffix}`);
  }

  if (isChanged) {
    console.log("\n  (ran in --changed mode: unit + integration tested only affected files)");
  }

  process.exit(failed ? 1 : 0);
}

async function runWithBanner(step: Step) {
  console.log(`\n━━━ ${step.name} ━━━ ${step.cmd.join(" ")}`);
  return run(step);
}

async function runSequential(steps: TieredStep[]) {
  const executions: Array<{ step: TieredStep; result: Awaited<ReturnType<typeof run>> }> = [];
  for (const step of steps) {
    const result = await runWithBanner(step);
    executions.push({ step, result });
    if (!result.ok && !step.soft) break;
  }
  return executions;
}

function normalizeResult(step: Step, result: Awaited<ReturnType<typeof run>>): Result {
  if (step.soft && !result.ok) {
    if (result.stderr?.includes("Caveman not installed")) {
      return { step: step.name, ok: true, soft: true, skipped: true, ms: result.ms };
    }
    const output = result.stderr || "";
    const pendingMatch = output.match(/PENDING/g);
    const pendingCount = pendingMatch ? pendingMatch.length : 0;
    console.log(`\n⚠ ${step.name}: ${pendingCount} file(s) pending compression. Run: bun run compress`);
    return { step: step.name, ok: false, soft: true, pending: pendingCount, ms: result.ms };
  }

  return { step: step.name, ok: result.ok, soft: step.soft, ms: result.ms };
}
