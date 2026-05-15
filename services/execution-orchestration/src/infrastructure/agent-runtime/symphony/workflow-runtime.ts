/**
 * Symphony WORKFLOW.md filesystem runtime loader.
 *
 * Implements spec §5.1-§5.5:
 * - Explicit workflowPath wins over ${cwd}/WORKFLOW.md default (SYM-01)
 * - Strict YAML front matter / Markdown body split (SYM-03)
 * - Typed config with env $VAR and ~ expansion (SYM-21)
 * - Missing $VAR fails with WorkflowConfigError (SYM-24)
 * - Default codex.command = "codex app-server" (SYM-14)
 * - Dynamic reload preserving last-good (SYM-02, D-07)
 */

import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class WorkflowNotFoundError extends Error {
  readonly kind = "missing_workflow_file" as const;
  readonly workflowPath: string;

  constructor(workflowPath: string, options?: ErrorOptions) {
    super(`WORKFLOW.md not found: ${workflowPath}`, options);
    this.name = "WorkflowNotFoundError";
    this.workflowPath = workflowPath;
  }
}

export class WorkflowFrontmatterError extends Error {
  readonly kind = "workflow_parse_error" as const;
  readonly workflowPath: string;

  constructor(workflowPath: string, message: string, options?: ErrorOptions) {
    super(`WORKFLOW.md front matter error at ${workflowPath}: ${message}`, options);
    this.name = "WorkflowFrontmatterError";
    this.workflowPath = workflowPath;
  }
}

export class WorkflowConfigError extends Error {
  readonly kind = "workflow_config_error" as const;
  readonly workflowPath: string;

  constructor(workflowPath: string, message: string, options?: ErrorOptions) {
    super(`WORKFLOW.md config error at ${workflowPath}: ${message}`, options);
    this.name = "WorkflowConfigError";
    this.workflowPath = workflowPath;
  }
}

// ---------------------------------------------------------------------------
// Config schema (typed front matter per §5.3)
// ---------------------------------------------------------------------------

const TrackerConfigSchema = z.object({
  kind: z.string().default("linear"),
  endpoint: z.string().optional(),
  api_key: z.string().optional(),
  project_slug: z.string().optional(),
  active_states: z.array(z.string()).optional(),
  terminal_states: z.array(z.string()).optional(),
}).passthrough();

const PollingConfigSchema = z.object({
  interval_ms: z.number().int().positive().default(30_000),
}).passthrough();

const WorkspaceConfigSchema = z.object({
  root: z.string().optional(),
}).passthrough();

const HooksConfigSchema = z.object({
  after_create: z.string().optional(),
  before_run: z.string().optional(),
  after_run: z.string().optional(),
  before_remove: z.string().optional(),
  timeout_ms: z.number().int().positive().default(60_000),
}).passthrough();

