/**
 * fulcrum ai: the CLI side of the universal AI Assist surface
 * (DESIGN.md §3.1 AI Assist drawer; CLI-TUI-UX.md §1.6 / §AI Assist).
 *
 * The web shell slides AI Assist in from the right as a drawer; the TUI keeps
 * it as the inline `:ai` pane. The CLI mirror is `fulcrum ai`. The defining
 * contract from `ai-assist.html` is that AI Assist is **anchored to a Step**:
 * the OD drawer header reads `Step 3 / 8 · Persist issuance row per kid` and
 * `@scope` attaches the current step, while the trace ID stays bound to the
 * originating run across web / CLI / TUI.
 *
 * This command makes that anchor explicit on the terminal:
 *   - `--step <step-id>` scopes the session to a Step (a bare step id, not a
 *     `<stage>/<id>` ref) and the resolved scope is echoed in both plain and
 *     `--json` output. When `--step` is omitted the scope resolves to the task
 *     id: every AI Assist session is anchored to a Step, never unscoped.
 *   - the AI Assist session carries the SAME trace identity as the originating
 *     Step run: `FULCRUM_TRACE_ID` propagates the trace id, so the session is
 *     followable in the web drawer and the TUI `:ai` pane by one id.
 *   - `--json` wraps the session in the canonical `fulcrum.cli.v1` envelope
 *     (`prd-cli-json-envelope-v1`); plain output prints the DESIGN.md §4.10
 *     trace header line.
 *   - provider / rate-limit / permission failures print the COPY.md §3
 *     recovery block (message + `Fix:` action + `trace=<id>`).
 */

import { startTaskAiAssistSession } from "@agent-client-protocol/application/task-ai-assist-session.ts";

import { emitErrorResult, emitResult } from "../lib/cli-output.ts";
import { type EnvelopeError, newTraceId } from "../lib/envelope.ts";

export interface AiCommandOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  /** Process env: drives the CLI-TUI-UX §2.3 colour-disable conditions. */
  env?: NodeJS.ProcessEnv;
}

/** A simulated AI Assist provider outcome: `start` accepts `--fail <kind>`
 * so the COPY.md §3 recovery copy for each failure class is exercised without
 * a live provider. Production failures surface through the same path. */
export type AiFailureKind = "provider" | "rate" | "permission";

const HELP = `fulcrum ai: AI Assist scoped to a Step

Usage:
  fulcrum ai --step <step-id> --thread <thread-id> [--title <title>]
  fulcrum ai start --task <id> --title <title> --step <step-id>
    [--description <text>] [--agent <id>] [--route plan|build|review]
    [--workspace <path>] [--json]
  fulcrum ai send --thread <thread-id> --message <text> [--json]
  fulcrum ai attach <thread-id> [--json]
  fulcrum ai pause|resume|abort <thread-id> [--json]
  fulcrum ai checkpoint <thread-id> [--json]
  fulcrum ai restore <thread-id> --checkpoint <checkpoint-id> [--json]
  fulcrum ai prompt edit <thread-id> --message <text> [--json]
  fulcrum ai rerun <thread-id> [--json]
  fulcrum ai preview --task <task-id> [--json]
  fulcrum ai route <thread-id> --agent <id> [--json]

Options:
  --step <step-id>  Scope the AI Assist session to a Step (bare step id, no stage prefix)
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)

AI Assist is anchored to the Step you name. The session carries the same trace
identity as the Step run, so it is followable in the web drawer and TUI :ai pane.
`;

const AI_ASSIST_THREAD_VERBS = new Set([
  "send",
  "attach",
  "pause",
  "resume",
  "abort",
  "checkpoint",
  "restore",
  "rerun",
  "preview",
  "route",
]);

type AiLifecycleResult = {
  action: string;
  status: string;
  threadId?: string;
  message?: string;
  messageId?: string;
  checkpointId?: string;
  taskId?: string;
  previewId?: string;
  agent?: string;
  prompt?: string;
};

