/**
 * `fulcrum plan|mission|prototype <verb>`: the Plan-stage command tree.
 *
 * `CLI-TUI-UX.md` §1.2 specifies a top-level Plan-stage grammar; until this
 * file the only Plan surface in the CLI was nested under `fulcrum product
 * planning …`. This handler exposes the canonical `fulcrum plan`,
 * `fulcrum mission`, and `fulcrum prototype` verbs. The existing
 * `fulcrum product planning …` commands keep working as documented aliases -
 * `product.ts` is unchanged and re-uses the same planning caller: so no
 * command name is removed (migration-strategy.md CLI path).
 *
 * Every verb routes its result through the shared `fulcrum.cli.v1` envelope
 * helper (`lib/cli-output.ts` → `lib/envelope.ts`), so `--json` output of a
 * Plan verb carries the same twelve-key envelope as every other CLI surface
 * and a planning run started here is followable in web / TUI by its trace id.
 */

import { normalizeTraceId } from "@fulcrum/shared-dto";

import { apiErrorCode, formatApiError } from "../api-errors.ts";
import { emitErrorResult, emitResult } from "../lib/cli-output.ts";

/** A `plan` namespace verb (`CLI-TUI-UX.md` §1.2 lines 49-55). */
export type PlanVerb =
  | "start"
  | "list"
  | "view"
  | "edit"
  | "approve"
  | "reject"
  | "materialize"
  | "preview";

/** A `mission` namespace verb (`CLI-TUI-UX.md` §1.2 lines 57-61). */
export type MissionVerb = "create" | "list" | "show" | "activate" | "delete";

/** A `prototype` namespace verb (`CLI-TUI-UX.md` §1.2 lines 63-65). */
export type PrototypeVerb = "new" | "view" | "attach";

/** The Plan-stage namespace a verb belongs to. */
export type PlanNamespace = "plan" | "mission" | "prototype";

/**
 * Backend seam for every Plan-stage verb. The production resolver wires these
 * to the workflow / planning API; tests inject a fake caller. This is the same
 * "required caller, no inline mock" pattern `product.ts` uses: a verb whose
 * caller is absent throws a configuration error, it is never silently faked.
 */
export interface PlanStageCaller {
  plan: {
    start(input: Record<string, unknown>): Promise<unknown>;
    list(input: Record<string, unknown>): Promise<unknown>;
    view(input: Record<string, unknown>): Promise<unknown>;
    edit(input: Record<string, unknown>): Promise<unknown>;
    approve(input: Record<string, unknown>): Promise<unknown>;
    reject(input: Record<string, unknown>): Promise<unknown>;
    materialize(input: Record<string, unknown>): Promise<unknown>;
    preview(input: Record<string, unknown>): Promise<unknown>;
  };
  mission: {
    create(input: Record<string, unknown>): Promise<unknown>;
    list(input: Record<string, unknown>): Promise<unknown>;
    show(input: Record<string, unknown>): Promise<unknown>;
    activate(input: Record<string, unknown>): Promise<unknown>;
    delete(input: Record<string, unknown>): Promise<unknown>;
  };
  prototype: {
    // `create` backs the `fulcrum prototype new` verb. The method is not named
    // `new` because `new(...)` in an interface is a TS *construct signature*,
    // not a method: the user-facing verb stays `new`.
    create(input: Record<string, unknown>): Promise<unknown>;
    view(input: Record<string, unknown>): Promise<unknown>;
    attach(input: Record<string, unknown>): Promise<unknown>;
  };
}

export interface PlanStageApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
}

