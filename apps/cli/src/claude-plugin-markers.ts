// Claude plugin ownership markers.
//
// Why: Fulcrum must never invoke `claude plugin install/uninstall` for plugins
// it does not own. Without proof of provenance, uninstall can remove a
// user-installed plugin and broad cache cleanups can wipe Claude state the
// user depends on (this has been observed to log users out of Claude). Every
// successful Fulcrum-driven `claude plugin install` writes a marker; every
// uninstall path checks for one and skips with a manual command if it is
// missing.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ClaudePluginMarker {
  plugin: string;          // e.g. "fulcrum@fulcrum" or "caveman@caveman"
  marketplace?: string;    // e.g. "moabualruz/fulcrum"
  source?: string;         // free-form provenance (lockfile path, repo, etc.)
  operation: "install" | "marketplace-add";
  fulcrumVersion?: string;
  recordedAt: string;      // ISO timestamp
}

/** Allow `claude plugin install` from `fulcrum install` paths only when the
 *  user explicitly opts in via `--allow-claude-cli` or env. Default off. */
export function isClaudeCliAllowed(): boolean {
  return process.env["FULCRUM_ALLOW_CLAUDE_CLI"] === "1";
}

export function setClaudeCliAllowed(value: boolean): void {
  if (value) process.env["FULCRUM_ALLOW_CLAUDE_CLI"] = "1";
  else delete process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

export function markersDir(): string {
  return join(fulcrumHome(), "state", "global", "claude-plugin-markers");
}

function markerFileName(plugin: string): string {
  // claude plugin specs are "<name>@<marketplace>"; replace separators for fs safety.
  return plugin.replace(/[^A-Za-z0-9._-]+/g, "__") + ".json";
}

export function markerPath(plugin: string): string {
  return join(markersDir(), markerFileName(plugin));
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function hasMarker(plugin: string): Promise<boolean> {
  return exists(markerPath(plugin));
}

export async function readMarker(plugin: string): Promise<ClaudePluginMarker | null> {
  try {
    const raw = await readFile(markerPath(plugin), "utf8");
    return JSON.parse(raw) as ClaudePluginMarker;
  } catch {
    return null;
  }
}

export async function writeMarker(marker: Omit<ClaudePluginMarker, "recordedAt">): Promise<void> {
  await mkdir(markersDir(), { recursive: true });
  const payload: ClaudePluginMarker = { ...marker, recordedAt: new Date().toISOString() };
  await writeFile(markerPath(marker.plugin), JSON.stringify(payload, null, 2) + "\n");
}

export async function removeMarker(plugin: string): Promise<void> {
  await rm(markerPath(plugin), { force: true });
}

export async function listMarkers(): Promise<ClaudePluginMarker[]> {
  try {
    const files = await readdir(markersDir());
    const out: ClaudePluginMarker[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(markersDir(), f), "utf8");
        out.push(JSON.parse(raw) as ClaudePluginMarker);
      } catch {
        // ignore malformed marker
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Decide whether a `claude plugin install` should fire now.
 *
 * - If a marker already exists → yes (Fulcrum already owns this plugin).
 * - Else if --allow-claude-cli was passed → yes (explicit opt-in).
 * - Otherwise → no; caller prints a manual command.
 */
export async function shouldInstallClaudePlugin(plugin: string): Promise<boolean> {
  if (await hasMarker(plugin)) return true;
  return isClaudeCliAllowed();
}

/**
 * Decide whether a `claude plugin uninstall` should fire now.
 *
 * - If a marker exists → yes (Fulcrum installed it).
 * - Otherwise → no; caller prints a manual command and leaves Claude state
 *   untouched. This is the rule that protects users from being logged out by
 *   Fulcrum touching plugins it never installed.
 */
export async function shouldUninstallClaudePlugin(plugin: string): Promise<boolean> {
  return hasMarker(plugin);
}

export interface SafeInstallOptions {
  marketplace?: string;
  source?: string;
  dryRun?: boolean;
  manualHint?: string;
  fulcrumVersion?: string;
}

export interface SafeRunResult {
  ran: boolean;
  ok: boolean;
  reason?: string;
  exit?: number;
  stderr?: string;
}

/**
 * Run `claude plugin install <plugin>` only when Fulcrum is allowed to
 * mutate Claude state for this plugin. Writes an ownership marker on success.
 *
 * Returns `{ran: false}` with a reason when the call was skipped: caller
 * should print a manual hint, NOT escalate.
 */
export async function safeClaudePluginInstall(
  plugin: string,
  opts: SafeInstallOptions = {},
): Promise<SafeRunResult> {
  if (opts.dryRun) {
    return { ran: false, ok: true, reason: "dry-run" };
  }
  if (!(await shouldInstallClaudePlugin(plugin))) {
    return {
      ran: false,
      ok: true,
      reason: "confirmation required; pass --allow-claude-cli to opt in",
    };
  }
  const { run } = await import("@platform-core/application/runtime-support/process-runner.ts");
  const result = await run(["claude", "plugin", "install", plugin]);
  if (result.exit === 0) {
    await writeMarker({
      plugin,
      ...(opts.marketplace ? { marketplace: opts.marketplace } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      operation: "install",
      ...(opts.fulcrumVersion ? { fulcrumVersion: opts.fulcrumVersion } : {}),
    });
    return { ran: true, ok: true, exit: 0 };
  }
  return { ran: true, ok: false, exit: result.exit, stderr: result.stderr };
}

/**
 * Run `claude plugin uninstall <plugin>` only when Fulcrum has a marker for
 * it. Removes the marker on success. Without a marker, returns
 * `{ran: false, reason: "no-marker"}` and the caller should print a manual
 * command rather than touching Claude state.
 */
export async function safeClaudePluginUninstall(
  plugin: string,
  opts: { dryRun?: boolean } = {},
): Promise<SafeRunResult> {
  if (opts.dryRun) {
    return { ran: false, ok: true, reason: "dry-run" };
  }
  if (!(await shouldUninstallClaudePlugin(plugin))) {
    return {
      ran: false,
      ok: true,
      reason: "no-marker; manual command required",
    };
  }
  const { run } = await import("@platform-core/application/runtime-support/process-runner.ts");
  const result = await run(["claude", "plugin", "uninstall", plugin]);
  if (result.exit === 0) {
    await removeMarker(plugin);
    return { ran: true, ok: true, exit: 0 };
  }
  return { ran: true, ok: false, exit: result.exit, stderr: result.stderr };
}