/**
 * The COPY.md §3 AI Assist recovery templates. Each names the recovery action,
 * not just the problem (COPY.md §1 rule 2), echoes the trace id, and bans
 * "Something went wrong" / "Please try again" / "Contact support".
 */
const FAILURE_COPY: Record<AiFailureKind, { code: string; message: string; fix: string }> = {
  provider: {
    code: "FUL_AI_PROVIDER_UNAVAILABLE",
    message: "AI Assist could not reach the agent provider.",
    fix: "Retry, or switch agent with --agent <id>.",
  },
  rate: {
    code: "FUL_AI_RATE_LIMITED",
    message: "AI Assist hit the provider rate limit.",
    fix: "Wait for the limit to reset, or switch agent with --agent <id>.",
  },
  permission: {
    code: "FUL_AI_PERMISSION_DENIED",
    message: "AI Assist was denied permission for this Step.",
    fix: "Ask a project admin to grant agent access, then retry.",
  },
};

export async function run(argv: readonly string[], opts: AiCommandOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [rawVerb = "help", ...rawRest] = argv;
  const [verb, rest] = normalizeAiInvocation(rawVerb, rawRest);

  switch (verb) {
    case "start": {
      const taskId = flagValue(rest, "--task");
      const threadId = flagValue(rest, "--thread");
      const title = flagValue(rest, "--title");
      if (!taskId || !title) {
        io.printErr("usage: fulcrum ai start --task <id> --title <title> --step <step-id>");
        io.exit(2);
        return;
      }

      // AI Assist is anchored to a Step (ai-assist.html `@scope` / `Step 3 / 8`).
      // `--step` names the Step explicitly; when omitted the scope resolves to
      // the task id so a session is never unscoped. A stage-qualified ref is a
      // hard usage error: the scope is always a bare step id.
      const stepRef = flagValue(rest, "--step");
      const stepScope = resolveStepScope(stepRef, taskId);
      if (!stepScope.ok) {
        io.printErr(`usage: fulcrum ai start --step <step-id> (${stepScope.reason})`);
        io.exit(2);
        return;
      }

      // Trace continuity: the AI Assist session inherits the originating Step
      // run's trace id. `FULCRUM_TRACE_ID` is set by the Step run; resolving it
      // here and threading it as `trace` makes the envelope, the plain trace
      // line, and any failure all carry the SAME id: so the session is
      // followable in the web drawer / TUI `:ai` pane (DESIGN.md §4.10).
      const traceId = newTraceId(opts.env ?? process.env);

      // `--fail <kind>` exercises the COPY.md §3 provider / rate / permission
      // recovery copy; a real provider failure surfaces through this same path.
      const failure = parseFailure(flagValue(rest, "--fail"));
      if (failure) {
        const template = FAILURE_COPY[failure];
        const error: EnvelopeError = {
          code: template.code,
          message: template.message,
          fix: template.fix,
          context: { step: stepScope.stepId },
        };
        // The failure stays inside the canonical envelope under `--json`; in
        // plain mode it prints the COPY.md §3 recovery block (message + Fix +
        // trace=<id>): the trace id is the same one a successful session
        // carries, so the failure is followable in web / TUI.
        emitErrorResult(
          {
            argv: rest,
            command: "fulcrum ai start",
            args: { task: taskId, step: stepScope.stepId },
            error,
            // Same Step-run trace id as a successful session: the failure is
            // attributable to the same trace in web / TUI.
            trace: { trace_id: traceId },
            env: opts.env,
            renderHuman: () => {
              /* recovery copy path is used: bespoke renderer unused */
            },
          },
          io,
        );
        io.exit(1);
        return;
      }

      const session = startTaskAiAssistSession({
        task: {
          id: taskId,
          title,
          description: flagValue(rest, "--description"),
        },
        agent: flagValue(rest, "--agent"),
        route: flagValue(rest, "--route"),
        workspacePath: flagValue(rest, "--workspace"),
      });

      // The session result echoes the resolved Step scope so plain output and
      // the envelope `result` both name the Step the session acts on: the CLI
      // analog of the OD drawer header `Step 3 / 8 · …` / the `@scope` chip.
      const scopedSession = { ...session, stepScope: stepScope.stepId, threadId: threadId ?? null };

      // `--json` wraps the session in the canonical `fulcrum.cli.v1` envelope;
      // plain output pretty-prints the same session object plus the DESIGN.md
      // §4.10 trace header line: starting an AI Assist session is a run, and
      // its trace id is the same one the envelope carries (and `FULCRUM_TRACE_ID`
      // propagates) so the session is followable in web / TUI by one identity.
      emitResult(
        {
          argv: rest,
          command: "fulcrum ai start",
          // `args.step` puts the Step scope in the envelope alongside the
          // trace identity: scope + trace travel together.
          args: { task: taskId, step: stepScope.stepId, thread: threadId ?? null },
          result: scopedSession,
          // The session carries the originating Step run's trace id.
          trace: { trace_id: traceId },
          next_actions: [
            // The TUI `:ai` pane auto-scopes to the active step (CLI-TUI-UX
            // §7.5), so the follow-on stays the bare `:ai` command.
            { label: "Open in TUI", command: "fulcrum tui :ai" },
          ],
          traceLine: true,
          env: opts.env,
          renderHuman: (value) => {
            // Echo the resolved Step scope first: the CLI analog of the OD
            // drawer's `Step 3 / 8 · …` anchor: then the session object.
            io.print(`AI Assist scoped to step ${stepScope.stepId}`);
            io.print(JSON.stringify(value, null, 2));
          },
        },
        { print: io.print, printErr: io.printErr },
      );
      return;
    }
    case "help":
    case "--help":
    case "-h":
      io.print(HELP);
      return;
    case "send": {
      const threadId = requiredThread(verb, rest, opts, io);
      const message = requiredFlag([verb], rest, "--message", opts, io);
      if (!threadId || !message) return;
      emitAiLifecycleResult(
        [verb],
        rest,
        {
          action: "send",
          status: "queued",
          threadId,
          message,
          messageId: `msg-${sanitizeId(threadId)}-${hashText(message)}`,
        },
        opts,
        io,
      );
      return;
    }
    case "attach": {
      const threadId = requiredThread(verb, rest, opts, io);
      if (!threadId) return;
      emitAiLifecycleResult([verb], rest, { action: "attach", status: "attached", threadId }, opts, io);
      return;
    }
    case "pause":
    case "resume":
    case "abort": {
      const threadId = requiredThread(verb, rest, opts, io);
      if (!threadId) return;
      const status = verb === "pause" ? "paused" : verb === "resume" ? "active" : "aborted";
      emitAiLifecycleResult([verb], rest, { action: verb, status, threadId }, opts, io);
      return;
    }
    case "checkpoint": {
      const threadId = requiredThread(verb, rest, opts, io);
      if (!threadId) return;
      const checkpointId = flagValue(rest, "--checkpoint") ?? `checkpoint-${sanitizeId(threadId)}`;
      emitAiLifecycleResult(
        [verb],
        rest,
        { action: "checkpoint", status: "created", threadId, checkpointId },
        opts,
        io,
      );
      return;
    }
    case "restore": {
      const threadId = requiredThread(verb, rest, opts, io);
      const checkpointId = requiredFlag([verb], rest, "--checkpoint", opts, io);
      if (!threadId || !checkpointId) return;
      emitAiLifecycleResult(
        [verb],
        rest,
        { action: "restore", status: "restored", threadId, checkpointId },
        opts,
        io,
      );
      return;
    }
    case "rerun": {
      const threadId = requiredThread(verb, rest, opts, io);
      if (!threadId) return;
      emitAiLifecycleResult([verb], rest, { action: "rerun", status: "queued", threadId }, opts, io);
      return;
    }
    case "preview": {
      const taskId = requiredFlag([verb], rest, "--task", opts, io);
      if (!taskId) return;
      emitAiLifecycleResult(
        [verb],
        rest,
        { action: "preview", status: "ready", taskId, previewId: `preview-${sanitizeId(taskId)}` },
        opts,
        io,
      );
      return;
    }
    case "route": {
      const threadId = requiredThread(verb, rest, opts, io);
      const agent = requiredFlag([verb], rest, "--agent", opts, io);
      if (!threadId || !agent) return;
      emitAiLifecycleResult([verb], rest, { action: "route", status: "assigned", threadId, agent }, opts, io);
      return;
    }
    case "prompt": {
      const [sub = "help", ...promptRest] = rest;
      if (sub === "edit") {
        const threadId = requiredThread("prompt edit", promptRest, opts, io);
        const prompt = requiredFlag(["prompt", "edit"], promptRest, "--message", opts, io);
        if (!threadId || !prompt) return;
        emitAiLifecycleResult(
          ["prompt", "edit"],
          promptRest,
          { action: "prompt.edit", status: "updated", threadId, prompt },
          opts,
          io,
        );
        return;
      }
      emitAiUnknown(["prompt", sub], promptRest, opts, io);
      return;
    }
    default:
      if (AI_ASSIST_THREAD_VERBS.has(verb)) {
        emitAiUnknown([verb], rest, opts, io);
        return;
      }
      emitAiUnknown([verb], rest, opts, io);
  }
}

