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
      "fulcrum agent <list|view|add|edit|remove|enable|disable|set-default|reload|invoke|test|status|defaults>",
      "                                             Manage the multi-CLI agent registry.",
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
      "fulcrum mcp <list|register|unregister|enable|disable|test|reload>",
      "                                             Manage the MCP server registry.",
      "fulcrum plugin <list|install|enable|disable|update|remove>",
      "                                             List plugin markers; mutation verbs are deferred until plugins.cross_agent.",
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

type ResultSchemaFactory = (title: string, commandLabel: string) => JsonObjectSchema;

const STRING_VALUE = { type: "string" } as const;
const NULLABLE_STRING_VALUE = { type: ["string", "null"] } as const;
const BOOLEAN_VALUE = { type: "boolean" } as const;
const NUMBER_VALUE = { type: "number" } as const;
const OBJECT_VALUE = { type: "object", additionalProperties: true } as const;
const NULL_VALUE = { type: "null" } as const;

function arrayOf(item: JsonObjectSchema = OBJECT_VALUE): JsonObjectSchema {
  return { type: "array", items: item };
}

function objectResultSchema(
  title: string,
  required: readonly string[],
  properties: Record<string, unknown>,
): JsonObjectSchema {
  return {
    title,
    type: "object",
    additionalProperties: true,
    required,
    properties,
  };
}

function nullResultSchema(title: string): JsonObjectSchema {
  return { title, ...NULL_VALUE };
}

const AGENT_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["name", "cliPath", "defaultFlags"],
  properties: {
    name: STRING_VALUE,
    cliPath: STRING_VALUE,
    defaultFlags: arrayOf(STRING_VALUE),
    skillFolder: STRING_VALUE,
    authEnvVars: arrayOf(STRING_VALUE),
    sandcastleProvider: STRING_VALUE,
    supportsSessionResume: BOOLEAN_VALUE,
    maxIterations: NUMBER_VALUE,
    defaultTimeout: NUMBER_VALUE,
  },
} as const;

const MCP_SERVER_ROW_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["name", "transport", "vendor", "default_enabled", "agent_state", "disabled_config"],
  properties: {
    name: STRING_VALUE,
    transport: STRING_VALUE,
    vendor: STRING_VALUE,
    default_enabled: BOOLEAN_VALUE,
    agent_state: OBJECT_VALUE,
    disabled_config: OBJECT_VALUE,
    description: STRING_VALUE,
    url: STRING_VALUE,
    command_line: STRING_VALUE,
    agent_visibility: OBJECT_VALUE,
  },
} as const;

const MCP_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["agent", "visible", "enabled", "disabled_config"],
  properties: {
    agent: STRING_VALUE,
    visible: BOOLEAN_VALUE,
    enabled: BOOLEAN_VALUE,
    disabled_config: STRING_VALUE,
  },
} as const;

const PLUGIN_MARKER_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["id", "name", "enabled", "source", "marker"],
  properties: {
    id: STRING_VALUE,
    name: STRING_VALUE,
    enabled: BOOLEAN_VALUE,
    source: STRING_VALUE,
    marker: STRING_VALUE,
  },
} as const;

const AI_THREAD_FIELDS = {
  threadId: STRING_VALUE,
  status: STRING_VALUE,
} as const;

