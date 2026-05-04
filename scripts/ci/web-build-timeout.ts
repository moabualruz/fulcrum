#!/usr/bin/env bun

/**
 * CI gate: `bun run build` for the web shell must complete within 60 seconds.
 * Fails with non-zero exit if the build exceeds the budget.
 *
 * Usage:
 *   bun run scripts/ci/web-build-timeout.ts
 *
 * Env:
 *   WEB_BUILD_TIMEOUT_MS  — override default 60000ms (for testing).
 *   WEB_DIR               — path to the web package (default: src/web).
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const BUDGET_MS = Number(process.env["WEB_BUILD_TIMEOUT_MS"] ?? 60_000);
const WEB_DIR = resolve(process.env["WEB_DIR"] ?? "src/web");

function runBuild(): Promise<{ exitCode: number; durationMs: number }> {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    let timedOut = false;

    const child = spawn("bun", ["run", "build"], {
      cwd: WEB_DIR,
      stdio: "inherit",
      shell: false,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, BUDGET_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      rej(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - t0;
      if (timedOut) {
        res({ exitCode: 124, durationMs });
      } else {
        res({ exitCode: code ?? 1, durationMs });
      }
    });
  });
}

const { exitCode, durationMs } = await runBuild();

if (exitCode === 124) {
  console.error(
    `[perf-gate] FAIL: web build exceeded ${BUDGET_MS}ms budget (timed out after ${durationMs}ms)`
  );
  process.exit(1);
} else if (exitCode !== 0) {
  console.error(`[perf-gate] FAIL: web build exited with code ${exitCode} after ${durationMs}ms`);
  process.exit(exitCode);
} else {
  console.log(`[perf-gate] PASS: web build completed in ${durationMs}ms (budget: ${BUDGET_MS}ms)`);
  process.exit(0);
}
