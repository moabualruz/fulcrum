import { writeFile, readFile, stat as fsStat } from "node:fs/promises";

import { apiErrorCode, formatUnknownError } from "../api-errors.ts";
import {
  emitErrorResult,
  emitResult,
  emitStreamEnd,
  emitStreamEnvelope,
} from "../lib/cli-output.ts";
import { newTraceId } from "../lib/envelope.ts";
import { createAgentRunApiCallerFromEnv } from "@execution-orchestration/interface/http/agent-run-api-client.ts";
import { createConnectorApiCallerFromEnv } from "@integration-hub/interface/http/connector-api-client.ts";
import { createWebhookApiCallerFromEnv } from "@integration-hub/interface/http/webhook-api-client.ts";
import { createNotificationApiCallerFromEnv } from "@notification-center/interface/http/notification-api-client.ts";
import { createAuditApiClientFromEnv } from "@workflow-coordination/interface/http/audit-api-client.ts";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";

export type Pillar14Domain = "runs" | "notify" | "audit" | "webhooks" | "connectors" | "flags";

export interface Pillar14RunOptions {
  caller?: any;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

/** Per-invocation envelope context: full command name + raw argv (drives `--json` envelope). */
interface EnvelopeContext {
  command: string;
  argv: readonly string[];
  /** Stable trace id for the whole invocation — shared by every envelope line. */
  traceId: string;
}

type Io = Required<Pick<Pillar14RunOptions, "print" | "printErr" | "exit">> & {
  ctx: EnvelopeContext;
};

const HELP: Record<Pillar14Domain, string> = {
  runs: `fulcrum runs <list|show|cancel|retry|dispatch|preview|feed|worker-tick|logs|attach> [--json]

Subcommands:
  list [--status <status>]                          List runs
  show <run-id>                                     Show run detail
  cancel <run-id>                                   Cancel a run
  retry <run-id>                                    Retry a failed run
  dispatch --task <id> [--project <id>] [--agent <name>] [--preview]
                                                    Dispatch a dependency-aware run (--preview for dry-run)
  preview --task <id> [--project <id>] [--mode <mode>]
                                                    Preview dependency tree before dispatching
  feed [--project <id>] [--run <id>] [--task <id>] [--watch]
                                                    Live feedback from running dependency executions
  worker-tick --project <id> [--trace <id>] [--worker <id>]
                                                    Claim and execute one queued dependency-run worker job
  logs <run-id> [--follow]                          Show run transcript logs
  attach <run-id>                                   Attach to a running run (follow logs)

Options:
  --json                                            Canonical fulcrum.cli.v1 JSON envelope (streaming verbs emit JSONL + end sentinel)
  --jq <expr>                                       Filter the envelope's .result through jq
  --json-raw                                        Pre-envelope JSON payload (compatibility, removed next release)`,
  notify: "fulcrum notify <list|mark-read|mark-all-read|mute|watch> [--unread] [--json]",
  audit: "fulcrum audit <query|export|retention> [--json]",
  webhooks: "fulcrum webhooks <list|test> [--json]",
  connectors: "fulcrum connectors <enable|sync> <id> [--json]",
  flags: "fulcrum flags <list|set> [--json]",
};

export async function runPillar14Command(
  domain: Pillar14Domain,
  argv: readonly string[],
  opts: Pillar14RunOptions = {},
): Promise<void> {
  const [sub = "help", ...rest] = argv;
  const io: Io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
    ctx: {
      command: `fulcrum ${domain} ${sub}`.trim(),
      argv: rest,
      traceId: newTraceId((opts.env ?? process.env) as NodeJS.ProcessEnv),
    },
  };

