/**
 * PR 16 unit 16.1 — install journal.
 *
 * Append-only JSONL log of every install step. PR 17's uninstall reads this
 * to reverse exactly what was written.
 *
 * Storage strategy:
 *   Global-scoped agents (claude, gemini, codex, pi):
 *     ${FULCRUM_STATE_DIR | XDG_STATE_HOME/fulcrum | ~/.local/state/fulcrum}/install/<agent>.jsonl
 *
 *   Project-scoped agents (cursor, windsurf, opencode, copilot):
 *     <targetDir>/.fulcrum/install.jsonl  (single file; filtered by agent on read)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

// ── types ─────────────────────────────────────────────────────────────────────

export type InstallAction =
  | "write_file"
  | "merge_json"
  | "merge_toml"
  | "symlink"
  | "native_cli"
  | "managed_marker";

export type InstallMode = "native" | "manual";

export interface InstallJournalEntry {
  ts: string;              // ISO8601
  agent: string;           // one of 8 agent slugs
  step_name: string;       // human-readable step label
  action: InstallAction;
  target_path: string;     // absolute path
  rollback: string;        // shell command or structured instruction
  mode: InstallMode;
  install_run_id: string;  // groups entries for one install invocation
  sha256_before?: string;  // for merge_json/merge_toml — drift detection
  sha256_after?: string;
}

// ── global-scoped agents ──────────────────────────────────────────────────────

const GLOBAL_AGENTS = new Set(["claude", "gemini", "codex", "pi"]);

export function isGlobalAgent(agent: string): boolean {
  return GLOBAL_AGENTS.has(agent);
}

// ── state directory ───────────────────────────────────────────────────────────

/**
 * Returns the Fulcrum state directory root.
 * Priority: FULCRUM_STATE_DIR > XDG_STATE_HOME/fulcrum > ~/.local/state/fulcrum
 */
export function globalStateDir(): string {
  if (process.env["FULCRUM_STATE_DIR"]) return process.env["FULCRUM_STATE_DIR"];
  const xdg = process.env["XDG_STATE_HOME"];
  if (xdg) return path.join(xdg, "fulcrum");
  return path.join(os.homedir(), ".local", "state", "fulcrum");
}

// ── journal path resolution ───────────────────────────────────────────────────

/**
 * Returns the absolute path of the journal file for a given agent.
 *
 * @param agent     Agent slug (claude, cursor, opencode, …)
 * @param targetDir Required for project-scoped agents; ignored for global agents.
 */
export function journalPath(agent: string, targetDir?: string): string {
  if (isGlobalAgent(agent)) {
    return path.join(globalStateDir(), "install", `${agent}.jsonl`);
  }
  if (!targetDir) {
    // project-scoped without targetDir → use cwd
    targetDir = process.cwd();
  }
  return path.join(targetDir, ".fulcrum", "install.jsonl");
}

// ── read / write helpers ──────────────────────────────────────────────────────

function parseLines(raw: string): InstallJournalEntry[] {
  return raw
    .split("\n")
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as InstallJournalEntry);
}

// ── public API ────────────────────────────────────────────────────────────────

export interface ReadJournalOpts {
  /** Filter to only entries with this install_run_id */
  runId?: string;
}

/**
 * Append a single entry to the journal. Creates the parent directory if needed.
 *
 * @param entry     The journal entry to append.
 * @param targetDir For project-scoped agents — the project root. If omitted,
 *                  falls back to cwd for project-scoped agents and is ignored
 *                  for global-scoped agents.
 */
export function appendJournal(entry: InstallJournalEntry, targetDir?: string): void {
  const file = journalPath(entry.agent, targetDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
}

/**
 * Read all journal entries for an agent, in append order.
 *
 * @param agent     Agent slug to filter by.
 * @param targetDir For project-scoped agents — the project root.
 * @param opts      Optional filters (runId).
 */
export function readJournal(
  agent: string,
  targetDir?: string,
  opts: ReadJournalOpts = {},
): InstallJournalEntry[] {
  const file = journalPath(agent, targetDir);
  if (!fs.existsSync(file)) return [];
  let entries = parseLines(fs.readFileSync(file, "utf8")).filter(e => e.agent === agent);
  if (opts.runId) entries = entries.filter(e => e.install_run_id === opts.runId);
  return entries;
}

/**
 * Remove all journal entries for an agent.
 * For global-scoped agents this deletes the per-agent file.
 * For project-scoped agents this rewrites the shared file without the agent's rows.
 */
export function clearJournal(agent: string, targetDir?: string): void {
  const file = journalPath(agent, targetDir);
  if (!fs.existsSync(file)) return;

  if (isGlobalAgent(agent)) {
    fs.rmSync(file, { force: true });
    return;
  }

  // Project-scoped: rewrite without this agent's rows
  const remaining = parseLines(fs.readFileSync(file, "utf8")).filter(e => e.agent !== agent);
  if (remaining.length === 0) {
    fs.rmSync(file, { force: true });
  } else {
    fs.writeFileSync(file, remaining.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }
}

// ── utility: compute sha256 of a file for drift detection ────────────────────

export function sha256File(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Convenience: generate a fresh install_run_id (timestamp-based).
 */
export function newRunId(): string {
  return `run-${Date.now()}`;
}
