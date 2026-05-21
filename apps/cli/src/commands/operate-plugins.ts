/**
 * `fulcrum operate <verb>` — the Operate workflow-stage command host
 * (CLI-TUI-UX.md §1.6).
 *
 * Operate is stage 6 of 6 (Capture · Plan · Build · Review · Ship · Operate).
 * Before this host the Operate nouns existed but were scattered across the root
 * dispatcher with no Operate-stage `help`, and the plugin surface here was
 * read-only — `list` / `show` only, no per-agent scoping
 * (design-alignment/operate.md §"Route / command / screen disposition":
 * "`operate-plugins.ts` is read-only; extend to full
 * install|enable|disable|update|remove + --agent/--all-agents").
 *
 * This host gives the Operate stage:
 *
 *   operate           — Operate-stage help (the discoverable command group).
 *   plugin / plugins  — agent-plugin verbs: list · show · install · enable ·
 *                       disable · update · remove, each with `--agent` /
 *                       `--all-agents` per-agent scoping (CLI-TUI-UX.md §1.8).
 *   doctor mcp hooks  — the remaining §1.6 Operate noun groups, dispatched
 *   skills audit        through this host so `fulcrum operate <noun>` is a real
 *   trace route         grammar; backed nouns delegate to their command host,
 *   config agent        the rest emit the canonical envelope honestly.
 *
 * Every verb's `--json` output is the canonical `fulcrum.cli.v1` envelope
 * (CLI-TUI-UX.md §3). The plugin mutation verbs (`install` / `update` /
 * `remove`) have no cross-agent plugin server wired through here — they are
 * real dispatchable verbs that emit a canonical *error* envelope rather than
 * fabricate a result (AGENTS.md "no production mocks"); the verb grammar and
 * the `--agent` / `--all-agents` scoping contract are complete and tested.
 *
 * `OperatePluginsOptions`, `ClaudePluginMarker`, and the original `list` /
 * `show` plugin behaviour are preserved verbatim — no command is removed.
 */

import { emitErrorResult, emitResult } from "../lib/cli-output.ts";
import { ALL_AGENT_IDS, type AgentId } from "../mcp-registry.ts";
import { listMarkers } from "../claude-plugin-markers.ts";
import { run as runTrace } from "./trace.ts";

/**
 * How the plugin grammar was reached. `fulcrum operate plugin …` is the
 * canonical Operate-stage spelling; `fulcrum plugin …` is the equally-canonical
 * root alias listed in CLI-TUI-UX.md §1.6. Both reach this host; the value is
 * echoed into the `fulcrum.cli.v1` envelope `command` field so the envelope is
 * honest about which grammar the operator used (closure review: both
 * `operate plugin list` and `plugin list` must be reachable + envelope-safe).
 */
export type PluginInvocationRoot = "operate" | "plugin";

/** Options accepted by the Operate-stage host. */
export interface OperatePluginsOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  /** Injected Claude plugin-marker loader — test seam for `list` / `show`. */
  loadPlugins?: () => Promise<readonly ClaudePluginMarker[]>;
  /** Process env — drives the `fulcrum.cli.v1` envelope colour/trace context. */
  env?: NodeJS.ProcessEnv;
  /**
   * The root the invocation entered through. `"operate"` (default) is the
   * canonical Operate-stage grammar; `"plugin"` is the CLI-TUI-UX.md §1.6 root
   * alias. Drives the `command` prefix in the canonical envelope so a root
   * `fulcrum plugin list` reports `plugin list`, not `operate plugin list`.
   */
  invocationRoot?: PluginInvocationRoot;
}

/** A Claude plugin marker row, as surfaced by `plugin list` / `plugin show`. */
export interface ClaudePluginMarker {
  id: string;
  name: string;
  enabled: boolean;
  source: "claude" | "fulcrum" | "user";
  marker: string;
}

/**
 * The Operate-stage verb groups (CLI-TUI-UX.md §1.6). `operate` is the stage
 * launcher itself; the rest are the §1.6 Operate nouns this host dispatches.
 */
export const OPERATE_VERB_GROUPS = [
  "operate",
  "doctor",
  "mcp",
  "plugin",
  "hooks",
  "skills",
  "audit",
  "trace",
  "route",
  "agent",
  "config",
] as const;

export type OperateVerbGroup = (typeof OPERATE_VERB_GROUPS)[number];