  if (sub === "help" || sub === "--help" || sub === "-h") {
    io.print(HELP[domain]);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    switch (domain) {
      case "runs":
        await runRuns(sub, rest, caller, io);
        return;
      case "notify":
        await runNotify(sub, rest, caller, io);
        return;
      case "audit":
        await runAudit(sub, rest, caller, io);
        return;
      case "webhooks":
        await runWebhooks(sub, rest, caller, io);
        return;
      case "connectors":
        await runConnectors(sub, rest, caller, io);
        return;
      case "flags":
        await runFlags(sub, rest, caller, io);
        return;
    }
  } catch (error) {
    emitError(error, hasFlag(argv, "--json"), io);
  }
}

async function runRuns(sub: string, argv: readonly string[], caller: any, io: Io) {
  const runsCaller = caller.agent_runs ?? caller.runs;
  const orchestrationCaller = caller.orchestration;
  const depCaller = caller.dependencyExecution;
  if (sub === "list") {
    const status = optionValue(argv, "--status");
    const projectId = optionValue(argv, "--project");
    const stateFilter = optionValue(argv, "--state") ?? status;
    const result = await runsCaller.list(compact({
      status: stateFilter,
      projectId,
    }));
    emitJson(result, io);
    return;
  }
  if (sub === "show" || sub === "status") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, `runs ${sub}: missing run id`);
    const run = await runsCaller.get({ id });
    if (!run) {
      emitError(new Error(`run '${id}' not found`), hasFlag(argv, "--json"), io);
      return;
    }
    emitJson(run, io);
    return;
  }
  if (sub === "cancel") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs cancel: missing run id");
    emitJson(await runsCaller.cancel({ id }), io);
    return;
  }
  if (sub === "retry") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs retry: missing run id");
    emitJson(await runsCaller.retry({ id }), io);
    return;
  }
  if (sub === "dispatch") {
    const taskId = optionValue(argv, "--task") ?? positional(argv)[0];
    requireValue(taskId, "runs dispatch: missing --task");
    const agentName = optionValue(argv, "--agent");
    const projectId = optionValue(argv, "--project");

    // --preview flag: show dependency tree without dispatching
    if (hasFlag(argv, "--preview")) {
      requireDependencyExecution(depCaller, "runs dispatch --preview");
      emitJson(await depCaller.previewDependencyRun(compact({
        mode: "dependency-tree",
        targetTaskIds: [taskId],
        projectId,
      })), io);
      return;
    }

    // Prefer dependency-aware dispatch when depCaller is available and projectId is given
    if (depCaller && projectId) {
      emitJson(await depCaller.dispatchDependencyRun(compact({
        workspaceId: "", // filled by server from org context
        workspaceSlug: "",
        workspaceName: "",
        projectId,
        projectSlug: "",
        projectName: "",
        mode: "dependency-aware",
        agent: agentName ?? "default",
        targetTaskIds: [taskId],
      })), io);
      return;
    }

    // Fallback to standard dispatch
    const dispatch = orchestrationCaller?.dispatchRun ?? runsCaller?.dispatch;
    if (!dispatch) throw new Error("runs dispatch: orchestration.dispatchRun is unavailable");
    emitJson(await dispatch(compact({ taskId, agentName, projectId })), io);
    return;
  }
  if (sub === "preview") {
    const taskId = optionValue(argv, "--task") ?? positional(argv)[0];
    requireValue(taskId, "runs preview: missing --task <id>");
    const projectId = optionValue(argv, "--project");
    const mode = optionValue(argv, "--mode") ?? "dependency-tree";
    requireDependencyExecution(depCaller, "runs preview");
    emitJson(await depCaller.previewDependencyRun(compact({
      mode,
      targetTaskIds: [taskId],
      projectId,
    })), io);
    return;
  }
  if (sub === "feed") {
    const projectId = optionValue(argv, "--project");
    requireValue(projectId, "runs feed: missing --project <id>");
    requireDependencyExecution(depCaller, "runs feed");
    const runId = optionValue(argv, "--run");
    const taskId = optionValue(argv, "--task");
    const traceId = optionValue(argv, "--trace");
    const watch = hasFlag(argv, "--watch");
    const input = compact({ projectId, runId, taskId, traceId });

    if (watch) {
      // Streaming command: emit one canonical envelope per JSONL line, then a
      // `{schema,result:null,end:true,trace_id}` end sentinel (CLI-TUI-UX §3).
      const POLL_MS = 1000;
      const MAX_WAIT_MS = 300_000;
      const start = Date.now();
      while (Date.now() - start < MAX_WAIT_MS) {
        const feedback = await depCaller.loadDependencyRunLiveFeedback(input);
        emitStreamLine(feedback, io);
        const status = feedback as { executorStatus?: { active?: boolean } };
        if (!status.executorStatus?.active) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      emitStreamSentinel(io);
    } else {
      emitJson(await depCaller.loadDependencyRunLiveFeedback(input), io);
    }
    return;
  }
  if (sub === "worker-tick") {
    const projectId = optionValue(argv, "--project");
    requireValue(projectId, "runs worker-tick: missing --project <id>");
    requireDependencyExecution(depCaller, "runs worker-tick");
    const traceId = optionValue(argv, "--trace");
    const workerId = optionValue(argv, "--worker");
    const runGroupId = optionValue(argv, "--run-group");
    emitJson(await depCaller.runDependencyRunWorkerTick(compact({
      projectId,
      traceId,
      runGroupId,
      workerId,
    })), io);
    return;
  }
  if (sub === "watch") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs watch: missing run id");
    const watchRun = orchestrationCaller?.watchRun ?? runsCaller?.watch;
    if (typeof watchRun === "function") {
      const stream = watchRun({ runId: id, id });
      if (stream && typeof stream[Symbol.asyncIterator] === "function") {
        for await (const event of stream) {
          emitStreamLine(event, io);
        }
        emitStreamSentinel(io);
        return;
      }
    }
    const getRun = orchestrationCaller?.getRun
      ? (input: { runId: string }) => orchestrationCaller.getRun(input)
      : (input: { runId: string }) => runsCaller.get({ id: input.runId });
    const run = await getRun({ runId: id });
    if (!run) {
      emitError(new Error(`run '${id}' not found`), hasFlag(argv, "--json"), io);
      return;
    }
    emitJson(run, io);
    return;
  }
  if (sub === "logs") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs logs: missing run id");
    const follow = hasFlag(argv, "--follow");
    await streamRunLogs(id, follow, caller, io);
    return;
  }
  if (sub === "attach") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs attach: missing run id");
    await streamRunLogs(id, true, caller, io);
    return;
  }
  unknown("runs", sub, io);
}

