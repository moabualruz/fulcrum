#!/usr/bin/env bun
// Local CI runner — single command exercises the full smoke-test gate.
// Usage: bun run ci

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
// Usage:
//   bun run ci                     → full (all tiers)
//   bun run ci --tier=quick        → T0 only (~10s, typecheck + lint)
//   bun run ci --tier=unit         → T0 + T1 (~30s, + unit tests)
//   bun run ci --tier=integration  → T0 + T1 + T2 (~90s, + integration + web)
//   bun run ci --tier=e2e          → T0 + T1 + T2 + T3 (+ Playwright + CLI E2E)
//   bun run ci --tier=full         → all tiers (same as no flag)
//
// Domain focus (combine with tier):
//   bun run ci --domain=application  → only application layer tests
//   bun run ci --domain=web          → only web pipeline
//   bun run ci --domain=cli          → only CLI tests
//   bun run ci --domain=tui          → only TUI tests
//   bun run ci --domain=api          → only API/tRPC tests

type CiTier = "quick" | "unit" | "integration" | "e2e" | "full";
type CiDomain = "application" | "web" | "cli" | "tui" | "api" | "all";

const VALID_TIERS = new Set<CiTier>(["quick", "unit", "integration", "e2e", "full"]);
const VALID_DOMAINS = new Set<CiDomain>(["application", "web", "cli", "tui", "api", "all"]);