/** The plugin verbs this host owns (CLI-TUI-UX.md §1.6 `fulcrum plugin …`). */
export const PLUGIN_VERBS = [
  "list",
  "show",
  "install",
  "enable",
  "disable",
  "update",
  "remove",
] as const;
export type PluginVerb = (typeof PLUGIN_VERBS)[number];

/** Plugin verbs that mutate per-agent configuration (CLI-TUI-UX.md §1.8). */
const PLUGIN_MUTATION_VERBS: readonly PluginVerb[] = [
  "install",
  "enable",
  "disable",
  "update",
  "remove",
];

/**
 * Operate-stage help — the discoverable command group (CLI-TUI-UX.md §1.6).
 * Lists every Operate noun with examples and mentions the `--json` envelope.
 */
export const OPERATE_HELP = `fulcrum operate — Operate workflow stage (CLI-TUI-UX.md §1.6)

Run the system: health, MCP, plugins, hooks, skills, audit, trace, routing,
agents, and config. Every command's \`--json\` output is the canonical
fulcrum.cli.v1 envelope (CLI-TUI-UX.md §3).

Commands:
  fulcrum operate doctor [--json] [--subsystem <n>] [--checks] [--probe]
                                        Report environment and policy health.
  fulcrum operate mcp <list|register|unregister|enable|disable|test|reload>
                                        Manage the MCP server registry.
  fulcrum operate plugin <list|show|install|enable|disable|update|remove>
                                        Manage agent plugins (per-agent scope).
  fulcrum operate hooks <list|enable|disable|test>
                                        Manage agent hook recipes.
  fulcrum operate skills <sync|install|lint|list|upstream>
                                        Mirror and validate authored skills.
  fulcrum operate audit list [--trace <id>] [--export csv|jsonl]
                                        Query the compliance audit log.
  fulcrum operate trace show <id>       Resolve a trace id to its run/audit links.
  fulcrum operate route <list|show|set|reset>
                                        Inspect default-agent action routing.
  fulcrum operate agent <list|view|add|edit|remove|enable|disable>
                                        Manage the multi-CLI agent registry.
  fulcrum operate config <get|set|edit|path>
                                        Read and write workspace config.

Per-agent scoping (CLI-TUI-UX.md §1.8):
  mcp and plugin commands accept --agent <id> (repeatable) and --all-agents.
  Default scope is the active agent only.

Examples:
  fulcrum operate doctor --json
  fulcrum operate plugins list --json
  fulcrum operate plugin enable caveman --agent claude-code --agent codex
  fulcrum operate plugin enable caveman --all-agents
  fulcrum operate trace show 4f3a1c9e --json
  fulcrum operate audit list --trace 4f3a1c9e --json`;

/** Legacy `fulcrum operate plugins` usage — preserved for compatibility. */
const PLUGIN_HELP = `fulcrum operate plugin — agent plugins (CLI-TUI-UX.md §1.6)

Usage:
  fulcrum operate plugin list [--json] [--agent <id>]
  fulcrum operate plugin show <id> [--json]
  fulcrum operate plugin install <name> [--agent <id> ...] [--all-agents]
  fulcrum operate plugin enable <name> [--agent <id> ...] [--all-agents]
  fulcrum operate plugin disable <name> [--agent <id> ...] [--all-agents]
  fulcrum operate plugin update <name|--all> [--agent <id> ...] [--all-agents]
  fulcrum operate plugin remove <name> [--agent <id> ...] [--all-agents]

\`--json\` emits the canonical fulcrum.cli.v1 envelope (CLI-TUI-UX.md §3).
\`--agent\` / \`--all-agents\` scope a mutation per CLI-TUI-UX.md §1.8.`;

/** Output sink for the envelope helpers. */
interface OperateIo {
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
}

function isHelpVerb(verb: string | undefined): boolean {
  return verb === undefined || verb === "help" || verb === "--help" || verb === "-h";
}

/**
 * The `command` prefix for a plugin verb's `fulcrum.cli.v1` envelope.
 *
 * `fulcrum operate plugin list` reports `operate plugin <verb>`; the
 * CLI-TUI-UX.md §1.6 root alias `fulcrum plugin list` reports `plugin <verb>`.
 * The envelope is therefore honest about which canonical grammar produced it,
 * so a parity test can assert both spellings are envelope-safe.
 */
function pluginCommandPrefix(root: PluginInvocationRoot): string {
  return root === "plugin" ? "plugin" : "operate plugin";
}