function requireDependencyExecution(depCaller: any, command: string): asserts depCaller {
  if (!depCaller) {
    throw new Error(
      `${command}: dependency execution API unavailable. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.`,
    );
  }
}

/**
 * Stream JSONL log file for a run. In follow mode, watches for new lines
 * using stat-based polling until the run completes.
 */
async function streamRunLogs(
  runId: string,
  follow: boolean,
  caller: any,
  io: Io,
): Promise<void> {
  const run = await caller.runs.get({ id: runId });
  if (!run) {
    emitError(new Error(`run '${runId}' not found`), false, io);
    return;
  }

  const logPath = resolveLogPath(run);
  if (!logPath) {
    emitError(new Error(`no log file for run '${runId}'`), false, io);
    return;
  }

  // Read existing lines
  let bytesRead = 0;
  try {
    const content = await readFile(logPath, "utf8");
    bytesRead = Buffer.byteLength(content, "utf8");
    for (const line of content.split("\n")) {
      if (line.trim()) io.print(line);
    }
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      if (!follow) {
        emitError(new Error(`log file not found: ${logPath}`), false, io);
        return;
      }
    } else {
      throw err;
    }
  }

  if (!follow) return;

  // Tail: stat-based poll every 500ms
  const POLL_MS = 500;
  const MAX_WAIT_MS = 300_000; // 5 min max follow
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const current = await caller.runs.get({ id: runId });
    const done = !current || ["succeeded", "failed", "cancelled"].includes(current.symphony_state ?? current.status ?? "");

    try {
      const st = await fsStat(logPath);
      if (st.size > bytesRead) {
        const fd = Bun.file(logPath);
        const tail = await fd.slice(bytesRead, st.size).text();
        bytesRead = st.size;
        for (const line of tail.split("\n")) {
          if (line.trim()) io.print(line);
        }
      }
    } catch {
      // File not yet created or disappeared
    }

    if (done) break;
  }
}