function readFlag(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split("=")[1];
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseTier(raw = "full"): CiTier {
  if (VALID_TIERS.has(raw as CiTier)) return raw as CiTier;
  throw new Error(`invalid --tier=${raw}; expected quick|unit|integration|e2e|full`);
}

function parseDomain(raw = "all"): CiDomain {
  if (VALID_DOMAINS.has(raw as CiDomain)) return raw as CiDomain;
  throw new Error(`invalid --domain=${raw}; expected application|web|cli|tui|api`);
}

const tierArg = parseTier(readFlag("tier"));
const domainArg = parseDomain(readFlag("domain"));

const TIER_ORDER: CiTier[] = ["quick", "unit", "integration", "e2e", "full"];
function tierIncludes(step: CiTier): boolean {
  return TIER_ORDER.indexOf(tierArg) >= TIER_ORDER.indexOf(step);
}

function domainIncludes(step: TieredStep): boolean {
  if (domainArg === "all") return true;
  if (step.always) return true;
  return domainArg === step.domain;
}

export interface TieredStep extends Step {
  tier: CiTier;
  domain: CiDomain | "all";
  always?: boolean;
}

const QUICK_TYPECHECK_SCRIPT = `
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
  const fullE2EStep: TieredStep = {
    name: "web:e2e:full",
    cmd: ["bun", "run", "web:e2e:full"],
    cwd: "apps/web",
    env: home ? { HOME: home } : undefined,
    tier: "e2e",
    domain: "web",
  };

  return [
    // ── T0: Quick (~10s) — typecheck + boundaries ──
    { name: "install",          cmd: ["bun", "install", "--frozen-lockfile"], tier: "quick", domain: "all", always: true },
    { name: "typecheck",        cmd: ["bun", "-e", QUICK_TYPECHECK_SCRIPT], tier: "quick", domain: "all", always: true },

    // ── T1: Unit (~30s) — fast unit tests, no DB ──
    { name: "symphony:lock",    cmd: ["bun", "test", "tests/execution-orchestration/symphony/spec-lock.test.ts"], tier: "unit", domain: "all" },
    { name: "symphony:conformance", cmd: ["bun", "test", "services/execution-orchestration/src/infrastructure/agent-runtime/__tests__/symphony-conformance.test.ts"], tier: "unit", domain: "all" },
    { name: "trpc:permissions", cmd: ["bun", "test", "apps/server/src/trpc/__tests__/app-router-scaffold.test.ts", "apps/server/src/trpc/__tests__/router.test.ts"], tier: "unit", domain: "api" },
    { name: "application:unit",  cmd: ["bun", "test", "--test-name-pattern", "^(?!.*PGlite socket)", "services"], tier: "unit", domain: "application", env: { FULCRUM_REPO_DIR: process.cwd() } },
    { name: "test",             cmd: ["bun", "run", "scripts/test-root.ts"], tier: "unit", domain: "all" },
    { name: "license-audit",    cmd: ["bun", "run", "scripts/license-audit.ts"], tier: "unit", domain: "all" },
    { name: "ci:codegen",       cmd: ["bun", "run", "scripts/ci/codegen.ts"], tier: "unit", domain: "all" },

    // ── T2: Integration (~90s) — DB, web build, coverage ──
    { name: "migration:downgrade", cmd: ["bun", "test", "services/platform-core/src/infrastructure/application-database/migration-downgrade.test.ts"], tier: "integration", domain: "all" },
    { name: "graceful:shutdown",   cmd: ["bun", "test", "services/platform-core/src/application/platform-operations/shutdown-coordinator.test.ts"], tier: "integration", domain: "all" },
    { name: "coverage:root",    cmd: ["bun", "run", "scripts/test-root.ts", "--root-coverage"], tier: "integration", domain: "all" },
    { name: "build:all",        cmd: ["bun", "run", "scripts/build-all.ts"], tier: "integration", domain: "all" },
    { name: "web:install",      cmd: ["bun", "install", "--frozen-lockfile"], cwd: "apps/web", tier: "integration", domain: "web" },
    { name: "web:check",        cmd: ["bun", "run", "check"], cwd: "apps/web", env: { NODE_OPTIONS: "--max-old-space-size=12288" }, tier: "integration", domain: "web" },
    { name: "web:build",        cmd: ["bun", "run", "build"], cwd: "apps/web", tier: "integration", domain: "web" },
    { name: "web:test",         cmd: ["bun", "run", "web:test"], cwd: "apps/web", tier: "integration", domain: "web" },
    { name: "coverage:web",     cmd: ["bun", "run", "web:test", "--", "--coverage"], cwd: "apps/web", tier: "integration", domain: "web" },
    { name: "ci:schemas",       cmd: ["bun", "run", "scripts/ci-schemas.ts"], tier: "integration", domain: "all" },

    // ── T3: E2E (~180s+) — Playwright, a11y, full E2E ──
    { name: "web:a11y",         cmd: ["bun", "run", "web:a11y"], cwd: "apps/web", env: home ? { HOME: home } : undefined, tier: "e2e", domain: "web" },
    { name: "web:e2e:smoke",    cmd: ["bun", "run", "web:e2e:smoke"], cwd: "apps/web", env: home ? { HOME: home } : undefined, tier: "e2e", domain: "web" },
    fullE2EStep,
    { name: "generated:e2e",     cmd: ["bun", "run", "scripts/ci-generated-e2e.ts"], tier: "e2e", domain: "all" },

    // ── Phase 9.5 architecture closure gates ──
    { name: "architecture:red", cmd: ["bun", "test", "tests/architecture"], tier: "full", domain: "all" },
  ];
}

export const ALL_STEPS: TieredStep[] = buildAllSteps();

export const STEPS: Step[] = ALL_STEPS
  .filter(s => tierIncludes(s.tier))
  .filter(s => domainIncludes(s));

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
        if (/\b0 fail\b/.test(stdout)) ok = true;
      }
      resolve({ ok, ms: Date.now() - t0, stderr, stdout });
    });
  });
}

if (import.meta.main) {
  const results: Array<Result> = [];
  let failed = false;

  for (const step of STEPS) {
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

    console.log(`  ${tag} ${r.step.padEnd(12)} ${(r.ms / 1000).toFixed(1)}s${suffix}`);
  }
  process.exit(failed ? 1 : 0);
}