/**
 * Pre-envelope raw-array compatibility: a `--json` invocation may opt back into
 * the bare result payload (no `fulcrum.cli.v1` wrapper) with `--json-raw`. This
 * is the documented one-release compatibility flag (apps/cli CONTEXT.md). The
 * default `--json` path always emits the canonical envelope.
 */
function wantsRawJson(args: readonly string[]): boolean {
  return args.includes("--json-raw");
}

/**
 * Resolved per-agent scope for a mutation (CLI-TUI-UX.md §1.8).
 * `"all"` means `--all-agents`; an array means explicit `--agent` ids; an empty
 * array means the default active-agent-only scope.
 */
export type AgentScope = { kind: "all" } | { kind: "agents"; ids: AgentId[] };

/** Result of parsing `--agent` / `--all-agents` flags from an argv slice. */
export interface AgentScopeParse {
  scope: AgentScope;
  /** An unknown agent id, when one was passed — caller turns this into an error. */
  invalidAgent?: string;
}

/**
 * Parse the CLI-TUI-UX.md §1.8 per-agent scoping flags from an argv slice.
 *
 * `--all-agents` wins; otherwise repeatable `--agent <id>` ids accumulate. With
 * neither flag the scope is the default active-agent-only scope (empty ids).
 * An unknown agent id is reported via `invalidAgent` for the caller to surface.
 */
export function parseAgentScope(args: readonly string[]): AgentScopeParse {
  if (args.includes("--all-agents")) {
    return { scope: { kind: "all" } };
  }
  const ids: AgentId[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--agent") continue;
    const candidate = args[i + 1];
    if (!candidate || candidate.startsWith("-")) {
      return { scope: { kind: "agents", ids }, invalidAgent: "" };
    }
    if (!ALL_AGENT_IDS.includes(candidate as AgentId)) {
      return { scope: { kind: "agents", ids }, invalidAgent: candidate };
    }
    ids.push(candidate as AgentId);
  }
  return { scope: { kind: "agents", ids } };
}

/** Human-readable description of a resolved agent scope. */
function describeScope(scope: AgentScope): string {
  if (scope.kind === "all") return "all agents";
  if (scope.ids.length === 0) return "the active agent (default scope)";
  return scope.ids.join(", ");
}

/** Effective agent id list a scope expands to. */
function scopeAgentIds(scope: AgentScope): AgentId[] {
  return scope.kind === "all" ? [...ALL_AGENT_IDS] : [...scope.ids];
}

/**
 * `fulcrum operate plugin list` / `fulcrum plugin list` — the read-only
 * plugin-marker listing. `--agent` is accepted (CLI-TUI-UX.md §1.8) and recorded
 * but the marker source is agent-spanning today.
 *
 * `--json` always emits the canonical `fulcrum.cli.v1` envelope (CLI-TUI-UX.md
 * §3) — never a bare array — regardless of whether a test loader is injected.
 * `--json-raw` opts back into the pre-envelope array payload (the documented
 * one-release compatibility flag). The closure review found `plugin list`
 * emitting a raw array; that path is now envelope-safe on every root.
 */
async function runPluginList(
  rest: readonly string[],
  io: OperateIo,
  opts: OperatePluginsOptions,
): Promise<void> {
  const plugins = await loadOrFail({ printErr: io.printErr, exit: io.exit, ...opts });
  if (!plugins) return;
  const root = opts.invocationRoot ?? "operate";
  if (rest.includes("--json")) {
    if (wantsRawJson(rest)) {
      io.print(JSON.stringify(plugins));
      return;
    }
    const scope = parseAgentScope(rest).scope;
    emitResult(
      {
        argv: rest,
        command: `${pluginCommandPrefix(root)} list`,
        result: plugins,
        args: { agents: scopeAgentIds(scope) },
        env: opts.env,
        renderHuman: () => {},
      },
      io,
    );
    return;
  }
  if (plugins.length === 0) {
    io.print("No Claude plugin markers found.");
    return;
  }
  for (const plugin of plugins) {
    const enabledIcon = plugin.enabled ? "✓" : "○";
    io.print(`${enabledIcon} ${plugin.id} (${plugin.source})  ${plugin.name}  ${plugin.marker}`);
  }
}

/**
 * `fulcrum operate plugin show <id>` / `fulcrum plugin show <id>` — the
 * read-only plugin-marker detail.
 *
 * `--json` emits the canonical `fulcrum.cli.v1` envelope; `--json-raw` opts
 * back into the bare marker payload (the documented one-release compatibility
 * flag). An unknown id emits a coded canonical error envelope under `--json`.
 */