function resolveLogPath(run: Record<string, unknown>): string | null {
  const candidates = [
    run["transcript_path"],
    run["log_path"],
    (run["payload"] as Record<string, unknown> | undefined)?.["logPath"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

async function runNotify(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "list") {
    const input = { unread: hasFlag(argv, "--unread") || undefined };
    if (hasFlag(argv, "--watch")) {
      if (typeof caller.notify?.watch !== "function") {
        throw new Error("notify watch operation is not available through the configured public API.");
      }
      for await (const event of caller.notify.watch(input)) {
        emitStreamLine(event, io);
      }
      emitStreamSentinel(io);
      return;
    }
    emitJson(await safeListNotifications(caller, input), io);
    return;
  }

  if (sub === "watch") {
    const input = { unread: hasFlag(argv, "--unread") || undefined };
    if (typeof caller.notify?.watch !== "function") {
      throw new Error("notify watch operation is not available through the configured public API.");
    }
    for await (const event of caller.notify.watch(input)) {
      emitStreamLine(event, io);
    }
    emitStreamSentinel(io);
    return;
  }

  if (sub === "mark-read") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "notify mark-read: missing --id");
    emitJson(await caller.notify.markRead({ id }), io);
    return;
  }

  if (sub === "mark-all-read") {
    emitJson(await caller.notify.markAllRead(), io);
    return;
  }

  if (sub === "mute") {
    const subjectKind = optionValue(argv, "--subject-kind") ?? positional(argv)[0];
    const subjectId = optionValue(argv, "--subject-id") ?? positional(argv)[1];
    requireValue(subjectKind, "notify mute: missing --subject-kind");
    requireValue(subjectId, "notify mute: missing --subject-id");
    const mutedUntilRaw = optionValue(argv, "--muted-until");
    emitJson(await caller.notify.mute({
      subjectKind,
      subjectId,
      mutedUntil: mutedUntilRaw ? new Date(mutedUntilRaw) : undefined,
    }), io);
    return;
  }

  unknown("notify", sub, io);
}

async function safeListNotifications(caller: any, input: Record<string, unknown>): Promise<unknown> {
  try {
    return await caller.notify.list(input);
  } catch (error) {
    if ((error as Error).message?.includes("Metadata for entity Notification not found")) {
      return [];
    }
    throw error;
  }
}

