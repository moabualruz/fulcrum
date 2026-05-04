#!/usr/bin/env bun
/**
 * gen-conformance-trace.ts — P3#15
 *
 * Scans orchestrator.ts, tracker.ts, hooks.ts, workspace.ts, prompt.ts, retry.ts
 * for exported function/class names; maps each to a SPEC.md REQUIRED section via
 * FUNCTION_SPEC_MAP; writes docs/symphony-conformance.md with file:function → SPEC
 * section table; writes SHA-256 of the generated doc to .symphony-conformance.lock.
 *
 * Usage:
 *   bun run scripts/gen-conformance-trace.ts           # stdout
 *   bun run scripts/gen-conformance-trace.ts --write   # write doc + lock
 *   bun run scripts/gen-conformance-trace.ts --check   # CI gate — exits non-zero if stale
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORE_FILES = [
  "orchestrator.ts",
  "tracker.ts",
  "hooks.ts",
  "workspace.ts",
  "prompt.ts",
  "retry.ts",
  "workflow-runtime.ts",
] as const;

const SYMPHONY_DIR = "src/orchestration/symphony";

const specPath = join(process.cwd(), "vendor/openai-symphony/SPEC.md");
const tracePath = join(process.cwd(), "docs/symphony-conformance.md");
const lockPath = join(process.cwd(), ".symphony-conformance.lock");

// ---------------------------------------------------------------------------
// FUNCTION_SPEC_MAP — config table mapping function → SPEC section
// ---------------------------------------------------------------------------

/** Maps exported function/class name → { file, specSection }. */
export const FUNCTION_SPEC_MAP: Record<string, { file: string; specSection: string }> = {
  // orchestrator.ts
  claimRun: { file: "orchestrator.ts", specSection: "§Claim Lock — Unclaimed → Claimed Transition" },
  dispatchRunWithHooks: { file: "orchestrator.ts", specSection: "§Polling orchestrator with single-authority mutable state" },
  startSymphonyOrchestrator: { file: "orchestrator.ts", specSection: "§Polling orchestrator with single-authority mutable state" },
  ClaimConflictError: { file: "orchestrator.ts", specSection: "§Claim Lock — Unclaimed → Claimed Transition" },

  // tracker.ts
  fetchCandidateIssues: { file: "tracker.ts", specSection: "§Issue tracker client with candidate fetch + state refresh + terminal fetch" },
  fetchIssuesByStates: { file: "tracker.ts", specSection: "§Issue tracker client with candidate fetch + state refresh + terminal fetch" },
  fetchIssueStatesByIds: { file: "tracker.ts", specSection: "§Issue tracker client with candidate fetch + state refresh + terminal fetch" },
  buildCandidateIssuesBaseQuery: { file: "tracker.ts", specSection: "§Issue tracker client with candidate fetch + state refresh + terminal fetch" },

  // hooks.ts
  dispatchLifecycleHook: { file: "hooks.ts", specSection: "§Workspace lifecycle hooks (before_run, after_run, on_failure, on_cancel)" },
  HookTimeoutError: { file: "hooks.ts", specSection: "§Hook timeout config (hooks.timeout_ms, default 60000)" },
  resolveHookTimeoutMs: { file: "hooks.ts", specSection: "§Hook timeout config (hooks.timeout_ms, default 60000)" },

  // workspace.ts
  sanitizeWorkspaceKey: { file: "workspace.ts", specSection: "§Workspace manager with sanitized per-issue workspaces" },
  createWorkspace: { file: "workspace.ts", specSection: "§Workspace manager with sanitized per-issue workspaces" },
  destroyWorkspace: { file: "workspace.ts", specSection: "§Workspace cleanup for terminal issues" },
  getWorkspacePath: { file: "workspace.ts", specSection: "§Workspace manager with sanitized per-issue workspaces" },
  workspaceRoot: { file: "workspace.ts", specSection: "§Workspace manager with sanitized per-issue workspaces" },

  // prompt.ts
  renderPrompt: { file: "prompt.ts", specSection: "§Strict prompt rendering with issue and attempt variables" },
  parseWorkflowConfig: { file: "prompt.ts", specSection: "§Typed config layer with defaults and $ resolution" },
  loadWorkflowDef: { file: "prompt.ts", specSection: "§WORKFLOW.md loader with YAML front matter + prompt body split" },
  UnknownVariableError: { file: "prompt.ts", specSection: "§Strict prompt rendering with issue and attempt variables" },

  // retry.ts
  calcRetryDelay: { file: "retry.ts", specSection: "§Configurable retry backoff cap (agent.max_retry_backoff_ms, default 5m)" },
  scheduleRetry: { file: "retry.ts", specSection: "§Exponential retry queue with continuation retries after normal exit" },

  // workflow-runtime.ts
  loadWorkflowRuntime: { file: "workflow-runtime.ts", specSection: "§Workflow path selection supports explicit runtime path and cwd default" },
  createWorkflowRuntimeReloader: { file: "workflow-runtime.ts", specSection: "§Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt" },
  WorkflowNotFoundError: { file: "workflow-runtime.ts", specSection: "§Workflow path selection supports explicit runtime path and cwd default" },
  WorkflowFrontmatterError: { file: "workflow-runtime.ts", specSection: "§`WORKFLOW.md` loader with YAML front matter + prompt body split" },
  WorkflowConfigError: { file: "workflow-runtime.ts", specSection: "§Typed config layer with defaults and `$` resolution" },
};