const COMMAND_RESULT_SCHEMAS: ReadonlyMap<string, ResultSchemaFactory> = new Map([
  ["capture", (title, commandLabel) =>
    objectResultSchema(title, ["items", "summary"], {
      command: { const: commandLabel },
      items: arrayOf({
        type: "object",
        additionalProperties: true,
        properties: {
          id: STRING_VALUE,
          kind: STRING_VALUE,
          status: STRING_VALUE,
          title: STRING_VALUE,
        },
      }),
      summary: OBJECT_VALUE,
    })],
  ["doctor", (title) =>
    objectResultSchema(title, ["bun", "platform", "agents", "warnings", "errors", "verdict"], {
      bun: STRING_VALUE,
      platform: STRING_VALUE,
      agents: arrayOf({
        type: "object",
        additionalProperties: true,
        properties: {
          label: STRING_VALUE,
          detected: BOOLEAN_VALUE,
          rulesSpliced: BOOLEAN_VALUE,
        },
      }),
      warnings: NUMBER_VALUE,
      errors: NUMBER_VALUE,
      verdict: STRING_VALUE,
    })],
  ["ship", (title) =>
    objectResultSchema(title, ["stage", "surface", "channels", "message"], {
      stage: { const: "ship" },
      surface: STRING_VALUE,
      channels: arrayOf(STRING_VALUE),
      message: STRING_VALUE,
    })],
  ["agent", (title) =>
    objectResultSchema(title, ["profiles"], {
      profiles: arrayOf(AGENT_PROFILE_SCHEMA),
    })],
  ["agent list", (title) => COMMAND_RESULT_SCHEMAS.get("agent")!(title, "fulcrum agent list")],
  ["agent view", (title) =>
    objectResultSchema(title, ["profile"], {
      profile: AGENT_PROFILE_SCHEMA,
    })],
  ["agent add", (title) =>
    objectResultSchema(title, ["profile", "registered", "operation", "client"], {
      profile: AGENT_PROFILE_SCHEMA,
      registered: BOOLEAN_VALUE,
      operation: STRING_VALUE,
      client: STRING_VALUE,
    })],
  ["agent edit", (title) => COMMAND_RESULT_SCHEMAS.get("agent add")!(title, "fulcrum agent edit")],
  ["agent status", (title) => COMMAND_RESULT_SCHEMAS.get("agent add")!(title, "fulcrum agent status")],
  ["agent remove", (title) =>
    objectResultSchema(title, ["name", "removed", "registered"], {
      name: STRING_VALUE,
      removed: BOOLEAN_VALUE,
      registered: BOOLEAN_VALUE,
    })],
  ["agent enable", (title) =>
    objectResultSchema(title, ["profile", "operation", "enabled", "reloaded", "status"], {
      profile: AGENT_PROFILE_SCHEMA,
      operation: STRING_VALUE,
      enabled: BOOLEAN_VALUE,
      reloaded: BOOLEAN_VALUE,
      status: STRING_VALUE,
    })],
  ["agent disable", (title) => COMMAND_RESULT_SCHEMAS.get("agent enable")!(title, "fulcrum agent disable")],
  ["agent reload", (title) => COMMAND_RESULT_SCHEMAS.get("agent enable")!(title, "fulcrum agent reload")],
  ["agent defaults", (title) =>
    objectResultSchema(title, ["defaultAgent", "routes", "availableAgents"], {
      defaultAgent: STRING_VALUE,
      routes: OBJECT_VALUE,
      availableAgents: arrayOf(STRING_VALUE),
    })],
  ["agent set-default", (title) =>
    objectResultSchema(title, ["action", "defaultAgent", "profile"], {
      action: STRING_VALUE,
      defaultAgent: STRING_VALUE,
      profile: AGENT_PROFILE_SCHEMA,
    })],
  ["agent invoke", (title) =>
    objectResultSchema(title, ["action", "agent", "profile", "stepId", "policy", "status"], {
      action: { const: "invoke" },
      agent: STRING_VALUE,
      profile: AGENT_PROFILE_SCHEMA,
      stepId: STRING_VALUE,
      policy: NULLABLE_STRING_VALUE,
      status: STRING_VALUE,
    })],
  ["agent test", (title) =>
    objectResultSchema(title, ["name", "passed", "testedAt"], {
      name: STRING_VALUE,
      passed: BOOLEAN_VALUE,
      reason: STRING_VALUE,
      testedAt: STRING_VALUE,
    })],
  ["mcp", (title) =>
    objectResultSchema(title, ["servers"], {
      servers: arrayOf(MCP_SERVER_ROW_SCHEMA),
    })],
  ["mcp list", (title) => ({
    ...arrayOf(MCP_SERVER_ROW_SCHEMA),
    title,
  })],
  ["mcp register", (title) =>
    objectResultSchema(title, ["name", "registered", "transport", "vendor", "agents"], {
      name: STRING_VALUE,
      registered: BOOLEAN_VALUE,
      transport: STRING_VALUE,
      vendor: STRING_VALUE,
      agents: arrayOf(STRING_VALUE),
    })],
  ["mcp unregister", (title) =>
    objectResultSchema(title, ["name", "unregistered"], {
      name: STRING_VALUE,
      unregistered: BOOLEAN_VALUE,
    })],
  ["mcp enable", (title) =>
    objectResultSchema(title, ["name", "enabled", "agents"], {
      name: STRING_VALUE,
      enabled: BOOLEAN_VALUE,
      agents: arrayOf(STRING_VALUE),
    })],
  ["mcp disable", (title) =>
    objectResultSchema(title, ["name", "enabled", "agents"], {
      name: STRING_VALUE,
      enabled: BOOLEAN_VALUE,
      agents: arrayOf(STRING_VALUE),
    })],
  ["mcp test", (title) =>
    objectResultSchema(title, ["name", "transport", "vendor", "status", "agent", "agents", "checks", "testedAt"], {
      name: STRING_VALUE,
      transport: STRING_VALUE,
      vendor: STRING_VALUE,
      status: STRING_VALUE,
      agent: NULLABLE_STRING_VALUE,
      agents: arrayOf(STRING_VALUE),
      checks: arrayOf(MCP_CHECK_SCHEMA),
      testedAt: STRING_VALUE,
    })],
  ["mcp reload", (title) =>
    objectResultSchema(title, ["name", "reloaded", "agents", "messages"], {
      name: STRING_VALUE,
      reloaded: BOOLEAN_VALUE,
      agents: arrayOf(STRING_VALUE),
      messages: arrayOf(STRING_VALUE),
    })],
  ["plugin", (title) => ({
    ...arrayOf(PLUGIN_MARKER_SCHEMA),
    title,
  })],
  ["plugin list", (title) => COMMAND_RESULT_SCHEMAS.get("plugin")!(title, "fulcrum plugin list")],
  ["plugin show", (title) => ({
    ...PLUGIN_MARKER_SCHEMA,
    title,
  })],
  ["plugin install", (title) => nullResultSchema(title)],
  ["plugin enable", (title) => nullResultSchema(title)],
  ["plugin disable", (title) => nullResultSchema(title)],
  ["plugin update", (title) => nullResultSchema(title)],
  ["plugin remove", (title) => nullResultSchema(title)],
  ["runs feed", (title) =>
    objectResultSchema(title, ["runs", "filters", "watch", "stream", "sentinel"], {
      runs: arrayOf({
        type: "object",
        additionalProperties: true,
        properties: {
          id: STRING_VALUE,
          taskId: STRING_VALUE,
          status: STRING_VALUE,
          agent: STRING_VALUE,
          traceId: STRING_VALUE,
        },
      }),
      filters: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectId: STRING_VALUE,
          runId: STRING_VALUE,
          taskId: STRING_VALUE,
          traceId: STRING_VALUE,
        },
      },
      watch: BOOLEAN_VALUE,
      stream: {
        type: "object",
        additionalProperties: false,
        required: ["jsonl", "poll_ms"],
        properties: {
          jsonl: BOOLEAN_VALUE,
          poll_ms: NUMBER_VALUE,
        },
      },
      sentinel: {
        type: "object",
        additionalProperties: false,
        required: ["schema", "result", "end", "trace_id"],
        properties: {
          schema: { const: "fulcrum.cli.v1" },
          result: { type: "null" },
          end: { const: true },
          trace_id: STRING_VALUE,
        },
      },
    })],
  ["runs tail", (title) =>
    objectResultSchema(title, ["kind", "runId", "lines", "tail"], {
      kind: { const: "runs-tail" },
      runId: STRING_VALUE,
      lines: NUMBER_VALUE,
      tail: arrayOf(STRING_VALUE),
    })],
  ["runs retry", (title) =>
    objectResultSchema(title, ["runId", "status"], {
      runId: STRING_VALUE,
      status: STRING_VALUE,
      fromStep: NUMBER_VALUE,
    })],
  ["run retry", (title) =>
    objectResultSchema(title, ["runId", "status"], {
      runId: STRING_VALUE,
      status: STRING_VALUE,
      fromStep: NUMBER_VALUE,
    })],
  ["ai", (title) =>
    objectResultSchema(title, ["sessionId", "taskId", "agent", "route", "stepScope"], {
      sessionId: STRING_VALUE,
      taskId: STRING_VALUE,
      taskTitle: STRING_VALUE,
      taskDescription: STRING_VALUE,
      agent: STRING_VALUE,
      route: STRING_VALUE,
      workspacePath: STRING_VALUE,
      contextBundle: OBJECT_VALUE,
      stepScope: STRING_VALUE,
      threadId: NULLABLE_STRING_VALUE,
    })],
  ["ai start", (title) => COMMAND_RESULT_SCHEMAS.get("ai")!(title, "fulcrum ai start")],
  ["ai send", (title) =>
    objectResultSchema(title, ["action", "threadId", "message", "status"], {
      action: { const: "send" },
      ...AI_THREAD_FIELDS,
      message: STRING_VALUE,
      messageId: STRING_VALUE,
    })],
  ["ai attach", (title) =>
    objectResultSchema(title, ["action", "threadId", "status"], {
      action: { const: "attach" },
      ...AI_THREAD_FIELDS,
    })],
  ["ai pause", (title) =>
    objectResultSchema(title, ["action", "threadId", "status"], {
      action: { const: "pause" },
      ...AI_THREAD_FIELDS,
    })],
  ["ai resume", (title) =>
    objectResultSchema(title, ["action", "threadId", "status"], {
      action: { const: "resume" },
      ...AI_THREAD_FIELDS,
    })],
  ["ai abort", (title) =>
    objectResultSchema(title, ["action", "threadId", "status"], {
      action: { const: "abort" },
      ...AI_THREAD_FIELDS,
    })],
  ["ai checkpoint", (title) =>
    objectResultSchema(title, ["action", "threadId", "checkpointId", "status"], {
      action: { const: "checkpoint" },
      ...AI_THREAD_FIELDS,
      checkpointId: STRING_VALUE,
    })],
  ["ai restore", (title) =>
    objectResultSchema(title, ["action", "threadId", "checkpointId", "status"], {
      action: { const: "restore" },
      ...AI_THREAD_FIELDS,
      checkpointId: STRING_VALUE,
    })],
  ["ai prompt edit", (title) =>
    objectResultSchema(title, ["action", "threadId", "prompt", "status"], {
      action: { const: "prompt.edit" },
      ...AI_THREAD_FIELDS,
      prompt: STRING_VALUE,
    })],
  ["ai rerun", (title) =>
    objectResultSchema(title, ["action", "threadId", "status"], {
      action: { const: "rerun" },
      ...AI_THREAD_FIELDS,
    })],
  ["ai preview", (title) =>
    objectResultSchema(title, ["action", "taskId", "previewId", "status"], {
      action: { const: "preview" },
      taskId: STRING_VALUE,
      previewId: STRING_VALUE,
      status: STRING_VALUE,
    })],
  ["ai route", (title) =>
    objectResultSchema(title, ["action", "threadId", "agent", "status"], {
      action: { const: "route" },
      ...AI_THREAD_FIELDS,
      agent: STRING_VALUE,
    })],
]);