const AgentConfigSchema = z.object({
  max_concurrent_agents: z.number().int().positive().default(10),
  max_turns: z.number().int().positive().default(20),
  max_retry_backoff_ms: z.number().int().positive().default(300_000),
  max_concurrent_agents_by_state: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

const CodexConfigSchema = z.object({
  command: z.string().default("codex app-server"),
  approval_policy: z.string().optional(),
  thread_sandbox: z.string().optional(),
  turn_sandbox_policy: z.string().optional(),
  turn_timeout_ms: z.number().int().positive().default(3_600_000),
  read_timeout_ms: z.number().int().positive().default(5_000),
  stall_timeout_ms: z.number().int().default(300_000),
}).passthrough();

const WorkflowRawConfigSchema = z.object({
  tracker: TrackerConfigSchema.optional(),
  polling: PollingConfigSchema.optional(),
  workspace: WorkspaceConfigSchema.optional(),
  hooks: HooksConfigSchema.optional(),
  agent: AgentConfigSchema.optional(),
  codex: CodexConfigSchema.optional(),
  // Legacy / existing fields forwarded from schemas.ts
  stall_timeout_ms: z.number().int().positive().optional(),
  max_retry_backoff_ms: z.number().int().positive().optional(),
  keepOnFailure: z.boolean().optional(),
  maxAttempts: z.number().int().positive().optional(),
}).passthrough();

export type WorkflowRuntimeConfig = {
  tracker?: z.infer<typeof TrackerConfigSchema>;
  polling?: z.infer<typeof PollingConfigSchema>;
  workspace?: z.infer<typeof WorkspaceConfigSchema>;
  hooks?: z.infer<typeof HooksConfigSchema>;
  agent: Omit<z.infer<typeof AgentConfigSchema>, "max_concurrent_agents_by_state"> & {
    max_concurrent_agents_by_state: Record<string, number>;
  };
  codex: z.infer<typeof CodexConfigSchema>;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Runtime object
// ---------------------------------------------------------------------------

export interface WorkflowRuntime {
  /** Absolute path to the loaded WORKFLOW.md file */
  workflowPath: string;
  /** Trimmed Markdown body (prompt template) */
  promptTemplate: string;
  /** Typed config with defaults applied and expansions resolved */
  config: WorkflowRuntimeConfig;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LoadWorkflowRuntimeOptions {
  /** Explicit workflow file path. If omitted, uses ${cwd}/WORKFLOW.md */
  workflowPath?: string;
  /** Process working directory for cwd-default resolution */
  cwd: string;
  /** Environment variables for $VAR resolution */
  env: Record<string, string | undefined>;
  /** Home directory for ~ expansion */
  homeDir: string;
}

// ---------------------------------------------------------------------------
// File split: YAML front matter + Markdown body
// ---------------------------------------------------------------------------

function splitFrontMatter(content: string): { frontMatterYaml: string | null; body: string } {
  // Front matter present only when file starts with exactly "---"
  if (!content.startsWith("---")) {
    return { frontMatterYaml: null, body: content };
  }

  const afterFirst = content.slice(3);
  // Find the closing ---
  const closingIdx = afterFirst.indexOf("\n---");
  if (closingIdx === -1) {
    // No closing delimiter — treat whole file as body
    return { frontMatterYaml: null, body: content };
  }

  const frontMatterYaml = afterFirst.slice(0, closingIdx);
  const body = afterFirst.slice(closingIdx + 4); // skip "\n---"
  return { frontMatterYaml, body };
}

// ---------------------------------------------------------------------------
// $VAR expansion — applies to string values where spec allows env indirection
// ---------------------------------------------------------------------------

function expandVar(
  value: string,
  env: Record<string, string | undefined>,
  workflowPath: string,
): string {
  if (!value.startsWith("$")) return value;
  const varName = value.slice(1);
  const resolved = env[varName];
  if (resolved === undefined || resolved === "") {
    throw new WorkflowConfigError(
      workflowPath,
      `environment variable $${varName} is not set or empty`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// ~ expansion — applies to path string values
// ---------------------------------------------------------------------------

function expandTilde(value: string, homeDir: string): string {
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return homeDir + value.slice(1);
  return value;
}

function resolveWorkspaceRoot(root: string, workflowPath: string): string {
  return isAbsolute(root) ? resolve(root) : resolve(dirname(workflowPath), root);
}

function applyLinearTrackerDefaults(
  tracker: z.infer<typeof TrackerConfigSchema>,
): z.infer<typeof TrackerConfigSchema> {
  if (tracker.kind !== "linear") return tracker;
  return {
    ...tracker,
    endpoint: tracker.endpoint ?? "https://api.linear.app/graphql",
    active_states: tracker.active_states ?? ["Todo", "In Progress"],
    terminal_states: tracker.terminal_states ?? ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"],
  };
}

function normalizePerStateConcurrency(input: Record<string, unknown>): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [state, value] of Object.entries(input)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) continue;
    normalized[state.toLowerCase()] = value;
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Expand env/path values in tracker and workspace sections
// ---------------------------------------------------------------------------

function expandConfig(
  raw: z.infer<typeof WorkflowRawConfigSchema>,
  env: Record<string, string | undefined>,
  homeDir: string,
  workflowPath: string,
): WorkflowRuntimeConfig {
  // Tracker: expand api_key $VAR
  let tracker = TrackerConfigSchema.parse(raw.tracker ?? {});
  if (typeof tracker.api_key === "string" && tracker.api_key.startsWith("$")) {
    tracker.api_key = expandVar(tracker.api_key, env, workflowPath);
  }
  tracker = applyLinearTrackerDefaults(tracker);

  // Workspace: expand root ~ and $VAR
  const workspace = WorkspaceConfigSchema.parse(raw.workspace ?? {});
  let workspaceRoot = workspace.root ?? join(tmpdir(), "symphony_workspaces");
  if (workspaceRoot.startsWith("$")) {
    workspaceRoot = expandVar(workspaceRoot, env, workflowPath);
  }
  workspace.root = resolveWorkspaceRoot(expandTilde(workspaceRoot, homeDir), workflowPath);

  const hooks = HooksConfigSchema.parse(raw.hooks ?? {});

  const agentRaw = AgentConfigSchema.parse(raw.agent ?? {});
  const agent: WorkflowRuntimeConfig["agent"] = {
    ...agentRaw,
    max_concurrent_agents_by_state: normalizePerStateConcurrency(
      agentRaw.max_concurrent_agents_by_state,
    ),
  };

  // Codex with default command
  const codexRaw = raw.codex ?? {};
  const codex = CodexConfigSchema.parse(codexRaw);

  return {
    ...raw,
    tracker,
    workspace,
    hooks,
    codex,
    agent,
  };
}

// ---------------------------------------------------------------------------
// loadWorkflowRuntime — main loader
// ---------------------------------------------------------------------------

export async function loadWorkflowRuntime(
  options: LoadWorkflowRuntimeOptions,
): Promise<WorkflowRuntime> {
  const resolvedPath = options.workflowPath ?? join(options.cwd, "WORKFLOW.md");

  // Read file — missing file → WorkflowNotFoundError
  let content: string;
  try {
    content = await readFile(resolvedPath, "utf8");
  } catch (err) {
    throw new WorkflowNotFoundError(resolvedPath, { cause: err });
  }

  // Split front matter / body
  const { frontMatterYaml, body } = splitFrontMatter(content);

  // Parse YAML front matter
  let rawConfig: z.infer<typeof WorkflowRawConfigSchema>;
  if (frontMatterYaml === null) {
    // No front matter — empty config, entire content is body
    rawConfig = WorkflowRawConfigSchema.parse({});
  } else {
    let parsed: unknown;
    try {
      parsed = parseYaml(frontMatterYaml.trim() === "" ? "{}" : frontMatterYaml);
    } catch (err) {
      throw new WorkflowFrontmatterError(
        resolvedPath,
        err instanceof Error ? err.message : String(err),
        { cause: err },
      );
    }

    // Must be a plain object/map
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new WorkflowFrontmatterError(
        resolvedPath,
        "front matter must be a YAML map/object, not a scalar or list",
      );
    }

    try {
      rawConfig = WorkflowRawConfigSchema.parse(parsed);
    } catch (err) {
      throw new WorkflowFrontmatterError(
        resolvedPath,
        err instanceof Error ? err.message : String(err),
        { cause: err },
      );
    }
  }

  // Expand env/path values — may throw WorkflowConfigError for missing $VAR
  const config = expandConfig(rawConfig, options.env, options.homeDir, resolvedPath);

  return {
    workflowPath: resolvedPath,
    promptTemplate: (frontMatterYaml === null ? content : body).trim(),
    config,
  };
}

// ---------------------------------------------------------------------------
// Task 03-01-03: createWorkflowRuntimeReloader — reload last-good support
// ---------------------------------------------------------------------------

export type ReloadResult =
  | { ok: true; runtime: WorkflowRuntime; error: null }
  | {
      ok: false;
      runtime: WorkflowRuntime;
      error: { message: string; kind: string; workflowPath: string };
    };

export interface WorkflowRuntimeReloader {
  /** Returns the current (last-good) runtime */
  current(): WorkflowRuntime;
  /**
   * Attempts to reload the workflow file.
   * - Valid: returns { ok: true, runtime: newRuntime, error: null } and replaces lastGood.
   * - Invalid: returns { ok: false, runtime: lastGood, error } without replacing lastGood.
   * - Detects server.port changes and sets restartRequired: true when listener settings change.
   */
  reload(): Promise<ReloadResult>;
}

export interface ReloaderOptions extends LoadWorkflowRuntimeOptions {
  /** Called when a reload result is ready (for operator-visible logging) */
  onReload?: (result: ReloadResult) => void;
}

export async function createWorkflowRuntimeReloader(
  options: ReloaderOptions,
): Promise<WorkflowRuntimeReloader> {
  let lastGood: WorkflowRuntime = await loadWorkflowRuntime(options);

  return {
    current(): WorkflowRuntime {
      return lastGood;
    },

    async reload(): Promise<ReloadResult> {
      let newRuntime: WorkflowRuntime;
      try {
        newRuntime = await loadWorkflowRuntime(options);
      } catch (err) {
        const error = {
          message: err instanceof Error ? err.message : String(err),
          kind: (err as { kind?: string }).kind ?? "unknown",
          workflowPath: options.workflowPath ?? join(options.cwd, "WORKFLOW.md"),
        };
        const result: ReloadResult = { ok: false, runtime: lastGood, error };
        options.onReload?.(result);
        return result;
      }

      // Check for server port changes that require restart
      const oldPort = (lastGood.config as { server?: { port?: unknown } }).server?.port;
      const newPort = (newRuntime.config as { server?: { port?: unknown } }).server?.port;
      const restartRequired = oldPort !== undefined && oldPort !== newPort;
      if (restartRequired) {
        // Attach restartRequired flag to the new runtime config for callers
        (newRuntime as { restartRequired?: boolean }).restartRequired = true;
      }

      lastGood = newRuntime;
      const result: ReloadResult = { ok: true, runtime: newRuntime, error: null };
      options.onReload?.(result);
      return result;
    },
  };
}
