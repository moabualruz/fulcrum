import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

type RunResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly elapsedMs: number;
};

const CLI = ["bun", "apps/cli/src/main.ts"] as const;

async function runFulcrum(args: readonly string[]): Promise<RunResult> {
  const start = performance.now();
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      FULCRUM_TRACE_ID: "trace-startup-budget",
      FULCRUM_COMMIT: "test-commit",
      FULCRUM_BUILD_DATE: "2026-05-21T00:00:00Z",
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode, elapsedMs: performance.now() - start };
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

describe("CLI startup performance budget (CLI-TUI-UX.md §15)", () => {
  test("--version stays under the 500 ms lightweight startup budget", async () => {
    const runs: RunResult[] = [];
    await runFulcrum(["--version"]);
    for (let i = 0; i < 5; i += 1) runs.push(await runFulcrum(["--version"]));

    for (const run of runs) {
      expect(run.exitCode).toBe(0);
      expect(run.stderr).toBe("");
      expect(run.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    }

    const elapsed = runs.map((run) => run.elapsedMs);
    const p95 = percentile(elapsed, 95);
    expect(
      p95,
      `CLI startup budget exceeded for fulcrum --version. Fix: keep --version on the lightweight apps/cli/src/main.ts fast path and avoid server/web/TUI imports. trace=trace-startup-budget timings=${elapsed.map((n) => n.toFixed(1)).join(",")}`,
    ).toBeLessThanOrEqual(500);
  });

  test("--help stays under the 500 ms lightweight startup budget", async () => {
    const runs: RunResult[] = [];
    await runFulcrum(["--help"]);
    for (let i = 0; i < 5; i += 1) runs.push(await runFulcrum(["--help"]));

    for (const run of runs) {
      expect(run.exitCode).toBe(0);
      expect(run.stderr).toBe("");
      expect(run.stdout).toContain("Usage:");
      expect(run.stdout).toContain("fulcrum completion <bash|zsh|fish|powershell>");
    }

    const elapsed = runs.map((run) => run.elapsedMs);
    const p95 = percentile(elapsed, 95);
    expect(
      p95,
      `CLI startup budget exceeded for fulcrum --help. Fix: keep --help on apps/cli/src/help.ts and avoid importing the command dispatcher. trace=trace-startup-budget timings=${elapsed.map((n) => n.toFixed(1)).join(",")}`,
    ).toBeLessThanOrEqual(500);
  });

  test("--version --json emits the canonical fast-path envelope", async () => {
    const result = await runFulcrum(["--version", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const envelope = JSON.parse(result.stdout.trim());
    expect(envelope).toMatchObject({
      schema: "fulcrum.cli.v1",
      trace_id: "trace-startup-budget",
      command: "fulcrum version",
      args: {},
      result: {
        version: "0.1.0",
        commit: "test-commit",
        build_date: "2026-05-21T00:00:00Z",
      },
      errors: [],
      next_actions: [],
    });
  });

  test("fast paths do not statically import server, web, or TUI-heavy dispatch", async () => {
    const main = await readFile(new URL("../../apps/cli/src/main.ts", import.meta.url), "utf8");
    const help = await readFile(new URL("../../apps/cli/src/help.ts", import.meta.url), "utf8");

    expect(main).toContain('from "./help.ts"');
    expect(main).not.toContain('from "./index.ts"');
    expect(main).not.toContain("@platform-core/application/runtime/local-application-container");
    expect(main).not.toContain("@fulcrum/tui");
    expect(main).not.toContain("@fulcrum/web");
    expect(main).toContain('case "completion"');
    expect(main).toContain('await import("./completion.ts")');
    expect(help).toContain("fulcrum completion <bash|zsh|fish|powershell>");
  });
});