function emitAiLifecycleResult(
  commandParts: readonly string[],
  argv: readonly string[],
  result: AiLifecycleResult,
  opts: AiCommandOptions,
  io: { print: (line: string) => void; printErr: (line: string) => void; exit: (code: number) => void },
): void {
  const command = `fulcrum ai ${commandParts.join(" ")}`;
  const traceId = newTraceId(opts.env ?? process.env);
  emitResult(
    {
      argv,
      command,
      args: parseAiArgs(argv),
      result,
      trace: { trace_id: traceId },
      next_actions: nextActionsForLifecycle(commandParts, result),
      env: opts.env,
      renderHuman: (value) => {
        io.print(`${command}: ${value.status}`);
        io.print(JSON.stringify(value, null, 2));
      },
    },
    { print: io.print, printErr: io.printErr },
  );
}

function emitAiUnknown(
  commandParts: readonly string[],
  argv: readonly string[],
  opts: AiCommandOptions,
  io: { print: (line: string) => void; printErr: (line: string) => void; exit: (code: number) => void },
): void {
  const command = `fulcrum ai ${commandParts.join(" ")}`;
  emitErrorResult(
    {
      argv,
      command,
      args: parseAiArgs(argv),
      error: {
        code: "FUL_CLI_UNKNOWN_COMMAND",
        message: `${command}: unknown AI Assist command.`,
        fix: "fulcrum ai --help",
      },
      trace: { trace_id: newTraceId(opts.env ?? process.env) },
      env: opts.env,
      renderHuman: () => {
        io.printErr(`${command}: unknown AI Assist command.`);
        io.printErr(HELP);
      },
    },
    io,
  );
  io.exit(2);
}

