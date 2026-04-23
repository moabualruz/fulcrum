/**
 * PR 17 — `fulcrum install uninstall`
 *
 * Journal-driven symmetric uninstall. Reads the install journal written by
 * PR 16 and walks entries in REVERSE order to undo exactly what install did.
 *
 * Semantics per action type:
 *   write_file      — sha256 drift check; delete on match, orphan-rename on
 *                     mismatch (default) or delete regardless (--purge). For
 *                     directories, no drift check — always rm -rf.
 *   symlink         — rm -f only if target_path is still a symlink.
 *   native_cli      — executes entry.rollback as a shell command.
 *   managed_marker  — executes entry.rollback (sed or similar) to strip the
 *                     marker block. Never deletes the enclosing file.
 *   merge_json /
 *   merge_toml      — executes entry.rollback (node -e or sed) to reverse
 *                     the merge. rollback strings were recorded by PR 16.
 *
 * If no journal exists for the agent, falls back to wipeAgent() with a warning.
 * Journal is cleared after a run only when ZERO entries returned 'error'.
 * If any entry errored, the journal is preserved for debugging/retry.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as childProcess from "child_process";
import {
  readJournal,
  clearJournal,
  sha256File,
  type InstallJournalEntry,
} from "../packages/agent-fanout/src/install-journal.js";
import { wipeAgent, type WipeAgentName, type WipeScope } from "./wipe.js";

// ── public types ───────────────────────────────────────────────────────────────

export type UninstallActionResult = "ok" | "skipped" | "orphaned" | "error";

export interface UninstallAction {
  step_name: string;
  target_path: string;
  action: string;
  result: UninstallActionResult;
  reason?: string;
}

export interface UninstallResult {
  agent: string;
  dryRun: boolean;
  purge: boolean;
  actions: UninstallAction[];
  uninstalled: number;
  skipped: number;
  orphaned: number;
  errors: number;
  /** True when no journal was found and wipe fallback was invoked. */
  fallback: boolean;
}

export interface UninstallOpts {
  agent: string;
  dryRun?: boolean;
  purge?: boolean;
  /** Project root for project-scoped agents (cursor, windsurf, opencode, copilot). */
  targetDir?: string;
  /** Home directory for global-scoped agents (claude, gemini, codex, pi). */
  home?: string;
  /**
   * User scope only touches known user config/integration paths.
   * Project scope additionally permits targetDir-local files from project agents.
   */
  scope?: WipeScope;
}

// ── public API ─────────────────────────────────────────────────────────────────

export function uninstallAgent(opts: UninstallOpts): UninstallResult {
  const { agent, dryRun = false, purge = false } = opts;
  const targetDir = path.resolve(opts.targetDir ?? process.cwd());
  const home = path.resolve(opts.home ?? os.homedir());
  const scope = opts.scope ?? "user";

  const result: UninstallResult = {
    agent, dryRun, purge,
    actions: [], uninstalled: 0, skipped: 0, orphaned: 0, errors: 0, fallback: false,
  };

  const entries = readJournal(agent, targetDir);

  if (entries.length === 0) {
    // No journal → stale-journal fallback: wipe the agent (no-op if already clean).
    result.fallback = true;
    if (!dryRun) {
      const KNOWN_AGENTS: WipeAgentName[] = ["cursor", "windsurf", "codex", "opencode", "copilot", "claude", "gemini", "qwen", "pi"];
      if (KNOWN_AGENTS.includes(agent as WipeAgentName)) {
        wipeAgent({ agent: agent as WipeAgentName, dryRun: false, targetDir, home, scope });
      }
    }
    return result;
  }

  // Walk in REVERSE order of journal writes.
  for (const entry of [...entries].reverse()) {
    const action = applyReversal(entry, dryRun, purge, targetDir, home, scope);
    result.actions.push(action);
    if (action.result === "ok") result.uninstalled++;
    else if (action.result === "orphaned") result.orphaned++;
    else if (action.result === "error") result.errors++;
    else result.skipped++;
  }

  // Preserve the journal if any rollback errored — it's the only forensic record
  // that allows a retry. Only clear on a fully-clean (all ok/skipped/orphaned) run.
  if (!dryRun && result.errors === 0) {
    clearJournal(agent, targetDir);
  }

  return result;
}

// ── reversal dispatch ──────────────────────────────────────────────────────────

