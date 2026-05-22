/**
 * Workflow-stage CLI command tree.
 *
 * `fulcrum --help` groups commands by the six product workflow stages
 * (Capture · Plan · Build · Review · Ship · Operate) plus AI Assist and a
 * Cross-cutting / Global group, so a CLI user shares the same mental model as
 * the web and TUI surfaces (CLI-TUI-UX.md §1; PRODUCT.md hard invariant 7 -
 * "Workflow-stage navigation is non-negotiable"). Existing flat command names
 * keep working as compatibility wrappers; this help points at the canonical
 * stage-organized command home first.
 */
interface StageHelp {
  /** Canonical stage label shown as the root-help group heading. */
  readonly label: string;
  /** One-line description of what the stage is for. */
  readonly summary: string;
  /** Command lines listed under the stage group. */
  readonly commands: readonly string[];
  /** Concrete examples shown by `fulcrum help <stage>`. */
  readonly examples: readonly string[];
}

/** The six product workflow stages plus AI Assist, in canonical order. */
const WORKFLOW_STAGES: readonly StageHelp[] = [
  {
    label: "Capture",
    summary: "Intake: docs, notes, captures, and search before planning.",
    commands: [
      "fulcrum capture <text|url|file|inbox|review|status|action>",
      "                                             Capture intake items and triage mobile/inbox captures.",
      "fulcrum note <new|list>                      Create and browse short-form capture notes.",
      "fulcrum doc <list|new|view|edit|attach|history|restore|comment|link|search|delete|template>",
      "                                             Browse and edit capture documents.",
      "fulcrum search query <query>                 Full-text search across captured content.",
    ],
    examples: [
      "fulcrum note list --json",
      "fulcrum doc new --title \"Release plan\" --json",
      "fulcrum capture status <id> --status review --json",
      "fulcrum search query \"release plan\" --json",
    ],
  },
  {
    label: "Plan",
    summary: "Turn captured intent into approved plans, sprints, and prototypes.",
    commands: [
      "fulcrum plan <start|list|view|edit|approve|reject|materialize|preview>",
      "                                             Manage approved-plan docs/tasks/dependencies.",
      "fulcrum mission <create|list|show|activate|delete>",
      "                                             Shape mission hierarchy and active waves.",
      "fulcrum prototype <new|view|attach>          Create and attach plan prototypes.",
      "fulcrum sprints <list|get|create|update|delete|add-task|remove-task>",
      "                                             Manage sprints and sprint membership.",
    ],
    examples: [
      "fulcrum plan list --status approved --json",
      "fulcrum mission list --depth 2",
      "fulcrum prototype view pro-1 --json",
      "fulcrum sprints list --json",
    ],
  },
  {
    label: "Build",
    summary: "Execute the plan: tasks, agent runs, work items, and routing.",
    commands: [
      "fulcrum task|tasks <list|get|new|create|update|delete>",
      "                                             Create and manage build tasks.",
      "fulcrum work <create|inspect|move|link|report>",
      "                                             Manage durable units of work.",
      "fulcrum run <new|view|cancel|retry|attach>   Manage one agent run.",
      "fulcrum runs <list|show|cancel|retry|dispatch|preview|feed|worker-tick|logs>",
      "                                             Inspect and control the runs feed.",
      "fulcrum cycle <list|activate|complete>       Manage build cycles.",
      "fulcrum module <list|new|view>               Manage build modules.",
      "fulcrum context <pack|inspect|diff>          Inspect task run context.",
      "fulcrum agent <list|profile|test>            Inspect the agent registry.",
      "fulcrum route <rules|assign|simulate>        Route action kinds to agents.",
      "fulcrum symphony runs list --state ready     Inspect orchestrated run queues.",
    ],
    examples: [
      "fulcrum task list --status open --json",
      "fulcrum run view run-1 --json",
      "fulcrum cycle list --json",
      "fulcrum runs feed --watch --json",
      "fulcrum route simulate --action build.run.step --json",
    ],
  },
  {
    label: "Review",
    summary: "Quality gates: UAT, code review, and final-handoff decisions.",
    commands: [
      "fulcrum review <list|view|approve|request-changes>",
      "                                             Review queue and approval decisions.",
      "fulcrum qa <run|report>                      Run QA checks and report artifacts.",
      "fulcrum uat <run|handoff|decision>           Hand tasks to UAT and record decisions.",
      "fulcrum e2e <run|report>                     Run or inspect end-to-end review suites.",
    ],
    examples: [
      "fulcrum review list --status open --json",
      "fulcrum qa run --task t-9",
      "fulcrum uat decision t-9 --decision approve",
      "fulcrum e2e run --project fulcrum --json",
    ],
  },
  {
    label: "Ship",
    summary: "Release outputs: artifacts, repositories, and promoted memory.",
    commands: [
      "fulcrum ship <list|view>                     Inspect release list and detail surfaces.",
      "fulcrum release <cut|roll-back|pause|promote>",
      "                                             Operate release rollout actions.",
      "fulcrum artifact <list|view|diff|export|download>",
      "                                             Manage run artifacts and releases.",
      "fulcrum repo <list|status|sync>              Manage tracked repositories.",
      "fulcrum branch <list|switch|finish>          Inspect and move branch state.",
      "fulcrum pr <list|view|create>                Inspect and create pull requests.",
      "fulcrum memory <list|get|add|delete|search|promote>",
      "                                             Manage and promote persistent memory.",
    ],
    examples: [
      "fulcrum ship list --json",
      "fulcrum release cut --json",
      "fulcrum artifact list --json",
      "fulcrum repo status --json",
      "fulcrum memory promote --candidate m-4 --tier semantic",
    ],
  },
  {
    label: "Operate",
    summary: "Run the system: health, installs, MCP, hooks, config, and audit.",
    commands: [
      "fulcrum doctor [--json] [--subsystem <name>] [--checks] [--probe]",
      "                                             Report environment and policy health.",
      "fulcrum install [--profile minimal|rules-only|full] [--dry-run]",
      "                                             Splice rules, vendor hooks, sync skills.",
      "fulcrum uninstall [--dry-run] [--purge]      Remove Fulcrum-managed install artifacts.",
      "fulcrum mcp <list|register|unregister|enable|disable>",
      "                                             Manage the MCP server registry.",
      "fulcrum hooks <list|enable|disable|test>     Manage agent hook recipes.",
      "fulcrum skills <sync|upstream|lint|list>     Mirror and validate authored skills.",
      "fulcrum component|components <list|info|plan|status>",
      "                                             Inspect the component lifecycle.",
      "fulcrum settings <list|get|set>              Read and write workspace settings.",
      "fulcrum flags <list|set>                     Read and write feature flags.",
      "fulcrum audit <query|export>                 Query the audit log.",
      "fulcrum db <migrate|status|history>          Manage the local database.",
      "fulcrum compress [--check] [FILES...]        Caveman-compress markdown.",
      "fulcrum inference <start|status|embed|generate|stop>",
      "                                             Manage the local inference runtime.",
      "fulcrum telemetry <status|opt-in|opt-out|purge>",
      "                                             Manage telemetry consent.",
      "fulcrum notify list [--unread]               List notifications.",
      "fulcrum offline <status|sync-now>            Inspect offline/sync state.",
      "fulcrum backup <create|restore|verify>       Manage local backups.",
      "fulcrum data <export|import>                 Export or import workspace data.",
      "fulcrum secrets <set|get|rotate|init-keyring>",
      "                                             Manage local secrets.",
      "fulcrum errors <list|get|purge>              Inspect the error log.",
      "fulcrum webhooks <list|test>                 Manage webhooks.",
      "fulcrum connectors <enable|sync> <id>        Manage external connectors.",
      "fulcrum i18n <list|set>                      Manage locale.",
      "fulcrum theme <list|set>                     Manage theme.",
    ],
    examples: [
      "fulcrum doctor --json",
      "fulcrum install --profile minimal --dry-run",
      "fulcrum audit query --action build.run.step --json",
    ],
  },
  {
    label: "AI Assist",
    summary: "Step-scoped agent sessions: the CLI side of the AI Assist drawer.",
    commands: [
      "fulcrum mode <manual|play|discuss|ai> <step> Apply a per-step mode affordance.",
      "fulcrum ai <start|send|attach|pause|resume|abort|checkpoint|restore|preview|rerun>",
      "                                             Operate step-scoped AI Assist threads.",
      "fulcrum session <list|pause|resume|abort|checkpoint|restore|checkpoints|watch>",
      "                                             Control persisted AI Assist sessions.",
    ],
    examples: [
      "fulcrum mode play AUTH-42 --agent codex --json",
      "fulcrum ai start --task t-9 --title \"draft tests\" --json",
      "fulcrum ai send --thread thread-1 --message \"try focused tests\" --json",
      "fulcrum session list --json",
      "fulcrum session watch <id>",
    ],
  },
];

