import { writeFile, readFile, stat as fsStat } from "node:fs/promises";

import { apiErrorCode, formatUnknownError } from "../api-errors.ts";
import {
  emitErrorResult,
  emitResult,
  emitStreamEnd,
  emitStreamEnvelope,
  emitStreamTraceLine,
} from "../lib/cli-output.ts";
import { newTraceId } from "../lib/envelope.ts";
import { createAgentRunApiCallerFromEnv } from "@execution-orchestration/interface/http/agent-run-api-client.ts";
import { createConnectorApiCallerFromEnv } from "@integration-hub/interface/http/connector-api-client.ts";
import { createWebhookApiCallerFromEnv } from "@integration-hub/interface/http/webhook-api-client.ts";
import { createNotificationApiCallerFromEnv } from "@notification-center/interface/http/notification-api-client.ts";
import { createTaskApiCallerFromEnv } from "@work-management/interface/http/task-api-client.ts";
import { createAuditApiClientFromEnv } from "@workflow-coordination/interface/http/audit-api-client.ts";
import { createWorkflowApiCallerFromEnv } from "@workflow-coordination/interface/http/workflow-api-client.ts";

/**
 * Generated public-API command domains.
 *
 * The Build-stage grammar (`CLI-TUI-UX.md` §1.3) is split across:
 *  - `runs`   : the runs feed: `list`/`feed`/`tail`/`show`/`logs`/`attach` plus dispatch/preview.
 *  - `run`    : a single agent run: `new`/`view`/`cancel`/`retry --from-step`/`attach`.
 *  - `cycle`  : Build cycles: `list`/`activate`/`complete` (Plane cycles, `IA-MAP.md` §2.3).
 *  - `module` : Build modules: `list`/`new`/`view` (Plane modules, `IA-MAP.md` §2.3).
 *  - `context`: per-task run context: `pack`/`inspect`/`diff` (`CLI-TUI-UX.md` §1.3).
 */
export type Pillar14Domain =
  | "runs"
  | "run"
  | "cycle"
  | "module"
  | "context"
  | "notify"
  | "audit"
  | "webhooks"
  | "connectors"
  | "flags";

/** The Build-stage command domains owned by this module (`CLI-TUI-UX.md` §1.3). */
export const BUILD_STAGE_DOMAINS: readonly Pillar14Domain[] = ["runs", "run", "cycle", "module", "context"];

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
  /** Stable trace id for the whole invocation: shared by every envelope line. */
  traceId: string;
  /** Process env: drives the CLI-TUI-UX §2.3 colour-disable conditions. */
  env: NodeJS.ProcessEnv;
}

type Io = Required<Pick<Pillar14RunOptions, "print" | "printErr" | "exit">> & {
  ctx: EnvelopeContext;
};