async function runPluginShow(
  rest: readonly string[],
  io: OperateIo,
  opts: OperatePluginsOptions,
): Promise<void> {
  const root = opts.invocationRoot ?? "operate";
  const commandPrefix = pluginCommandPrefix(root);
  const id = rest.find((arg) => !arg.startsWith("--"));
  if (!id) {
    if (rest.includes("--json")) {
      emitErrorResult(
        {
          argv: rest,
          command: `${commandPrefix} show`,
          error: {
            code: "FUL_OPERATE_PLUGIN_MISSING_NAME",
            message: `\`fulcrum ${commandPrefix} show\` requires a plugin id.`,
            fix: `Pass a plugin id: \`fulcrum ${commandPrefix} show <id>\`.`,
            doc: "CLI-TUI-UX.md §1.6",
          },
          env: opts.env,
          renderHuman: () => {},
        },
        io,
      );
      return;
    }
    io.printErr(`fulcrum ${commandPrefix} show: missing required argument <id>`);
    io.exit(2);
    return;
  }
  const plugins = await loadOrFail({ printErr: io.printErr, exit: io.exit, ...opts });
  if (!plugins) return;
  const target = plugins.find((plugin) => plugin.id === id);
  if (!target) {
    if (rest.includes("--json")) {
      emitErrorResult(
        {
          argv: rest,
          command: `${commandPrefix} show`,
          error: {
            code: "FUL_OPERATE_PLUGIN_UNKNOWN_ID",
            message: `'${id}' is not a known plugin id.`,
            fix: `List installed markers with \`fulcrum ${commandPrefix} list\`.`,
            doc: "CLI-TUI-UX.md §1.6",
          },
          env: opts.env,
          renderHuman: () => {},
        },
        io,
      );
      return;
    }
    io.printErr(`fulcrum ${commandPrefix} show: unknown plugin id '${id}'`);
    io.exit(1);
    return;
  }
  if (rest.includes("--json")) {
    if (wantsRawJson(rest)) {
      io.print(JSON.stringify(target));
      return;
    }
    emitResult(
      {
        argv: rest,
        command: `${commandPrefix} show`,
        result: target,
        args: { id },
        env: opts.env,
        renderHuman: () => {},
      },
      io,
    );
    return;
  }
  io.print(`${target.id} ${target.enabled ? "enabled" : "disabled"} via ${target.source}`);
  io.print(`  marker: ${target.marker}`);
}

/**
 * `fulcrum operate plugin <install|enable|disable|update|remove>` — the plugin
 * mutation verbs with per-agent scoping (CLI-TUI-UX.md §1.6 + §1.8).
 *
 * No cross-agent plugin server is wired through this host (AGENTS.md "Where we
 * are going" — `fulcrum plugins …` is a placeholder layer). Rather than
 * fabricate a mutation result, each verb emits the canonical envelope: a coded
 * error in the always-array `errors` field, with the *resolved* `--agent` /
 * `--all-agents` scope echoed in `args` so the §1.8 scoping contract is
 * observable and testable. The verb grammar and scoping are complete.
 */