/** Cross-cutting / Global commands that do not belong to a single stage. */
const GLOBAL_HELP: StageHelp = {
  label: "Cross-cutting / Global",
  summary: "Surface launchers and global commands available from any stage.",
  commands: [
    "fulcrum init [DIR]                           Bootstrap a project (AGENTS.md, .gitignore).",
    "fulcrum projects <list|stats>                Manage project / workspace scope.",
    "fulcrum auth <whoami|invite|login|logout>    Manage CLI authentication.",
    "fulcrum web                                  Open the web shell in a browser.",
    "fulcrum tui                                  Open the keyboard-first TUI workbench.",
    "fulcrum completion <bash|zsh|fish|powershell>",
    "                                             Print a shell completion script with install guidance.",
    "fulcrum version                              Print the CLI version.",
    "fulcrum help [stage]                         This message, or per-stage detail.",
  ],
  examples: [
    "fulcrum help build",
    "fulcrum completion zsh",
    "fulcrum tui",
  ],
};

/** All stage help blocks, keyed by lowercased single-word topic. */
const STAGE_HELP: ReadonlyMap<string, StageHelp> = new Map(
  [...WORKFLOW_STAGES, GLOBAL_HELP].map((stage) => [
    stage.label.split(" ")[0]!.toLowerCase(),
    stage,
  ]),
);