const HELP: Record<Pillar14Domain, string> = {
  runs: `fulcrum runs <list|show|cancel|retry|dispatch|preview|feed|tail|worker-tick|logs|attach> [--json]

Subcommands (Build-stage runs feed: CLI-TUI-UX §1.3, IA-MAP §2.3):
  list [--status <status>] [--cycle <id>]           List runs
  feed [--project <id>] [--run <id>] [--task <id>] [--watch]
                                                    Live feedback from running dependency executions
  tail <run-id> [--lines <n>]                       Show the last <n> transcript lines of a run
  show <run-id>                                     Show run detail
  cancel <run-id>                                   Cancel a run
  retry <run-id>                                    Retry a failed run
  dispatch --task <id> [--project <id>] [--agent <name>] [--preview]
                                                    Dispatch a dependency-aware run (--preview for dry-run)
  preview --task <id> [--project <id>] [--mode <mode>]
                                                    Preview dependency tree before dispatching
  worker-tick --project <id> [--trace <id>] [--worker <id>]
                                                    Claim and execute one queued dependency-run worker job
  logs <run-id> [--follow]                          Show run transcript logs
  attach <run-id>                                   Attach to a running run (follow logs)

Options:
  --json                                            Canonical fulcrum.cli.v1 JSON envelope (streaming verbs emit JSONL + end sentinel)
  --jq <expr>                                       Filter the envelope's .result through jq
  --json-raw                                        Pre-envelope JSON payload (compatibility, removed next release)`,
  run: `fulcrum run <new|view|cancel|retry|attach> [--json]

Subcommands (a single agent run: CLI-TUI-UX §1.3):
  new --task <id> [--agent <a>] [--model <m>] [--policy review_each_tool|auto_approve_safe|danger_zone]
                                                    Dispatch a new run for a task
  view <run-id>                                     Show run detail
  cancel <run-id>                                   Cancel a run
  retry <run-id> [--from-step <n>]                  Retry a run, optionally from a step
  attach <run-id>                                   Attach to a running run (follow logs)

Options:
  --json                                            Canonical fulcrum.cli.v1 JSON envelope`,
  cycle: `fulcrum cycle <list|activate|complete> [--json]

Subcommands (Build cycles: CLI-TUI-UX §1.3, IA-MAP §2.3 Plane cycles):
  list [--project <id>]                             List cycles (tasks grouped by cycle)
  activate <cycle-id>                               Activate a cycle
  complete <cycle-id>                               Complete a cycle

Options:
  --json                                            Canonical fulcrum.cli.v1 JSON envelope`,
  module: `fulcrum module <list|new|view> [--json]

Subcommands (Build modules: CLI-TUI-UX §1.3, IA-MAP §2.3 Plane modules):
  list [--project <id>]                             List modules (tasks grouped by module)
  new --name <n> [--project <id>]                   Create a module
  view <module-id>                                  Show a module's tasks

Options:
  --json                                            Canonical fulcrum.cli.v1 JSON envelope`,
  context: `fulcrum context <pack|inspect|diff> [--json]

Subcommands (per-task run context: CLI-TUI-UX §1.3):
  pack --task <id> [--include-docs] [--include-runs] [--budget <tokens>]
                                                    Pack the run context for a task
  inspect --task <id>                               Inspect the assembled context for a task
  diff --task <id> --against <run-id>               Diff a task's context against a prior run

Options:
  --json                                            Canonical fulcrum.cli.v1 JSON envelope`,
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
      env: (opts.env ?? process.env) as NodeJS.ProcessEnv,
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
      case "run":
        await runRun(sub, rest, caller, io);
        return;
      case "cycle":
        await runCycle(sub, rest, caller, io);
        return;
      case "module":
        await runModule(sub, rest, caller, io);
        return;
      case "context":
        await runContext(sub, rest, caller, io);
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
      // Plain mode prints the DESIGN.md §4.10 trace line once before streaming.
      emitStreamLineHeader(io);
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
        // Plain mode prints the §4.10 trace line once before streaming events.
        emitStreamLineHeader(io);
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
  if (sub === "tail") {
    // `fulcrum runs tail <id> [--lines <n>]`: the last <n> transcript lines of a
    // run, emitted in the canonical envelope (CLI-TUI-UX §1.3 `runs tail`).
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "runs tail: missing run id");
    const linesRaw = optionValue(argv, "--lines");
    const lines = linesRaw ? Math.max(1, Number.parseInt(linesRaw, 10) || 20) : 20;
    emitJson(await tailRunLogs(id, lines, caller, io), io);
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

/**
 * `fulcrum run <verb>`: single-agent-run grammar (`CLI-TUI-UX.md` §1.3).
 * Routes through the same agent-run caller as `fulcrum runs`; `retry` honours
 * `--from-step <n>` so a run can resume from a checkpoint.
 */
async function runRun(sub: string, argv: readonly string[], caller: any, io: Io) {
  const runsCaller = caller.agent_runs ?? caller.runs;
  const orchestrationCaller = caller.orchestration;
  if (sub === "new") {
    const taskId = optionValue(argv, "--task") ?? positional(argv)[0];
    requireValue(taskId, "run new: missing --task <id>");
    const dispatch = orchestrationCaller?.dispatchRun ?? runsCaller?.dispatch ?? runsCaller?.create;
    if (!dispatch) throw new Error("run new: run dispatch API is unavailable");
    emitJson(await dispatch(compact({
      taskId,
      agentName: optionValue(argv, "--agent"),
      agent: optionValue(argv, "--agent"),
      model: optionValue(argv, "--model"),
      policy: optionValue(argv, "--policy"),
      projectId: optionValue(argv, "--project"),
    })), io);
    return;
  }
  if (sub === "view" || sub === "show" || sub === "status") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, `run ${sub}: missing run id`);
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
    requireValue(id, "run cancel: missing run id");
    emitJson(await runsCaller.cancel({ id }), io);
    return;
  }
  if (sub === "retry") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "run retry: missing run id");
    const fromStepRaw = optionValue(argv, "--from-step");
    const fromStep = fromStepRaw === undefined ? undefined : Number.parseInt(fromStepRaw, 10);
    if (fromStep !== undefined && (!Number.isInteger(fromStep) || fromStep < 0)) {
      throw new Error("run retry: --from-step must be a non-negative integer");
    }
    emitJson(await runsCaller.retry(compact({ id, fromStep })), io);
    return;
  }
  if (sub === "attach") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "run attach: missing run id");
    await streamRunLogs(id, true, caller, io);
    return;
  }
  unknown("run", sub, io);
}