// ---------------------------------------------------------------------------
// Type for mapping rows
// ---------------------------------------------------------------------------

export interface FunctionSpecRow {
  file: string;
  fn: string;
  specSection: string;
}

// ---------------------------------------------------------------------------
// scanExportedFunctions — regex-based scanner for exported symbols
// ---------------------------------------------------------------------------

/**
 * Scans a TypeScript file for exported function and class declarations.
 * Returns array of exported symbol names.
 */
export function scanExportedFunctions(filePath: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const names: string[] = [];

  // Match: export function name, export async function name, export class name
  const re = /^export\s+(?:async\s+)?(?:function|class)\s+(\w+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) names.push(m[1]);
  }

  return names;
}

// ---------------------------------------------------------------------------
// buildFunctionSpecMapping — maps scanned exports to SPEC sections
// ---------------------------------------------------------------------------

/**
 * Given a map of { filename: exportedNames[] }, returns rows for functions
 * that appear in FUNCTION_SPEC_MAP.
 */
export function buildFunctionSpecMapping(
  exports: Record<string, string[]>,
): FunctionSpecRow[] {
  const rows: FunctionSpecRow[] = [];

  for (const [file, fns] of Object.entries(exports)) {
    for (const fn of fns) {
      const entry = FUNCTION_SPEC_MAP[fn];
      if (entry && entry.file === file) {
        rows.push({ file, fn, specSection: entry.specSection });
      }
    }
  }

  // Sort for deterministic output
  rows.sort((a, b) => a.file.localeCompare(b.file) || a.fn.localeCompare(b.fn));
  return rows;
}

// ---------------------------------------------------------------------------
// requiredConformanceItems — parse SPEC.md §18.1
// ---------------------------------------------------------------------------

export function requiredConformanceItems(specText: string): string[] {
  const lines = specText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "### 18.1 REQUIRED for Conformance");
  if (start === -1) {
    throw new Error("SPEC.md missing 18.1 REQUIRED for Conformance checklist");
  }

  const items: string[] = [];
  let current: string[] | undefined;

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("### ")) {
      break;
    }

    if (line.startsWith("- ")) {
      if (current) {
        items.push(current.join(" ").replace(/\s+/g, " "));
      }
      current = [line.slice(2).trim()];
      continue;
    }

    if (current && /^\s{2,}\S/.test(line)) {
      current.push(line.trim());
    }
  }

  if (current) {
    items.push(current.join(" ").replace(/\s+/g, " "));
  }

  if (items.length === 0) {
    throw new Error("SPEC.md 18.1 checklist has no REQUIRED items");
  }

  return items;
}

// ---------------------------------------------------------------------------
// generateLockHash — SHA-256 of generated doc content
// ---------------------------------------------------------------------------

export function generateLockHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// renderTrace — generates the conformance doc with function mapping table
// ---------------------------------------------------------------------------