export interface PlanStageRunOptions {
  caller?: PlanStageCaller;
  env?: PlanStageApiEnvironment & NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const PLAN_VERBS: ReadonlySet<string> = new Set<PlanVerb>([
  "start",
  "list",
  "view",
  "edit",
  "approve",
  "reject",
  "materialize",
  "preview",
]);
const MISSION_VERBS: ReadonlySet<string> = new Set<MissionVerb>([
  "create",
  "list",
  "show",
  "activate",
  "delete",
]);
const PROTOTYPE_VERBS: ReadonlySet<string> = new Set<PrototypeVerb>(["new", "view", "attach"]);

const PLAN_HELP = `fulcrum plan <start|list|view|edit|approve|reject|materialize|preview>

Usage:
  fulcrum plan start       [--from-doc <id>] [--agent <name>] [--model <m>] [--mode <id>] [--permission <p>] [--cwd <path>] [--prompt <text>] [--project <id>] [--trace <id>] [--json]
  fulcrum plan list        [--project <id>] [--status proposed|approved|materialized] [--json]
  fulcrum plan view        <id> [--include-prototype] [--include-tasks] [--project <id>] [--json]
  fulcrum plan edit        <id> [--title <t>] [--body-file <path>] [--project <id>] [--trace <id>] [--json]
  fulcrum plan approve     <id> [--project <id>] [--trace <id>] [--json]
  fulcrum plan reject      <id> --reason <text> [--project <id>] [--trace <id>] [--json]
  fulcrum plan materialize <id> --file <path> [--project <id>] [--trace <id>] [--json]
  fulcrum plan preview     <id> --file <path> [--project <id>] [--trace <id>] [--json]`;

const MISSION_HELP = `fulcrum mission <create|list|show|activate|delete>

Usage:
  fulcrum mission create   --title <t> [--parent <id>] [--project <id>] [--trace <id>] [--json]
  fulcrum mission list     [--project <id>] [--depth <n>] [--json]
  fulcrum mission show     <id> [--project <id>] [--json]
  fulcrum mission activate --wave <id> [--project <id>] [--trace <id>] [--json]
  fulcrum mission delete   <id> [--project <id>] [--trace <id>] [--json]`;

const PROTOTYPE_HELP = `fulcrum prototype <new|view|attach>

Usage:
  fulcrum prototype new    --plan <id> --target <file-path> [--sketch <path>] [--project <id>] [--trace <id>] [--json]
  fulcrum prototype view   <id> [--project <id>] [--json]
  fulcrum prototype attach <plan-id> <prototype-path> [--project <id>] [--trace <id>] [--json]`;

const HELP = `${PLAN_HELP}

${MISSION_HELP}

${PROTOTYPE_HELP}

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)

The same operations are also reachable as documented aliases under
\`fulcrum product planning …\`; no command name is removed.`;

/** Help text for a single Plan-stage namespace. */
function namespaceHelp(namespace: PlanNamespace): string {
  if (namespace === "plan") return PLAN_HELP;
  if (namespace === "mission") return MISSION_HELP;
  return PROTOTYPE_HELP;
}

/**
 * `fulcrum plan …` entry point: namespace is fixed to `plan`.
 */
export async function run(argv: readonly string[], opts: PlanStageRunOptions = {}): Promise<void> {
  await runNamespace("plan", argv, opts);
}

/**
 * `fulcrum mission …` entry point: namespace is fixed to `mission`.
 */
export async function runMission(argv: readonly string[], opts: PlanStageRunOptions = {}): Promise<void> {
  await runNamespace("mission", argv, opts);
}

/**
 * `fulcrum prototype …` entry point: namespace is fixed to `prototype`.
 */
export async function runPrototype(argv: readonly string[], opts: PlanStageRunOptions = {}): Promise<void> {
  await runNamespace("prototype", argv, opts);
}

/** Dispatch one Plan-stage namespace + verb. */
export async function runNamespace(
  namespace: PlanNamespace,
  argv: readonly string[],
  opts: PlanStageRunOptions = {},
): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(namespace === "plan" && argv.length === 0 ? HELP : namespaceHelp(namespace));
    return;
  }

  const command = `fulcrum ${namespace} ${verb}`;
  try {
    if (!isKnownVerb(namespace, verb)) {
      io.printErr(`fulcrum ${namespace}: unknown command '${verb}'`);
      io.printErr(namespaceHelp(namespace));
      io.exit(2);
      return;
    }
    const caller = await resolveCaller(opts);
    const { result, args, traceId } = await dispatch(namespace, verb, rest, caller);
    // `--json` wraps the same `result` in the canonical `fulcrum.cli.v1`
    // envelope; plain output renders the same data plus the DESIGN.md §4.10
    // trace header line. The trace id is shared across both surfaces so a
    // planning run started here is followable in web / TUI by one id.
    emitResult(
      {
        argv: rest,
        command,
        args,
        result,
        trace: traceId ? { trace_id: traceId } : undefined,
        traceLine: true,
        env: opts.env,
        renderHuman: (value) => io.print(formatHuman(value)),
      },
      { print: io.print, printErr: io.printErr },
    );
  } catch (error) {
    // The failure carries recovery copy + the trace reference (COPY.md §3 /
    // CLI-TUI-UX §5) so a Plan CLI error is followable by the same id.
    emitErrorResult(
      {
        argv: rest,
        command,
        error: {
          code: apiErrorCode(error) ?? `FUL_${namespace.toUpperCase()}_FAILED`,
          message: `${command}: ${formatApiError(error)}`,
          fix: `fulcrum ${namespace} --help`,
        },
        env: opts.env,
        renderHuman: () => io.printErr(`${command}: ${formatApiError(error)}`),
      },
      io,
    );
    io.exit(isUsageError(error) ? 2 : 1);
  }
}