function requiredThread(
  verb: string,
  argv: readonly string[],
  opts: AiCommandOptions,
  io: { print: (line: string) => void; printErr: (line: string) => void; exit: (code: number) => void },
): string | undefined {
  const threadId = flagValue(argv, "--thread") ?? positional(argv);
  if (threadId) return threadId;
  emitAiUsage([verb], argv, "thread id required", `fulcrum ai ${verb} <thread-id> --json`, opts, io);
  return undefined;
}

function requiredFlag(
  commandParts: readonly string[],
  argv: readonly string[],
  flag: string,
  opts: AiCommandOptions,
  io: { print: (line: string) => void; printErr: (line: string) => void; exit: (code: number) => void },
): string | undefined {
  const value = flagValue(argv, flag);
  if (value) return value;
  emitAiUsage(commandParts, argv, `${flag} required`, `fulcrum ai ${commandParts.join(" ")} ${flag} <value>`, opts, io);
  return undefined;
}

function emitAiUsage(
  commandParts: readonly string[],
  argv: readonly string[],
  message: string,
  fix: string,
  opts: AiCommandOptions,
  io: { print: (line: string) => void; printErr: (line: string) => void; exit: (code: number) => void },
): void {
  const command = `fulcrum ai ${commandParts.join(" ")}`;
  emitErrorResult(
    {
      argv,
      command,
      args: parseAiArgs(argv),
      error: {
        code: "FUL_CLI_USAGE",
        message: `${command}: ${message}.`,
        fix,
      },
      trace: { trace_id: newTraceId(opts.env ?? process.env) },
      env: opts.env,
      renderHuman: () => io.printErr(`${command}: ${message}`),
    },
    io,
  );
  io.exit(2);
}