/**
 * `fulcrum cycle <verb>`: Build cycles (`CLI-TUI-UX.md` §1.3, `IA-MAP.md` §2.3
 * Plane cycles). `list` groups the project's tasks by their `cycleId`;
 * `activate`/`complete` record the cycle lifecycle transition.
 */
async function runCycle(sub: string, argv: readonly string[], caller: any, io: Io) {
  const taskCaller = caller.tasks;
  requireTaskCaller(taskCaller, "cycle");
  if (sub === "list") {
    const projectId = optionValue(argv, "--project");
    const tasks = await taskCaller.list(compact({ projectId }));
    emitJson(groupTasksBy(tasks, ["cycleId", "cycle_id"], "cycle"), io);
    return;
  }
  if (sub === "activate" || sub === "complete") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, `cycle ${sub}: missing cycle id`);
    emitJson({
      kind: "cycle-transition",
      cycleId: id,
      state: sub === "activate" ? "active" : "completed",
      at: new Date().toISOString(),
    }, io);
    return;
  }
  unknown("cycle", sub, io);
}

/**
 * `fulcrum module <verb>`: Build modules (`CLI-TUI-UX.md` §1.3, `IA-MAP.md`
 * §2.3 Plane modules). `list`/`view` group the project's tasks by `moduleId`;
 * `new` records a module definition.
 */
async function runModule(sub: string, argv: readonly string[], caller: any, io: Io) {
  const taskCaller = caller.tasks;
  requireTaskCaller(taskCaller, "module");
  if (sub === "list") {
    const projectId = optionValue(argv, "--project");
    const tasks = await taskCaller.list(compact({ projectId }));
    emitJson(groupTasksBy(tasks, ["moduleId", "module_id"], "module"), io);
    return;
  }
  if (sub === "new") {
    const name = optionValue(argv, "--name");
    requireValue(name, "module new: missing --name");
    emitJson({
      kind: "module",
      name,
      projectId: optionValue(argv, "--project") ?? null,
      createdAt: new Date().toISOString(),
    }, io);
    return;
  }
  if (sub === "view") {
    const id = positional(argv)[0] ?? optionValue(argv, "--id");
    requireValue(id, "module view: missing module id");
    const tasks = await taskCaller.list(compact({ projectId: optionValue(argv, "--project"), moduleId: id }));
    emitJson({ kind: "module", moduleId: id, tasks }, io);
    return;
  }
  unknown("module", sub, io);
}

/**
 * `fulcrum context <verb>`: per-task run context (`CLI-TUI-UX.md` §1.3).
 * `pack`/`inspect` resolve the dependency tree the run would see;
 * `diff` compares it against a prior run via the dependency-execution caller.
 */
async function runContext(sub: string, argv: readonly string[], caller: any, io: Io) {
  const depCaller = caller.dependencyExecution;
  if (sub === "pack" || sub === "inspect") {
    const taskId = optionValue(argv, "--task") ?? positional(argv)[0];
    requireValue(taskId, `context ${sub}: missing --task <id>`);
    requireDependencyExecution(depCaller, `context ${sub}`);
    const projectId = optionValue(argv, "--project");
    const tree = await depCaller.previewDependencyRun(compact({
      mode: "dependency-tree",
      targetTaskIds: [taskId],
      projectId,
    }));
    emitJson({
      kind: sub === "pack" ? "context-pack" : "context-inspect",
      taskId,
      includeDocs: hasFlag(argv, "--include-docs"),
      includeRuns: hasFlag(argv, "--include-runs"),
      budget: optionValue(argv, "--budget") ? Number.parseInt(optionValue(argv, "--budget")!, 10) : null,
      dependencyTree: tree,
    }, io);
    return;
  }
  if (sub === "diff") {
    const taskId = optionValue(argv, "--task") ?? positional(argv)[0];
    requireValue(taskId, "context diff: missing --task <id>");
    const against = optionValue(argv, "--against");
    requireValue(against, "context diff: missing --against <run-id>");
    requireDependencyExecution(depCaller, "context diff");
    const tree = await depCaller.previewDependencyRun(compact({
      mode: "dependency-tree",
      targetTaskIds: [taskId],
      projectId: optionValue(argv, "--project"),
    }));
    emitJson({ kind: "context-diff", taskId, against, dependencyTree: tree }, io);
    return;
  }
  unknown("context", sub, io);
}

function requireTaskCaller(taskCaller: any, command: string): asserts taskCaller {
  if (!taskCaller) {
    throw new Error(
      `${command}: task API unavailable. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.`,
    );
  }
}