/** True when `verb` is a documented verb of `namespace`. */
function isKnownVerb(namespace: PlanNamespace, verb: string): boolean {
  if (namespace === "plan") return PLAN_VERBS.has(verb);
  if (namespace === "mission") return MISSION_VERBS.has(verb);
  return PROTOTYPE_VERBS.has(verb);
}

interface DispatchOutcome {
  result: unknown;
  args: Record<string, unknown>;
  traceId: string | undefined;
}

/** Build the input for one verb, call its caller method, return the outcome. */
async function dispatch(
  namespace: PlanNamespace,
  verb: string,
  rest: readonly string[],
  caller: PlanStageCaller,
): Promise<DispatchOutcome> {
  const traceId = normalizeTraceId(flagValue(rest, "--trace"));
  if (namespace === "plan") return await dispatchPlan(verb as PlanVerb, rest, caller, traceId);
  if (namespace === "mission") return await dispatchMission(verb as MissionVerb, rest, caller, traceId);
  return await dispatchPrototype(verb as PrototypeVerb, rest, caller, traceId);
}

async function dispatchPlan(
  verb: PlanVerb,
  rest: readonly string[],
  caller: PlanStageCaller,
  traceId: string | undefined,
): Promise<DispatchOutcome> {
  switch (verb) {
    case "start": {
      const args = compact({
        fromDocId: flagValue(rest, "--from-doc"),
        agentName: flagValue(rest, "--agent"),
        modelId: flagValue(rest, "--model"),
        modeId: flagValue(rest, "--mode"),
        permissionMode: flagValue(rest, "--permission"),
        cwd: flagValue(rest, "--cwd"),
        userPrompt: flagValue(rest, "--prompt"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.plan.start(args), args, traceId };
    }
    case "list": {
      const args = compact({
        projectId: flagValue(rest, "--project"),
        status: parsePlanStatus(flagValue(rest, "--status")),
      });
      return { result: await caller.plan.list(args), args, traceId };
    }
    case "view": {
      const planId = requiredArg(rest, "plan view", "<id>");
      const args = compact({
        planId,
        includePrototype: flag(rest, "--include-prototype"),
        includeTasks: flag(rest, "--include-tasks"),
        projectId: flagValue(rest, "--project"),
      });
      return { result: await caller.plan.view(args), args, traceId };
    }
    case "edit": {
      const planId = requiredArg(rest, "plan edit", "<id>");
      const args = compact({
        planId,
        title: flagValue(rest, "--title"),
        bodyFile: flagValue(rest, "--body-file"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.plan.edit(args), args, traceId };
    }
    case "approve": {
      const planId = requiredArg(rest, "plan approve", "<id>");
      const args = compact({ planId, projectId: flagValue(rest, "--project"), traceId });
      return { result: await caller.plan.approve(args), args, traceId };
    }
    case "reject": {
      const planId = requiredArg(rest, "plan reject", "<id>");
      const args = compact({
        planId,
        reason: requiredFlag(rest, "--reason", "plan reject"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.plan.reject(args), args, traceId };
    }
    case "materialize": {
      const planId = requiredArg(rest, "plan materialize", "<id>");
      const args = compact({
        planId,
        file: requiredFlag(rest, "--file", "plan materialize"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.plan.materialize(args), args, traceId };
    }
    case "preview": {
      const planId = requiredArg(rest, "plan preview", "<id>");
      const args = compact({
        planId,
        file: requiredFlag(rest, "--file", "plan preview"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.plan.preview(args), args, traceId };
    }
  }
}

async function dispatchMission(
  verb: MissionVerb,
  rest: readonly string[],
  caller: PlanStageCaller,
  traceId: string | undefined,
): Promise<DispatchOutcome> {
  switch (verb) {
    case "create": {
      const args = compact({
        title: requiredFlag(rest, "--title", "mission create"),
        parentId: flagValue(rest, "--parent"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.mission.create(args), args, traceId };
    }
    case "list": {
      const args = compact({
        projectId: flagValue(rest, "--project"),
        depth: numberFlag(rest, "--depth"),
      });
      return { result: await caller.mission.list(args), args, traceId };
    }
    case "show": {
      const missionId = requiredArg(rest, "mission show", "<id>");
      const args = compact({ missionId, projectId: flagValue(rest, "--project") });
      return { result: await caller.mission.show(args), args, traceId };
    }
    case "activate": {
      const args = compact({
        waveId: requiredFlag(rest, "--wave", "mission activate"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.mission.activate(args), args, traceId };
    }
    case "delete": {
      const missionId = requiredArg(rest, "mission delete", "<id>");
      const args = compact({ missionId, projectId: flagValue(rest, "--project"), traceId });
      return { result: await caller.mission.delete(args), args, traceId };
    }
  }
}

async function dispatchPrototype(
  verb: PrototypeVerb,
  rest: readonly string[],
  caller: PlanStageCaller,
  traceId: string | undefined,
): Promise<DispatchOutcome> {
  switch (verb) {
    case "new": {
      const args = compact({
        planId: requiredFlag(rest, "--plan", "prototype new"),
        targetFilePath: requiredFlag(rest, "--target", "prototype new"),
        sketchPath: flagValue(rest, "--sketch"),
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.prototype.create(args), args, traceId };
    }
    case "view": {
      const prototypeId = requiredArg(rest, "prototype view", "<id>");
      const args = compact({ prototypeId, projectId: flagValue(rest, "--project") });
      return { result: await caller.prototype.view(args), args, traceId };
    }
    case "attach": {
      const positionals = positionalArgs(rest);
      const planId = positionals[0];
      const prototypePath = positionals[1];
      if (!planId || !prototypePath) {
        throw new Error("missing required arguments <plan-id> <prototype-path> for prototype attach");
      }
      const args = compact({
        planId,
        prototypePath,
        projectId: flagValue(rest, "--project"),
        traceId,
      });
      return { result: await caller.prototype.attach(args), args, traceId };
    }
  }
}

/**
 * Resolve the production Plan-stage caller. Every verb maps onto the existing
 * Plan / workflow API surface; the same `/api/v1/plan*` routes back the
 * `fulcrum product planning …` aliases, so the two command grammars stay in
 * sync. No caller method is faked: an unconfigured caller throws.
 */
async function resolveCaller(opts: PlanStageRunOptions): Promise<PlanStageCaller> {
  if (opts.caller) return opts.caller;

  const env = opts.env ?? process.env;
  const baseUrl = env["FULCRUM_PUBLIC_API_URL"] ?? env["FULCRUM_SERVER_URL"];
  if (!baseUrl) {
    throw new Error(
      "Plan-stage API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.",
    );
  }
  const fetchFn = opts.fetch ?? fetch;
  const apiRoot = ensureTrailingSlash(new URL("/api/v1/plan/", ensureTrailingSlash(baseUrl)).toString());
  const post = (path: string, input: Record<string, unknown>) => request(fetchFn, `${apiRoot}${path}`, "POST", input);
  const get = (path: string) => request(fetchFn, `${apiRoot}${path}`, "GET");

  return {
    plan: {
      start: (input) => post("sessions", input),
      list: (input) => get(`sessions${queryString(input)}`),
      view: (input) => get(`${encodeURIComponent(String(input["planId"]))}${queryString(input, ["planId"])}`),
      edit: (input) => post(`${encodeURIComponent(String(input["planId"]))}/edit`, input),
      approve: (input) => post(`${encodeURIComponent(String(input["planId"]))}/approve`, input),
      reject: (input) => post(`${encodeURIComponent(String(input["planId"]))}/reject`, input),
      materialize: (input) => post(`${encodeURIComponent(String(input["planId"]))}/materialize`, input),
      preview: (input) => post(`${encodeURIComponent(String(input["planId"]))}/preview`, input),
    },
    mission: {
      create: (input) => post("missions", input),
      list: (input) => get(`missions${queryString(input)}`),
      show: (input) => get(`missions/${encodeURIComponent(String(input["missionId"]))}`),
      activate: (input) => post(`missions/waves/${encodeURIComponent(String(input["waveId"]))}/activate`, input),
      delete: (input) => request(fetchFn, `${apiRoot}missions/${encodeURIComponent(String(input["missionId"]))}`, "DELETE"),
    },
    prototype: {
      create: (input) => post("prototypes", input),
      view: (input) => get(`prototypes/${encodeURIComponent(String(input["prototypeId"]))}`),
      attach: (input) => post(`${encodeURIComponent(String(input["planId"]))}/prototypes`, input),
    },
  };
}

async function request(
  fetchFn: typeof fetch,
  url: string,
  method: "GET" | "POST" | "DELETE",
  input?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetchFn(url, {
    method,
    headers: input ? { "content-type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
  });
  if (!response.ok) throw new Error(`Plan-stage API request failed with ${response.status}.`);
  return await response.json();
}

/** Render a `?k=v` query string from selected input keys. */
function queryString(input: Record<string, unknown>, exclude: readonly string[] = []): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (exclude.includes(key) || value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatHuman(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function positionalArgs(argv: readonly string[]): string[] {
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token.startsWith("-")) {
      if (!BOOLEAN_FLAGS.has(token) && argv[i + 1] && !argv[i + 1]!.startsWith("-")) i += 1;
      continue;
    }
    positionals.push(token);
  }
  return positionals;
}

const BOOLEAN_FLAGS: ReadonlySet<string> = new Set<string>(["--include-prototype", "--include-tasks"]);

function requiredArg(argv: readonly string[], command: string, label: string): string {
  const value = positionalArgs(argv)[0];
  if (!value) throw new Error(`missing required argument ${label} for ${command}`);
  return value;
}

function flagValue(argv: readonly string[], flagName: string): string | undefined {
  const index = argv.indexOf(flagName);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function flag(argv: readonly string[], flagName: string): true | undefined {
  return argv.includes(flagName) ? true : undefined;
}

function requiredFlag(argv: readonly string[], flagName: string, command: string): string {
  const value = flagValue(argv, flagName);
  if (!value) throw new Error(`missing required flag ${flagName} for ${command}`);
  return value;
}

function numberFlag(argv: readonly string[], flagName: string): number | undefined {
  const value = flagValue(argv, flagName);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flagName} must be an integer`);
  return parsed;
}

function parsePlanStatus(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === "proposed" || value === "approved" || value === "materialized") return value;
  throw new Error(`--status must be proposed, approved, or materialized`);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isUsageError(error: unknown): boolean {
  const message = (error as Error)?.message ?? "";
  return (
    message.startsWith("missing required argument") ||
    message.startsWith("missing required arguments") ||
    message.startsWith("missing required flag") ||
    message.includes(" must be ")
  );
}
