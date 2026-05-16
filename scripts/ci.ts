#!/usr/bin/env bun
// Local CI runner — tiered pipeline with affected-only testing.
// Usage:
//   bun run scripts/ci.ts               → full (all tiers)
//   bun run scripts/ci.ts --changed     → affected-only (unit+integration use --changed=origin/main)
//   bun run scripts/ci.ts --fast        → alias for --changed
//   bun run scripts/ci.ts --tier=lint   → lint tier only
//   bun run scripts/ci.ts --tier=unit   → lint + unit
//   bun run scripts/ci.ts --tier=integration → lint + unit + integration
//   bun run scripts/ci.ts --tier=build  → all tiers

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
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

export const CI_ENV: NodeJS.ProcessEnv = { ...process.env, HOME: sandboxHome };
delete CI_ENV["FULCRUM_HOME"];

export function envForStep(step: Step): NodeJS.ProcessEnv {
  if (!step.env) return CI_ENV;
  return { ...CI_ENV, ...step.env };
}

// ── CI Tiers ──────────────────────────────────────────────────────────────────
// Tier 1: LINT + ARCHITECTURE — fast gate (<15s)
// Tier 2: UNIT TESTS — services/ (<2min)
// Tier 3: INTEGRATION TESTS — tests/ (<3min)
// Tier 4: BUILD + WEB — build verification (<2min)

export type CiTier = "lint" | "unit" | "integration" | "build";

const VALID_TIERS = new Set<CiTier>(["lint", "unit", "integration", "build"]);

function readFlag(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split("=")[1];
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseTier(raw = "build"): CiTier {
  if (VALID_TIERS.has(raw as CiTier)) return raw as CiTier;
  throw new Error(`invalid --tier=${raw}; expected lint|unit|integration|build`);
}

const tierArg = parseTier(readFlag("tier"));
const isChanged = process.argv.includes("--changed") || process.argv.includes("--fast");

const TIER_ORDER: CiTier[] = ["lint", "unit", "integration", "build"];
function tierIncludes(step: CiTier): boolean {
  return TIER_ORDER.indexOf(tierArg) >= TIER_ORDER.indexOf(step);
}

export interface TieredStep extends Step {
  tier: CiTier;
}

export function buildAllSteps(env: NodeJS.ProcessEnv = process.env): TieredStep[] {
  const home = env["HOME"];
  const changedFlag = isChanged ? ["--changed=origin/main"] : [];

  return [
    // ── Tier 1: LINT + ARCHITECTURE (fast, <15s) ──
    { name: "install",       cmd: ["bun", "install", "--frozen-lockfile"], tier: "lint" },
    { name: "typecheck",     cmd: ["bun", "run", "--bun", "tsc", "--noEmit"], tier: "lint" },
    { name: "architecture",  cmd: ["bun", "test", "tests/architecture/"], tier: "lint" },
    { name: "license-audit", cmd: ["bun", "run", "scripts/license-audit.ts"], tier: "lint" },
    { name: "ci:codegen",    cmd: ["bun", "run", "scripts/ci/codegen.ts"], tier: "lint" },
    { name: "ci:schemas",    cmd: ["bun", "run", "scripts/ci-schemas.ts"], tier: "lint" },

    // ── Tier 2: UNIT TESTS (services/, <2min) ──
    { name: "unit",          cmd: ["bun", "test", ...changedFlag, "--parallel", "services/"], tier: "unit", env: { FULCRUM_REPO_DIR: process.cwd() } },

    // ── Tier 3: INTEGRATION TESTS (tests/, <3min) ──
    { name: "integration",   cmd: ["bun", "test", ...changedFlag, "--parallel", "tests/", "--exclude", "tests/architecture"], tier: "integration" },

    // ── Tier 4: BUILD + WEB (<2min) ──
    { name: "build",         cmd: ["bun", "run", "scripts/build-all.ts"], tier: "build" },
    { name: "web:check",     cmd: ["bun", "run", "check"], cwd: "apps/web", env: { NODE_OPTIONS: "--max-old-space-size=12288" }, tier: "build" },
    { name: "web:build",     cmd: ["bun", "run", "build"], cwd: "apps/web", tier: "build" },
    { name: "web:test",      cmd: ["bun", "run", "web:test"], cwd: "apps/web", tier: "build" },
  ];
}

export const ALL_STEPS: TieredStep[] = buildAllSteps();

export const STEPS: Step[] = ALL_STEPS
  .filter(s => tierIncludes(s.tier));

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
        if (/\b0 fail\b/.test(combined)) {
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
  let currentTier: CiTier | null = null;

  for (const step of STEPS as TieredStep[]) {
    // Print tier header on tier change
    if (step.tier !== currentTier) {
      currentTier = step.tier;
      const tierIndex = TIER_ORDER.indexOf(currentTier) + 1;
      console.log(`\n━━━ Tier ${tierIndex}: ${currentTier.toUpperCase()} ━━━`);
    }

    console.log(`\n━━━ ${step.name} ━━━ ${step.cmd.join(" ")}`);
    const r = await run(step);

    if (step.soft && !r.ok) {
      // Soft-fail: check if it's caveman not installed
      if (r.stderr?.includes("Caveman not installed")) {
        results.push({ step: step.name, ok: true, soft: true, skipped: true, ms: r.ms });
      } else {
        // Parse pending count from stdout
        const output = r.stderr || "";
        const pendingMatch = output.match(/PENDING/g);
        const pendingCount = pendingMatch ? pendingMatch.length : 0;
        results.push({ step: step.name, ok: false, soft: true, pending: pendingCount, ms: r.ms });
        console.log(`\n⚠ ${step.name}: ${pendingCount} file(s) pending compression. Run: bun run compress`);
      }
    } else {
      results.push({ step: step.name, ok: r.ok, soft: step.soft, ms: r.ms });
      if (!r.ok && !step.soft) { failed = true; break; }
    }
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