/** Topic names accepted by `fulcrum help <topic>`. */
const STAGE_HELP_TOPICS: readonly string[] = [...STAGE_HELP.keys()];

const GLOBAL_FLAGS_NOTE =
  "Every command accepts --json for the machine-readable fulcrum.cli.v1 envelope\n" +
  "(CLI-TUI-UX.md §3). Add --jq <expr> to filter, --no-color to disable color.";

const CLI_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "fulcrum.cli.v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "trace_id",
    "span_id",
    "run_id",
    "project_id",
    "command",
    "args",
    "result",
    "errors",
    "next_actions",
    "duration_ms",
    "timestamp",
  ],
  properties: {
    schema: { const: "fulcrum.cli.v1" },
    trace_id: { type: "string" },
    span_id: { type: "string" },
    run_id: { type: ["string", "null"] },
    project_id: { type: ["string", "null"] },
    command: { type: "string" },
    args: { type: "object" },
    result: true,
    errors: {
      type: "array",
      items: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          fix: { type: "string" },
          doc: { type: "string" },
          trace_id: { type: "string" },
          context: { type: "object" },
        },
      },
    },
    next_actions: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "command"],
        properties: {
          label: { type: "string" },
          command: { type: "string" },
        },
      },
    },
    duration_ms: { type: "number" },
    timestamp: { type: "string", format: "date-time" },
  },
} as const;

type JsonObjectSchema = Record<string, unknown>;

const BOOLEAN_SCHEMA_FLAGS = new Set([
  "--archived",
  "--check",
  "--checks",
  "--dry-run",
  "--hard",
  "--help",
  "-h",
  "--json",
  "--json-raw",
  "--json-schema",
  "--probe",
  "--purge",
  "--unread",
  "--watch",
  "--yes",
]);

const VALUE_SCHEMA_FLAGS = new Set([
  "--action",
  "--agent",
  "--against",
  "--assignee",
  "--body",
  "--budget",
  "--checkpoint",
  "--cycle",
  "--description",
  "--editor",
  "--from-checkpoint",
  "--from-step",
  "--id",
  "--label",
  "--limit",
  "--message",
  "--model",
  "--mode",
  "--note",
  "--offset",
  "--parent",
  "--policy",
  "--profile",
  "--project",
  "--reason",
  "--route",
  "--scope",
  "--shell",
  "--state",
  "--status",
  "--step",
  "--subsystem",
  "--tag",
  "--task",
  "--thread",
  "--title",
  "--trace",
  "--type",
  "--version",
  "--workspace",
]);

const ROOT_ALIASES = new Map([
  ["agents", "agent"],
  ["docs", "doc"],
  ["routing", "route"],
]);