export function renderTrace(
  items: string[],
  functionMap: FunctionSpecRow[] = [],
): string {
  const sections = [
    "# Symphony Conformance Trace",
    "",
    "Source: `vendor/openai-symphony/SPEC.md`",
    "Lock: `.symphony-conformance.lock`",
    "",
    "## 18.1 REQUIRED for Conformance",
    "",
    ...items.flatMap((item, index) => [
      `### ${item}`,
      "",
      `Test ID: symphony-conformance-${String(index + 1).padStart(2, "0")}`,
      "",
    ]),
    "## Function → SPEC Mapping",
    "",
    "| File | Function | SPEC Section |",
    "|---|---|---|",
    ...functionMap.map((r) => `| ${r.file} | ${r.fn} | ${r.specSection} |`),
    "",
    "## AgentRun Orchestration State Trace",
    "",
    "Source: `vendor/openai-symphony/SPEC.md` section 7.1 Issue Orchestration States and section 7.2 Run Attempt Lifecycle.",
    "",
    "| Fulcrum `agent_runs.orchestration_state` | Symphony source | Notes |",
    "|---|---|---|",
    "| `unclaimed` | section 7.1 `Unclaimed` | Issue is not running and no retry is scheduled. |",
    "| `claimed` | section 7.1 `Claimed` | Orchestrator reserved the task; `agent_runs_claimed_task_id_check` requires `task_id` to avoid duplicate claimed rows with `NULL` task IDs. |",
    "| `running` | section 7.1 `Running` | Worker task exists and the run is tracked as active. |",
    "| `retry_queued` | section 7.1 `RetryQueued` | Worker is idle while a retry timer exists. |",
    "| `released` | section 7.1 `Released` | Claim removed because the tracker state is terminal, inactive, missing, or retry path completed without redispatch. |",
    "| `succeeded` | section 7.2 `Succeeded` | Terminal run-attempt reason after worker success. |",
    "| `failed` | section 7.2 `Failed` | Terminal run-attempt reason after worker failure. |",
    "| `timed_out` | section 7.2 `TimedOut` | Terminal run-attempt reason after timeout handling. |",
    "| `stalled` | section 7.2 `Stalled` | Terminal run-attempt reason after stall reconciliation. |",
    "| `cancelled` | section 7.2 `CanceledByReconciliation` | Fulcrum spelling uses D1 lowercase snake-case; maps to Symphony's reconciliation cancellation terminal reason. |",
    "",
    "## Approval/Sandbox Posture (D-09)",
    "",
    "Fulcrum implements the following defaults per SPEC §5.3.6 and §1 (implementation-defined posture):",
    "",
    "| Field | Default | Notes |",
    "|---|---|---|",
    "| `codex.command` | `codex app-server` | Shell command launched via `bash -lc` in the per-issue workspace. |",
    "| `codex.approval_policy` | `auto` (implementation-defined) | No interactive approval required by default; agents run autonomously. Operators override via `WORKFLOW.md` `codex.approval_policy`. |",
    "| `codex.thread_sandbox` | `noSandbox` (host mode) | Default is host-trust mode with an explicit trust-boundary warning on startup. Operators configure Docker/Podman/Vercel/Daytona/Modal/E2B via feature flags. |",
    "| `codex.turn_sandbox_policy` | implementation-defined | Pass-through to app-server; not enforced by Fulcrum orchestrator. |",
    "| `noSandbox` host boundary | Trust warning emitted | `src/orchestration/sandbox-runner.ts` emits a visible warning when `noSandbox` is the effective provider, reminding operators that agent commands run with host OS access. |",
    "",
  ];

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// scanCoreFiles — scan all six core files
// ---------------------------------------------------------------------------

function scanCoreFiles(root: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const file of CORE_FILES) {
    const filePath = join(root, SYMPHONY_DIR, file);
    if (existsSync(filePath)) {
      result[file] = scanExportedFunctions(filePath);
    } else {
      result[file] = [];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const args = new Set(process.argv.slice(2));
  const root = process.cwd();

  const specText = readFileSync(specPath, "utf8");
  const items = requiredConformanceItems(specText);

  const exports = scanCoreFiles(root);
  const functionMap = buildFunctionSpecMapping(exports);
  const output = renderTrace(items, functionMap);
  const hash = generateLockHash(output);

  if (args.has("--write")) {
    writeFileSync(tracePath, output);
    writeFileSync(lockPath, hash + "\n");
    return;
  }

  if (args.has("--check")) {
    if (!existsSync(tracePath) || readFileSync(tracePath, "utf8") !== output) {
      throw new Error("docs/symphony-conformance.md is stale; run: bun run scripts/gen-conformance-trace.ts --write");
    }
    if (!existsSync(lockPath) || readFileSync(lockPath, "utf8").trim() !== hash) {
      throw new Error(".symphony-conformance.lock is stale; run: bun run scripts/gen-conformance-trace.ts --write");
    }
    return;
  }

  process.stdout.write(output);
}

if (import.meta.main) {
  main();
}
