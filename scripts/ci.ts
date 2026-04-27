#!/usr/bin/env bun
// Local CI runner — single command exercises the full smoke-test gate.
// Usage: bun run ci

import { spawn } from "node:child_process";

interface Step { name: string; cmd: string[]; }

const STEPS: Step[] = [
  { name: "install",     cmd: ["bun", "install", "--frozen-lockfile"] },
  { name: "typecheck",   cmd: ["bun", "run", "--bun", "tsc", "--noEmit"] },
  { name: "test",        cmd: ["bun", "test"] },
  { name: "build:all",   cmd: ["bun", "run", "scripts/build-all.ts"] },
  { name: "skills:lint", cmd: ["bun", "run", "src/index.ts", "skills", "lint", "skills/"] },
];

function run(step: Step): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const proc = spawn(step.cmd[0]!, step.cmd.slice(1), { stdio: "inherit" });
    proc.on("exit", (code) => resolve({ ok: code === 0, ms: Date.now() - t0 }));
  });
}

const results: Array<{ step: string; ok: boolean; ms: number }> = [];
let failed = false;

for (const step of STEPS) {
  console.log(`\n━━━ ${step.name} ━━━ ${step.cmd.join(" ")}`);
  const r = await run(step);
  results.push({ step: step.name, ok: r.ok, ms: r.ms });
  if (!r.ok) { failed = true; break; }
}

console.log("\n━━━ summary ━━━");
for (const r of results) {
  const tag = r.ok ? "✓" : "✗";
  console.log(`  ${tag} ${r.step.padEnd(12)} ${(r.ms / 1000).toFixed(1)}s`);
}
process.exit(failed ? 1 : 0);