function normalizeCommandPath(command?: string | readonly string[]): string[] {
  if (command === undefined) return [];
  const parts = typeof command === "string" ? command.trim().split(/\s+/) : [...command];
  if (parts[0] === "fulcrum") parts.shift();
  if (parts[0] === "help" && parts.length > 1) parts.shift();
  return parts.filter((part: string) => part && !part.startsWith("-")).slice(0, 3);
}

function canonicalHelpRoot(root: string): string {
  return ROOT_ALIASES.get(root) ?? root;
}

function commandPathLabel(command?: string | readonly string[]): string {
  const path = normalizeCommandPath(command);
  return path.length > 0 ? `fulcrum ${path.join(" ")}` : "fulcrum";
}

function resultSchemaFor(command?: string | readonly string[]): JsonObjectSchema {
  const commandLabel = commandPathLabel(command);
  const [root = "root", verb] = normalizeCommandPath(command);
  const title = `${commandLabel} result`;
  if (root === "ai") {
    return {
      title,
      oneOf: [
        { type: "object", description: `${commandLabel} AI Assist result payload.` },
        { type: "null", description: `${commandLabel} failure result.` },
      ],
    };
  }
  if (["list", "search", "query", undefined].includes(verb)) {
    return {
      title,
      oneOf: [
        { type: "array", description: `${commandLabel} rows.` },
        { type: "object", description: `${commandLabel} result object.` },
        { type: "null", description: `${commandLabel} failure result.` },
      ],
    };
  }
  return {
    title,
    oneOf: [
      { type: "object", description: `${commandLabel} result object.` },
      { type: "array", description: `${commandLabel} result rows.` },
      { type: "string", description: `${commandLabel} scalar result.` },
      { type: "null", description: `${commandLabel} failure result.` },
    ],
  };
}

function renderCommandSchema(command?: string | readonly string[]): JsonObjectSchema {
  return {
    ...CLI_RESULT_SCHEMA,
    title: `${commandPathLabel(command)} fulcrum.cli.v1`,
    properties: {
      ...CLI_RESULT_SCHEMA.properties,
      result: resultSchemaFor(command),
    },
  };
}

function commandPathFromArgv(argv: readonly string[]): string[] {
  const raw = argv[0] === "help" ? argv.slice(1) : [...argv];
  const path: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index]!;
    if (arg === "--") break;
    if (BOOLEAN_SCHEMA_FLAGS.has(arg)) continue;
    if (VALUE_SCHEMA_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    path.push(arg);
    if (path.length >= 3) break;
  }
  return path;
}

function renderStageGroup(stage: StageHelp): string {
  const heading = stage.label.toUpperCase();
  const body = stage.commands.map((line) => `  ${line}`).join("\n");
  return `${heading}\n  ${stage.summary}\n${body}`;
}

/** Root `fulcrum --help`: workflow-stage organized command tree. */
const ROOT_HELP = `fulcrum: local-first CLI Agent OS

Commands are grouped by workflow stage so the CLI shares one mental model with
the web and TUI surfaces (Capture · Plan · Build · Review · Ship · Operate).

Usage:
  fulcrum <command> [subcommand] [options]
  fulcrum help <stage>             Show commands and examples for one stage.

${[...WORKFLOW_STAGES, GLOBAL_HELP].map(renderStageGroup).join("\n\n")}

${GLOBAL_FLAGS_NOTE}

Environment:
  FULCRUM_HOME           override ~/.fulcrum
  FULCRUM_POLICY         override ~/.fulcrum/tool-output-policy.toml
  FULCRUM_HEAD_LINES     head lines for summary tiers (default 20)

Run \`fulcrum help <stage>\` (e.g. \`fulcrum help build\`) for stage detail.
`;