function resultSchemaFor(command?: string | readonly string[]): JsonObjectSchema {
  const commandLabel = commandPathLabel(command);
  const rawPath = normalizeCommandPath(command);
  const [rawRoot = "root", verb, subverb] = rawPath;
  const root = canonicalHelpRoot(rawRoot);
  const title = `${commandLabel} result`;

  const schemaKey = [root, verb, subverb].filter(Boolean).join(" ");
  const rootVerbKey = [root, verb].filter(Boolean).join(" ");
  const schemaFactory =
    COMMAND_RESULT_SCHEMAS.get(schemaKey) ??
    COMMAND_RESULT_SCHEMAS.get(rootVerbKey) ??
    COMMAND_RESULT_SCHEMAS.get(root);

  if (schemaFactory) return schemaFactory(title, commandLabel);

  return objectResultSchema(title, ["command", "summary"], {
    command: { const: commandLabel },
    root: { const: root },
    verb: verb ? { const: verb } : NULLABLE_STRING_VALUE,
    summary: {
      type: "object",
      additionalProperties: true,
      description: `${commandLabel} command-specific summary payload.`,
    },
    items: {
      type: "array",
      description: `${commandLabel} command-specific row payloads when the command returns a collection.`,
      items: OBJECT_VALUE,
    },
    value: {
      description: `${commandLabel} command-specific scalar payload when applicable.`,
    },
  });
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
  ["agent", `fulcrum agent <list|view|add|edit|remove|enable|disable|set-default|reload|invoke|test|status|defaults>

Manage the no-cap multi-CLI agent registry.

Usage:
  fulcrum agent list [--json] [--client <kind>] [--ring <ring>]
  fulcrum agent view <id> [--json]
  fulcrum agent add <id> --client <kind> [--binary <path>] [--model <m>] [--json]
  fulcrum agent edit <id> [--ring <r>] [--policy <file>] [--model <m>] [--json]
  fulcrum agent remove <id> [--force] [--json]
  fulcrum agent enable <id> [--json]
  fulcrum agent disable <id> [--json]
  fulcrum agent set-default <id> [--action <kind>] [--json]
  fulcrum agent reload <id> [--json]
  fulcrum agent invoke <id> [--step <step-id>] [--policy <file>] [--json]
  fulcrum agent test <id> [--json]
  fulcrum agent status <id> [--json]
  fulcrum agent defaults [--json]

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["agents", `fulcrum agents <list|view|add|edit|remove|enable|disable|set-default|reload|invoke|test>

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
  ["mcp", `fulcrum mcp <list|register|unregister|enable|disable|test|reload> [--json]

Manage the MCP server registry.

Usage:
  fulcrum mcp list [--json] [--agent <id>]
  fulcrum mcp register <name> [--http <url>|--stdio <cmd>] [--vendor <v>] [--agent <id>...] [--all-agents]
  fulcrum mcp unregister <name> [--agent <id>...] [--all-agents]
  fulcrum mcp enable <name> [--agent <id>...] [--all-agents]
  fulcrum mcp disable <name> [--agent <id>...] [--all-agents]
  fulcrum mcp test <name> [--agent <id>]
  fulcrum mcp reload <name> [--agent <id>...] [--all-agents]

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["plugin", `fulcrum plugin <list|show|install|enable|disable|update|remove> [--json]

Operate plugin markers and deferred cross-agent mutation verbs.

Usage:
  fulcrum plugin list [--json] [--agent <id>]
  fulcrum plugin show <id> [--json]
  fulcrum plugin install <name> [--agent <id>...] [--all-agents] [--version <v>]
  fulcrum plugin enable <name> [--agent <id>...] [--all-agents]
  fulcrum plugin disable <name> [--agent <id>...] [--all-agents]
  fulcrum plugin update <name|--all> [--agent <id>...] [--all-agents]
  fulcrum plugin remove <name> [--agent <id>...] [--all-agents]

Deferred:
  install, enable, disable, update, and remove return FUL_NOT_IMPLEMENTED until plugins.cross_agent is wired.

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
  ["route", `fulcrum route <list|show|set|rules|assign|simulate> [--json]

Route action kinds to agents.

Usage:
  fulcrum route list [--project <id>] [--json]
  fulcrum route show <action> [--project <id>] [--json]
  fulcrum route set <action> <agent> [--project <id>] [--json]
  fulcrum route rules list [--project <id>] [--json]
  fulcrum route assign <task-id> [--json]
  fulcrum route simulate --task-json <json|@file.json> [--json]

Aliases:
  fulcrum routing ...  Compatibility alias for fulcrum route ...

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
`],
  ["report", `fulcrum report <list|burndown|burnup|velocity|cfd|cycle-time|lead-time|throughput|wip|workload|blocked|stale|progress> [--json]

Report subcommands.

Usage:
  fulcrum report list [--json]
  fulcrum report <type> [--project <id>] [--sprint <id>] [--format json|table|csv] [--days <n>]

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