/** Group a task list by the first present scope key, returning per-bucket task counts. */
function groupTasksBy(tasks: unknown, keys: string[], label: string): Record<string, unknown> {
  const rows = Array.isArray(tasks) ? tasks : [];
  const buckets = new Map<string, unknown[]>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const bucketKey = keys.map((k) => record[k]).find((v) => v != null);
    const id = bucketKey == null ? "(unassigned)" : String(bucketKey);
    const existing = buckets.get(id) ?? [];
    existing.push(row);
    buckets.set(id, existing);
  }
  return {
    kind: `${label}-list`,
    [`${label}s`]: [...buckets.entries()].map(([id, items]) => ({ id, taskCount: items.length, tasks: items })),
  };
}

/**
 * Read the last `lines` transcript lines of a run for `fulcrum runs tail`.
 * Returns the run identity plus the tail slice: no streaming, one envelope.
 */
async function tailRunLogs(
  runId: string,
  lines: number,
  caller: any,
  _io: Io,
): Promise<Record<string, unknown>> {
  const run = await caller.runs.get({ id: runId });
  if (!run) throw new Error(`run '${runId}' not found`);
  const logPath = resolveLogPath(run);
  let tail: string[] = [];
  if (logPath) {
    try {
      const content = await readFile(logPath, "utf8");
      tail = content.split("\n").filter((line) => line.trim()).slice(-lines);
    } catch {
      tail = [];
    }
  }
  return { kind: "runs-tail", runId, lines, tail };
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
 * `fulcrum.cli.v1` envelope; plain output renders the same data plus the
 * DESIGN.md §4.10 trace header line so the run is followable across surfaces.
 * `--jq` and `--json-raw` are honoured by the shared helper.
 */
function emitJson(value: unknown, io: Io): void {
  emitResult(
    {
      argv: io.ctx.argv,
      command: io.ctx.command,
      result: value,
      trace: { trace_id: io.ctx.traceId },
      // Plain output prints the same `trace_id` the `--json` envelope carries.
      traceLine: true,
      env: io.ctx.env,
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
 * Print the DESIGN.md §4.10 plain-text trace header line once, before a
 * streaming command starts emitting events. No-op under `--json` (the JSONL
 * stream must not be interleaved with a non-JSON line).
 */
function emitStreamLineHeader(io: Io): void {
  emitStreamTraceLine(
    { argv: io.ctx.argv, trace: { trace_id: io.ctx.traceId }, env: io.ctx.env },
    io,
  );
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
      // The error carries the invocation trace id; plain mode prints the
      // COPY.md §3 recovery block (message + Fix + trace=<id>) to stderr.
      error: { code, message, trace_id: io.ctx.traceId, fix: recoveryFix(io.ctx.command) },
      trace: { trace_id: io.ctx.traceId },
      env: io.ctx.env,
      renderHuman: () => io.printErr(message),
    },
    io,
  );
  io.exit(1);
}

/** The `Fix:` action surfaced in a plain-mode error: the command's own help. */
function recoveryFix(command: string): string {
  const domain = command.split(/\s+/)[1] ?? "runs";
  return `fulcrum ${domain} --help`;
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

/** Boolean flags that take no value: kept out of the flag+value skip in `positional`. */
const BOOLEAN_FLAGS = new Set([
  "--json",
  "--json-raw",
  "--watch",
  "--unread",
  "--preview",
  "--follow",
  "--include-docs",
  "--include-runs",
]);

function positional(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (BOOLEAN_FLAGS.has(arg)) continue;
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
  const taskApiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
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
    // The `cycle` / `module` Build-stage domains group tasks by cycle/module,
    // so they need the task API caller alongside the agent-run caller.
    ...(taskApiCaller ? { tasks: { ...(caller.tasks ?? {}), ...taskApiCaller.tasks } } : {}),
    ...(webhookApiCaller ? { webhooks: webhookApiCaller.webhooks } : {}),
    ...(workflowApiCaller ? { dependencyExecution: workflowApiCaller.tasks } : {}),
  };
  if (!hasConfiguredCaller(resolved)) {
    throw new Error(
      "Public API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL for runs, run, cycle, module, context, notifications, audit, webhooks, or connectors commands.",
    );
  }
  return resolved;
}

function hasConfiguredCaller(caller: Record<string, unknown>): boolean {
  return Boolean(
    caller["runs"] ||
      caller["agent_runs"] ||
      caller["orchestration"] ||
      caller["tasks"] ||
      caller["notify"] ||
      caller["audit"] ||
      caller["webhooks"] ||
      caller["connectors"] ||
      caller["flags"] ||
      caller["dependencyExecution"],
  );
}