const COMMAND_HELP: ReadonlyMap<string, string> = new Map([
  ["agent", `fulcrum agent <list|profile|test>

Inspect agent registry entries and profile/test metadata.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["agents", `fulcrum agents <list|profile|test>

Compatibility alias for fulcrum agent.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["ai", `fulcrum ai: AI Assist thread surface

Usage:
  fulcrum ai --step <step-id> --thread <thread-id> [--title <title>] [--json]
  fulcrum ai start --task <id> --title <title> --step <step-id> [--json]
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
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)
`],
  ["cycle", `fulcrum cycle <list|activate|complete> [--json]

Build cycles: list, activate, or complete project cycles.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["doc", `fulcrum doc <list|new|view|edit|attach|history|restore|comment|link|search|delete|template> [--json]

Capture-stage documents: browse, edit, attach, link, comment, and template docs.

Aliases:
  fulcrum docs ...  Compatibility alias for fulcrum doc ...

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["docs", `fulcrum docs <list|new|view|edit|attach|history|restore|comment|link|search|delete|template> [--json]

Compatibility alias for fulcrum doc.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["flags", `fulcrum flags <list|set> [--json]

Subcommands:
  list              List feature flags.
  set               Set a feature flag.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["inference", `fulcrum inference <start|status|embed|generate|stop> [--json]

Manage the local inference runtime.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["init", `fulcrum init [DIR]

Bootstrap a project with Fulcrum agent rules and local ignore defaults.
`],
  ["mcp", `fulcrum mcp <list|register|unregister|enable|disable> [--json]

Manage the MCP server registry.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["module", `fulcrum module <list|new|view> [--json]

Build modules: group, create, and inspect task modules.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["note", `fulcrum note <new|list> [--json]

Short-form capture notes.

Usage:
  fulcrum note new <text> [--project <id>] [--trace <id>] [--json]
  fulcrum note list [--tag <tag>] [--project <id>] [--json]

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["route", `fulcrum route <rules|assign|simulate> [--json]

Route action kinds to agents.

Aliases:
  fulcrum routing ...  Compatibility alias for fulcrum route ...

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["routing", `fulcrum routing <rules|assign|simulate> [--json]

Compatibility alias for fulcrum route.

Subcommands:
  rules list        List routing rules.
  assign            Assign an action to an agent.
  simulate          Simulate routing for an action.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["run", `fulcrum run <new|view|cancel|retry|attach> [--json]

Manage one agent run.

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
]);

const COMMAND_PATH_HELP: ReadonlyMap<string, string> = new Map([
  ["data export", `fulcrum export [--json]

Export workspace data.

Canonical path:
  fulcrum data export [--json]
`],
  ["data import", `fulcrum data import [--json]

Import workspace data.
`],
]);

/** Back-compat alias: callers that imported `HELP` keep working. */
const HELP = ROOT_HELP;

/**
 * Render per-stage help for `fulcrum help <stage>`.
 * Returns null when the topic is not a known stage.
 */
function renderStageHelp(topic: string): string | null {
  const stage = STAGE_HELP.get(topic.trim().toLowerCase());
  if (!stage) return null;
  const commands = stage.commands.map((line) => `  ${line}`).join("\n");
  const examples = stage.examples.map((line) => `  ${line}`).join("\n");
  return `fulcrum: ${stage.label} stage

${stage.summary}

Commands:
${commands}

Examples:
${examples}

${GLOBAL_FLAGS_NOTE}
`;
}

function renderGenericCommandHelp(path: readonly string[]): string {
  const command = commandPathLabel(path);
  return `${command}

Usage:
  ${command} [subcommand] [options]

${GLOBAL_FLAGS_NOTE}
`;
}

function renderCommandHelp(argv: readonly string[]): string | null {
  const path = commandPathFromArgv(argv);
  if (path.length === 0) return ROOT_HELP;
  const root = path[0]!;
  const pathHelp = COMMAND_PATH_HELP.get(path.join(" "));
  if (pathHelp) return pathHelp;
  const exactHelp = COMMAND_HELP.get(root);
  if (path.length === 1 && exactHelp) return exactHelp;
  const canonicalRoot = canonicalHelpRoot(root);
  if (path.length === 1) {
    const commandHelp = COMMAND_HELP.get(canonicalRoot);
    if (commandHelp) return root === canonicalRoot ? commandHelp : `${commandHelp}\nAlias invoked: fulcrum ${root}\n`;
    return renderStageHelp(canonicalRoot) ?? renderGenericCommandHelp(path);
  }
  const displayPath = root === canonicalRoot ? path : [root, ...path.slice(1)];
  return renderGenericCommandHelp(displayPath);
}

export {
  HELP,
  CLI_RESULT_SCHEMA,
  ROOT_HELP,
  STAGE_HELP_TOPICS,
  commandPathFromArgv,
  renderCommandSchema,
  renderCommandHelp,
  renderStageHelp,
};