function runPluginMutation(
  verb: PluginVerb,
  rest: readonly string[],
  io: OperateIo,
  opts: OperatePluginsOptions,
): void {
  const root = opts.invocationRoot ?? "operate";
  const commandPrefix = pluginCommandPrefix(root);
  const name = rest.find((arg) => !arg.startsWith("-"));
  const wantsAll = verb === "update" && rest.includes("--all");
  if (!name && !wantsAll) {
    emitErrorResult(
      {
        argv: rest,
        command: `${commandPrefix} ${verb}`,
        error: {
          code: "FUL_OPERATE_PLUGIN_MISSING_NAME",
          message: `\`fulcrum ${commandPrefix} ${verb}\` requires a plugin name.`,
          fix: `Pass a plugin name: \`fulcrum ${commandPrefix} ${verb} <name>\`.`,
          doc: "CLI-TUI-UX.md §1.6",
        },
        env: opts.env,
        renderHuman: () => {},
      },
      io,
    );
    return;
  }

  const parsed = parseAgentScope(rest);
  if (parsed.invalidAgent !== undefined) {
    emitErrorResult(
      {
        argv: rest,
        command: `${commandPrefix} ${verb}`,
        error: {
          code: "FUL_OPERATE_PLUGIN_UNKNOWN_AGENT",
          message: parsed.invalidAgent
            ? `'${parsed.invalidAgent}' is not a known agent id.`
            : "`--agent` requires an agent id.",
          fix: `Use one of: ${ALL_AGENT_IDS.join(", ")} — or --all-agents.`,
          doc: "CLI-TUI-UX.md §1.8",
        },
        env: opts.env,
        renderHuman: () => {},
      },
      io,
    );
    return;
  }

  const scope = parsed.scope;
  emitErrorResult(
    {
      argv: rest,
      command: `${commandPrefix} ${verb}`,
      args: {
        plugin: name ?? (wantsAll ? "--all" : null),
        // The resolved §1.8 scope — observable in the envelope for parity tests.
        all_agents: scope.kind === "all",
        agents: scopeAgentIds(scope),
        scope: describeScope(scope),
      },
      error: {
        code: "FUL_OPERATE_PLUGIN_UNAVAILABLE",
        message:
          `\`fulcrum ${commandPrefix} ${verb}\` (scope: ${describeScope(scope)}) is not ` +
          "available — no cross-agent plugin server is configured.",
        fix:
          "Cross-agent plugin install is staged behind the plugins.cross_agent feature " +
          "flag. Until it lands, manage plugin markers with `fulcrum operate plugin list`.",
        doc: "CLI-TUI-UX.md §1.6",
      },
      env: opts.env,
      renderHuman: () => {},
    },
    io,
  );
}

/** Dispatch the `plugin` / `plugins` verb group. */
async function runPluginGroup(
  rest: readonly string[],
  io: OperateIo,
  opts: OperatePluginsOptions,
): Promise<void> {
  const root = opts.invocationRoot ?? "operate";
  const commandPrefix = pluginCommandPrefix(root);
  const [verb = "help", ...verbRest] = rest;

  if (isHelpVerb(verb)) {
    io.print(PLUGIN_HELP);
    return;
  }
  if (!PLUGIN_VERBS.includes(verb as PluginVerb)) {
    if (rest.includes("--json")) {
      emitErrorResult(
        {
          argv: rest,
          command: `${commandPrefix} ${verb}`,
          error: {
            code: "FUL_OPERATE_PLUGIN_UNKNOWN_VERB",
            message: `\`${verb}\` is not a known \`fulcrum ${commandPrefix}\` verb.`,
            fix: `Use one of: ${PLUGIN_VERBS.join(", ")}.`,
            doc: "CLI-TUI-UX.md §1.6",
          },
          env: opts.env,
          renderHuman: () => {},
        },
        io,
      );
      return;
    }
    io.printErr(`fulcrum ${commandPrefix}: unknown command '${verb}'`);
    io.printErr(PLUGIN_HELP);
    io.exit(2);
    return;
  }
  const pluginVerb = verb as PluginVerb;
  if (pluginVerb === "list") {
    await runPluginList(verbRest, io, opts);
    return;
  }
  if (pluginVerb === "show") {
    await runPluginShow(verbRest, io, opts);
    return;
  }
  if (PLUGIN_MUTATION_VERBS.includes(pluginVerb)) {
    runPluginMutation(pluginVerb, verbRest, io, opts);
    return;
  }
}

/**
 * Dispatch a backed Operate noun to its command host. `doctor`, `mcp`, `hooks`,
 * `skills`, and `audit` already own command hosts in the CLI; routing through
 * `fulcrum operate <noun>` keeps the canonical Operate grammar without removing
 * or duplicating those commands (AGENTS.md "no command removed").
 */
async function runBackedNoun(
  noun: "doctor" | "mcp" | "hooks" | "skills" | "audit",
  rest: readonly string[],
  io: OperateIo,
  opts: OperatePluginsOptions,
): Promise<void> {
  switch (noun) {
    case "doctor": {
      const { run } = await import("../doctor.ts");
      await run([...rest]);
      return;
    }
    case "mcp": {
      const { run } = await import("../mcp-cmd.ts");
      await run([...rest]);
      return;
    }
    case "hooks": {
      const { run } = await import("../hooks.ts");
      await run([...rest]);
      return;
    }
    case "skills": {
      const { run } = await import("../skills.ts");
      await run([...rest]);
      return;
    }
    case "audit": {
      const { run } = await import("../audit.ts");
      // `audit.ts` resolves its API env from `process.env` by default; the
      // Operate host does not override it.
      await run([...rest]);
      return;
    }
  }
}

