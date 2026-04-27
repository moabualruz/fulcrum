// Subprocess helpers shared across hooks. Wraps Bun.spawn for common patterns.

import { stat } from "node:fs/promises";

export async function which(cmd: string): Promise<string | null> {
  const proc = Bun.spawn(["sh", "-c", `command -v ${cmd}`], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out || null;
}

// Path-exists check that returns true for files OR directories. Bun.file().exists()
// returns false for directories, which silently broke index-check's graphify-out probe.
export async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exit: number;
}

/**
 * Run a command, capture stdout+stderr+exit. Never throws on non-zero exit.
 */
export async function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  return { stdout, stderr, exit };
}

/**
 * Spawn a detached background process; don't wait for it. Returns immediately.
 * Output to /dev/null unless `logFile` is given.
 */
export function spawnDetached(cmd: string[], opts: { cwd?: string; logFile?: string } = {}): void {
  const fd = opts.logFile ? Bun.file(opts.logFile) : null;
  Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdin: "ignore",
    stdout: fd ?? "ignore",
    stderr: fd ?? "ignore",
  });
}