async function runAudit(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "query") {
    const result = await caller.audit.query({
      kind: optionValue(argv, "--kind"),
      subjectKind: optionValue(argv, "--kind"),
      since: dateOption(argv, "--since"),
      dateRange: dateOption(argv, "--since") ? { from: dateOption(argv, "--since") } : undefined,
    });
    emitJson(normalizeAuditResult(result), io);
    return;
  }
  if (sub === "export") {
    const format = optionValue(argv, "--format") ?? "json";
    const output = optionValue(argv, "--output");
    requireValue(output, "audit export: missing --output");
    const result = await caller.audit.export({ format });
    if (format === "csv") {
      const csv = typeof result === "string" ? result : result.csv ?? result.content;
      await writeFile(output, csv.endsWith("\n") ? csv : `${csv}\n`);
      return;
    }
    const rows = normalizeAuditResult(result);
    await writeFile(output, `${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  if (sub === "retention") {
    const [action] = positional(argv);
    if (action !== "set") return unknown("audit", "retention", io);
    const daysRaw = optionValue(argv, "--days");
    requireValue(daysRaw, "audit retention set: missing --days");
    const retainDays = Number.parseInt(daysRaw, 10);
    if (!Number.isFinite(retainDays) || retainDays < 0) throw new Error("audit retention set: --days must be >= 0");
    emitJson(await caller.audit.retentionPolicy.set({ retainDays }), io);
    return;
  }
  unknown("audit", sub, io);
}

async function runWebhooks(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "list") {
    emitJson(await caller.webhooks.list(), io);
    return;
  }
  if (sub === "test") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "webhooks test: missing webhook id");
    emitJson(await caller.webhooks.test({ id }), io);
    return;
  }
  unknown("webhooks", sub, io);
}

async function runConnectors(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "enable") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "connectors enable: missing connector id");
    emitJson(await caller.connectors.enable({ id }), io);
    return;
  }
  if (sub === "sync") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "connectors sync: missing connector id");
    emitJson(await caller.connectors.sync({ id }), io);
    return;
  }
  unknown("connectors", sub, io);
}

async function runFlags(sub: string, argv: readonly string[], caller: any, io: Io) {
  if (sub === "list") {
    emitJson(await caller.flags.list(), io);
    return;
  }
  if (sub === "set") {
    const [flag, value] = positional(argv);
    requireValue(flag, "flags set: missing flag");
    requireValue(value, "flags set: missing on/off value");
    if (value !== "on" && value !== "off") throw new Error("flags set: value must be on or off");
    emitJson(await caller.flags.set({ flag, enabled: value === "on" }), io);
    return;
  }
  unknown("flags", sub, io);
}

/**
 * Emit a single command result. `--json` wraps `value` in the canonical
 * `fulcrum.cli.v1` envelope; plain output renders the same data. `--jq` and
 * `--json-raw` are honoured by the shared helper.
 */
function emitJson(value: unknown, io: Io): void {
  emitResult(
    {
      argv: io.ctx.argv,
      command: io.ctx.command,
      result: value,
      trace: { trace_id: io.ctx.traceId },
      // Generated domain commands have no bespoke human renderer; plain output
      // is the same result payload as compact JSON (one line, pipe-safe).
      renderHuman: (result) => io.print(JSON.stringify(result)),
    },
    io,
  );
}

/**
 * Emit one envelope line of a JSONL stream. Each streamed item is a full
 * canonical envelope sharing the invocation trace id; close the stream with
 * `emitStreamSentinel`.
 */
function emitStreamLine(value: unknown, io: Io): void {
  emitStreamEnvelope(
    {
      argv: io.ctx.argv,
      command: io.ctx.command,
      result: value,
      trace: { trace_id: io.ctx.traceId },
      renderHuman: (result) => io.print(JSON.stringify(result)),
    },
    io,
  );
}

/** Emit the JSONL end-of-stream sentinel for a streaming command. */
function emitStreamSentinel(io: Io): void {
  emitStreamEnd(io.ctx.argv, io.ctx.traceId, io);
}

/**
 * Emit a failed command outcome and exit 1.
 *
 * Under `--json` the failure stays inside the canonical envelope (`result`
 * null, the coded error in the always-array `errors` field). Under the
 * `--json-raw` compatibility flag it keeps the legacy `{error:{code,message}}`
 * shape. Plain mode writes the message to stderr. The `jsonMode` argument is a
 * legacy hint; JSON detection is driven by the invocation argv so `--json-raw`
 * is honoured too.
 */
function emitError(error: unknown, jsonMode: boolean, io: Io): void {
  const code = errorCode(error);
  const message = formatUnknownError(error);
  const hasJsonFlag = io.ctx.argv.includes("--json") || io.ctx.argv.includes("--json-raw");
  const wantsJson = jsonMode || hasJsonFlag;
  emitErrorResult(
    {
      // Force a JSON exit when the caller asked for JSON either via the flag
      // hint or the invocation argv; under `--json-raw` the legacy
      // `{error:{code,message}}` shape is preserved.
      argv: wantsJson && !hasJsonFlag ? [...io.ctx.argv, "--json"] : io.ctx.argv,
      command: io.ctx.command,
      error: { code, message, trace_id: io.ctx.traceId },
      trace: { trace_id: io.ctx.traceId },
      renderHuman: () => io.printErr(message),
    },
    io,
  );
  io.exit(1);
}

function errorCode(error: unknown): string {
  const codeFromApiError = apiErrorCode(error);
  if (codeFromApiError) return codeFromApiError;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "INTERNAL_ERROR";
}

function unknown(domain: Pillar14Domain, sub: string, io: Io): void {
  io.printErr(`fulcrum ${domain}: unknown command '${sub}'`);
  io.exit(2);
}

function requireValue<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined || value === "") throw new Error(message);
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function optionValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function positional(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--json" || arg === "--watch" || arg === "--unread" || arg === "--preview" || arg === "--follow") continue;
    if (arg.startsWith("--")) {
      i += 1;
      continue;
    }
    values.push(arg);
  }
  return values;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function dateOption(argv: readonly string[], flag: string): Date | undefined {
  const value = optionValue(argv, flag);
  return value ? new Date(value) : undefined;
}

function normalizeAuditResult(result: any): unknown {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.rows)) return result.rows;
  if (result?.format === "json" && typeof result.content === "string") {
    try {
      return JSON.parse(result.content);
    } catch {
      return result.content;
    }
  }
  return result;
}

async function resolveCaller(opts: Pillar14RunOptions): Promise<any> {
  const caller = opts.caller ?? {};
  const agentRunApiCaller = createAgentRunApiCallerFromEnv(opts.env, opts.fetch);
  const auditApiClient = createAuditApiClientFromEnv(opts.env, opts.fetch);
  const connectorApiCaller = createConnectorApiCallerFromEnv(opts.env, opts.fetch);
  const notificationApiCaller = createNotificationApiCallerFromEnv(opts.env, opts.fetch);
  const webhookApiCaller = createWebhookApiCallerFromEnv(opts.env, opts.fetch);
  const workflowApiCaller = createWorkflowApiCallerFromEnv(opts.env, opts.fetch);
  const resolved = {
    ...caller,
    ...(agentRunApiCaller ? {
      runs: { ...(caller.runs ?? {}), ...agentRunApiCaller.runs },
      orchestration: { ...(caller.orchestration ?? {}), ...agentRunApiCaller.orchestration },
      ...(caller.agent_runs
        ? { agent_runs: { ...caller.agent_runs, ...agentRunApiCaller.agent_runs } }
        : {}),
    } : {}),
    ...(auditApiClient ? { audit: auditApiClient } : {}),
    ...(connectorApiCaller ? { connectors: connectorApiCaller.connectors } : {}),
    ...(notificationApiCaller ? { notify: notificationApiCaller.notify } : {}),
    ...(webhookApiCaller ? { webhooks: webhookApiCaller.webhooks } : {}),
    ...(workflowApiCaller ? { dependencyExecution: workflowApiCaller.tasks } : {}),
  };
  if (!hasConfiguredCaller(resolved)) {
    throw new Error(
      "Public API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL for runs, notifications, audit, webhooks, or connectors commands.",
    );
  }
  return resolved;
}

function hasConfiguredCaller(caller: Record<string, unknown>): boolean {
  return Boolean(
    caller["runs"] ||
      caller["agent_runs"] ||
      caller["orchestration"] ||
      caller["notify"] ||
      caller["audit"] ||
      caller["webhooks"] ||
      caller["connectors"] ||
      caller["flags"] ||
      caller["dependencyExecution"],
  );
}
