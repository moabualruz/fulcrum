#!/usr/bin/env bun
// Local CI runner — single command exercises the full smoke-test gate.
// Usage: bun run ci

import { spawn } from "node:child_process";

interface Step { name: string; cmd: string[]; soft?: boolean; cwd?: string; }

export const STEPS: Step[] = [
  { name: "install",     cmd: ["bun", "install", "--frozen-lockfile"] },
  { name: "typecheck",   cmd: ["bun", "run", "--bun", "tsc", "--noEmit"] },
  { name: "test",        cmd: ["bun", "test", "--conditions=svelte"] },
  { name: "build:all",   cmd: ["bun", "run", "scripts/build-all.ts"] },
  // Web pipeline runs from the SvelteKit subpackage. svelte-kit + svelte-check
  // catch regressions that the root tsc cannot see because src/web is excluded.
  { name: "web:install", cmd: ["bun", "install", "--frozen-lockfile"], cwd: "src/web" },
  { name: "web:check",   cmd: ["bun", "run", "check"], cwd: "src/web" },
  { name: "web:build",   cmd: ["bun", "run", "build"], cwd: "src/web" },
  // Vitest unit tests for the SvelteKit subpackage — always-on.
  { name: "web:test",    cmd: ["bun", "run", "web:test"], cwd: "src/web" },
  { name: "skills:lint", cmd: ["bun", "run", "src/index.ts", "skills", "lint", "skills/"] },
  { name: "compress:check", cmd: ["bash", "scripts/compress-with-caveman.sh", "--check"] },
  // Playwright e2e — opt-in via FULCRUM_RUN_E2E=1.
  ...(process.env["FULCRUM_RUN_E2E"] === "1"
    ? [{ name: "web:e2e", cmd: ["bun", "run", "web:e2e"], cwd: "src/web" } satisfies Step]
    : []),
];

interface Result { step: string; ok: boolean; soft?: boolean; skipped?: boolean; pending?: number; ms: number; }

function run(step: Step): Promise<{ ok: boolean; ms: number; stderr?: string }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stderr = "";
    const proc = spawn(step.cmd[0]!, step.cmd.slice(1), { stdio: "pipe", cwd: step.cwd });

    if (proc.stdout) proc.stdout.on("data", (d) => process.stdout.write(d));
    if (proc.stderr) proc.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });

    proc.on("exit", (code) => resolve({ ok: code === 0, ms: Date.now() - t0, stderr }));
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