function applyReversal(
  entry: InstallJournalEntry,
  dryRun: boolean,
  purge: boolean,
  targetDir: string,
  home: string,
  scope: WipeScope,
): UninstallAction {
  const base = { step_name: entry.step_name, target_path: entry.target_path, action: entry.action };

  // Boundary check: target_path must be inside known user config roots.
  // Project-local paths are allowed only when scope="project".
  if (isNonFileTarget(entry.target_path)) {
    if (!isAllowedNonFileTarget(entry)) {
      return { ...base, result: "skipped", reason: "target_path outside allowed roots" };
    }
  } else if (!isAllowedFileTarget(entry.target_path, targetDir, home, scope)) {
    return { ...base, result: "skipped", reason: "target_path outside allowed roots" };
  }

  switch (entry.action) {
    case "write_file":
      return reverseWriteFile(entry, dryRun, purge, base);

    case "symlink":
      return reverseSymlink(entry, dryRun, base);

    case "native_cli":
    case "managed_marker":
    case "merge_json":
    case "merge_toml":
      return execRollback(entry, dryRun, base);

    default:
      return { ...base, result: "skipped", reason: `unknown action: ${entry.action}` };
  }
}

function reverseWriteFile(
  entry: InstallJournalEntry,
  dryRun: boolean,
  purge: boolean,
  base: Pick<UninstallAction, "step_name" | "target_path" | "action">,
): UninstallAction {
  if (!fs.existsSync(entry.target_path)) {
    return { ...base, result: "skipped", reason: "already gone" };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(entry.target_path);
  } catch {
    return { ...base, result: "skipped", reason: "already gone" };
  }

  if (stat.isDirectory()) {
    // Directories have no useful sha256; always remove.
    if (!dryRun) fs.rmSync(entry.target_path, { recursive: true, force: true });
    return { ...base, result: "ok" };
  }

  // File: drift detection via sha256_after when recorded and not purging.
  if (entry.sha256_after && !purge) {
    const current = sha256File(entry.target_path);
    if (current !== entry.sha256_after) {
      const orphanPath = uniqueOrphanPath(entry.target_path);
      if (!dryRun) fs.renameSync(entry.target_path, orphanPath);
      return { ...base, result: "orphaned", reason: "sha256 mismatch — hand-edited" };
    }
  }

  if (!dryRun) fs.rmSync(entry.target_path, { force: true });
  return { ...base, result: "ok" };
}

function reverseSymlink(
  entry: InstallJournalEntry,
  dryRun: boolean,
  base: Pick<UninstallAction, "step_name" | "target_path" | "action">,
): UninstallAction {
  let stat: fs.Stats | undefined;
  try { stat = fs.lstatSync(entry.target_path); } catch { /* not found */ }
  if (!stat) return { ...base, result: "skipped", reason: "already gone" };
  if (!stat.isSymbolicLink()) return { ...base, result: "skipped", reason: "not a symlink" };
  if (!dryRun) fs.rmSync(entry.target_path, { force: true });
  return { ...base, result: "ok" };
}

function execRollback(
  entry: InstallJournalEntry,
  dryRun: boolean,
  base: Pick<UninstallAction, "step_name" | "target_path" | "action">,
): UninstallAction {
  if (!entry.rollback) {
    return { ...base, result: "skipped", reason: "no rollback recorded" };
  }
  if (dryRun) {
    return { ...base, result: "ok" };
  }
  try {
    childProcess.execSync(entry.rollback, { stdio: "pipe" });
    return { ...base, result: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...base, result: "error", reason: msg };
  }
}

// ── utilities ──────────────────────────────────────────────────────────────────

/**
 * Returns a `.fulcrum-orphan` path that doesn't already exist by appending a
 * timestamp suffix to avoid silently overwriting an earlier orphan.
 */
function uniqueOrphanPath(filePath: string): string {
  const base = filePath + ".fulcrum-orphan";
  if (!fs.existsSync(base)) return base;
  return `${base}.${Date.now()}`;
}

function isNonFileTarget(targetPath: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(targetPath);
}

function isAllowedNonFileTarget(entry: InstallJournalEntry): boolean {
  return entry.action === "native_cli"
    && entry.agent === "claude"
    && entry.target_path === "claude://plugin/fulcrum";
}

function isAllowedFileTarget(targetPath: string, targetDir: string, home: string, scope: WipeScope): boolean {
  const resolved = path.resolve(targetPath);
  const allowedRoots = userScopeRoots(home);
  if (scope === "project") allowedRoots.push(targetDir);
  return allowedRoots.some(root => isWithinOrEqual(resolved, root));
}

function isWithinOrEqual(target: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  return target === resolvedRoot || target.startsWith(resolvedRoot + path.sep);
}

function userScopeRoots(home: string): string[] {
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".local", "state", "fulcrum"),
    path.join(home, ".claude"),
    path.join(home, ".claude.json"),
    path.join(home, ".gemini"),
    path.join(home, ".qwen"),
    path.join(home, ".codex"),
    path.join(home, ".pi"),
    path.join(home, ".agents", "plugins"),
    path.join(home, ".opencode"),
    path.join(home, ".config", "codex"),
    path.join(home, ".config", "opencode"),
    path.join(home, ".config", "github-copilot"),
  ];
}