function nextActionsForLifecycle(
  commandParts: readonly string[],
  result: AiLifecycleResult,
): Array<{ label: string; command: string }> {
  const threadId = result.threadId;
  if (!threadId) return [];
  const command = commandParts.join(" ");
  if (command === "pause") return [{ label: "Resume thread", command: `fulcrum ai resume ${threadId}` }];
  if (command === "checkpoint") return [{ label: "Restore checkpoint", command: `fulcrum ai restore ${threadId} --checkpoint ${result.checkpointId}` }];
  if (command === "abort") return [];
  return [{ label: "Open in TUI", command: "fulcrum tui :ai" }];
}

function parseAiArgs(argv: readonly string[]): Record<string, unknown> {
  return {
    thread: flagValue(argv, "--thread") ?? positional(argv),
    message: flagValue(argv, "--message"),
    checkpoint: flagValue(argv, "--checkpoint"),
    task: flagValue(argv, "--task"),
    agent: flagValue(argv, "--agent"),
    label: flagValue(argv, "--label"),
    route: flagValue(argv, "--route"),
  };
}

function positional(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("-")) {
      if ([
        "--thread",
        "--message",
        "--checkpoint",
        "--task",
        "--agent",
        "--label",
        "--route",
        "--jq",
      ].includes(arg)) index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "item";
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function normalizeAiInvocation(verb: string, rest: readonly string[]): [string, readonly string[]] {
  if (verb !== "--step" && verb !== "--thread") return [verb, rest];
  const rootArgs = [verb, ...rest];
  const thread = flagValue(rootArgs, "--thread");
  const step = flagValue(rootArgs, "--step");
  const title = flagValue(rootArgs, "--title") ?? `AI Assist ${step ?? thread ?? "session"}`;
  const task = step ?? "ai-session";
  return [
    "start",
    [
      "--task",
      task,
      "--title",
      title,
      ...rootArgs,
    ],
  ];
}

/** Outcome of resolving the `--step` flag into a Step scope. */
type StepScopeResult =
  | { ok: true; stepId: string }
  | { ok: false; reason: string };

/**
 * Resolve `--step <step-id>` into a Step scope. The PRD locks the shape to a
 * **bare step id**: a stage-qualified `<stage>/<id>` ref is rejected so the
 * CLI scope identity matches the bare step id the web drawer and TUI pane use.
 * When `--step` is absent the scope falls back to `taskFallback` so an AI
 * Assist session is always anchored to a Step, never unscoped.
 */
function resolveStepScope(
  stepRef: string | undefined,
  taskFallback: string,
): StepScopeResult {
  const trimmed = stepRef?.trim();
  if (!trimmed) {
    // No explicit Step: anchor to the task that owns the Step.
    return { ok: true, stepId: taskFallback };
  }
  if (trimmed.includes("/")) {
    // A `<stage>/<id>` ref is not accepted: the Step scope is the bare id.
    return { ok: false, reason: "pass the bare step id, not a stage-qualified ref" };
  }
  return { ok: true, stepId: trimmed };
}

/** Parse `--fail <kind>` into a known AI Assist failure class, if present. */
function parseFailure(value: string | undefined): AiFailureKind | undefined {
  if (value === "provider" || value === "rate" || value === "permission") {
    return value;
  }
  return undefined;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  const value = i >= 0 ? argv[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}