/**
 * Dispatch an Operate noun (`route` / `agent` / `config`) that has no command
 * host reachable from here. Each is a real CLI-TUI-UX.md §1.6 verb; rather than
 * fabricate data the host emits the canonical envelope naming the noun and the
 * documented command surface, with `next_actions` pointing the operator there.
 */
function runPointerNoun(
  noun: "route" | "agent" | "config",
  rest: readonly string[],
  io: OperateIo,
  opts: OperatePluginsOptions,
): void {
  const [verb = "list"] = rest;
  const surface: Record<typeof noun, string> = {
    route: "fulcrum routing",
    agent: "fulcrum agents",
    config: "fulcrum settings",
  };
  emitResult(
    {
      argv: rest,
      command: `operate ${noun} ${verb}`,
      result: {
        stage: "operate",
        noun,
        verb,
        backedBy: surface[noun],
        message: `Operate \`${noun} ${verb}\` routes to the \`${surface[noun]}\` command surface.`,
      },
      next_actions: [
        { label: `Run ${surface[noun]}`, command: `${surface[noun]} ${verb}` },
      ],
      env: opts.env,
      renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
    },
    io,
  );
}

/**
 * Dispatch a `fulcrum operate` invocation.
 *
 * `argv[0]` is the verb group. The host is invoked two ways, both landing here:
 *  - `fulcrum operate <noun> <verb>` — the canonical Operate-stage grammar.
 *  - `fulcrum operate plugins <verb>` / `fulcrum operate plugin <verb>` — the
 *    legacy and canonical plugin-group spellings (no command removed).
 *
 * A missing or help verb prints the Operate-stage help. The original
 * `operate-plugins.ts` entry — `run(["list"|"show"|"help"], opts)` — is still
 * honoured: a bare `list` / `show` verb is treated as a plugin verb so the
 * pre-existing co-located test contract holds unchanged.
 */
export async function run(argv: readonly string[], opts: OperatePluginsOptions = {}): Promise<void> {
  const io: OperateIo = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [group, ...rest] = argv;

  if (isHelpVerb(group)) {
    io.print(OPERATE_HELP);
    return;
  }

  // Compatibility: the original `operate-plugins.ts` accepted bare plugin verbs
  // (`run(["list"], …)` / `run(["show", id], …)`). Treat a bare plugin verb as
  // the `plugin` group so existing callers keep working.
  if (PLUGIN_VERBS.includes(group as PluginVerb)) {
    await runPluginGroup([group as string, ...rest], io, opts);
    return;
  }
  // `plugins` (plural) is the legacy spelling of the `plugin` group.
  if (group === "plugins") {
    await runPluginGroup(rest, io, opts);
    return;
  }

  switch (group as OperateVerbGroup) {
    case "operate":
      // `fulcrum operate operate` is a no-op alias for the stage help.
      io.print(OPERATE_HELP);
      return;
    case "plugin":
      await runPluginGroup(rest, io, opts);
      return;
    case "doctor":
    case "mcp":
    case "hooks":
    case "skills":
    case "audit":
      await runBackedNoun(group as "doctor" | "mcp" | "hooks" | "skills" | "audit", rest, io, opts);
      return;
    case "trace":
      await runTrace(rest, {
        print: io.print,
        printErr: io.printErr,
        exit: io.exit,
        env: opts.env,
      });
      return;
    case "route":
    case "agent":
    case "config":
      runPointerNoun(group as "route" | "agent" | "config", rest, io, opts);
      return;
    default:
      io.printErr(`fulcrum operate: unknown command '${group}'`);
      io.printErr(OPERATE_HELP);
      io.exit(2);
      return;
  }
}

/** Load the Claude plugin markers via the injected loader, or fail cleanly. */
async function loadOrFail(
  opts: Required<Pick<OperatePluginsOptions, "printErr" | "exit">> & OperatePluginsOptions,
): Promise<readonly ClaudePluginMarker[] | null> {
  if (!opts.loadPlugins) {
    const markers = await listMarkers();
    return markers.map((marker) => ({
      id: marker.plugin,
      name: marker.plugin,
      enabled: marker.operation === "install",
      source: "fulcrum",
      marker: marker.source ?? marker.marketplace ?? "fulcrum marker",
    }));
  }
  try {
    return await opts.loadPlugins();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    opts.printErr(`fulcrum operate plugins: ${message}`);
    opts.exit(1);
    return null;
  }
}
