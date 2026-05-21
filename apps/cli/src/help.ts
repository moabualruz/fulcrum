/**
 * Workflow-stage CLI command tree.
 *
 * `fulcrum --help` groups commands by the six product workflow stages
 * (Capture · Plan · Build · Review · Ship · Operate) plus AI Assist and a
 * Cross-cutting / Global group, so a CLI user shares the same mental model as
 * the web and TUI surfaces (CLI-TUI-UX.md §1; PRODUCT.md hard invariant 7 —
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
    summary: "Intake — docs, notes, captures, and search before planning.",
    commands: [
      "fulcrum capture <review|status|action>      Review mobile captures, set status, run quick actions.",
      "fulcrum docs <template list>                 Browse and template capture documents.",
      "fulcrum search query <query>                 Full-text search across captured content.",
    ],
    examples: [
      "fulcrum capture review <id> --note \"triaged\"",
      "fulcrum capture status <id> --status review --json",
      "fulcrum search query \"release plan\" --json",
    ],
  },
  {
    label: "Plan",
    summary: "Turn captured intent into approved plans, sprints, and prototypes.",
    commands: [
      "fulcrum product planning preview --plan <id> --file <path>",
      "                                             Preview approved-plan docs/tasks/dependencies.",
      "fulcrum product planning materialize --plan <id> --file <path>",
      "                                             Persist approved-plan docs/tasks/dependencies.",
      "fulcrum sprints <list|get|create|update|delete|add-task|remove-task>",
      "                                             Manage sprints and sprint membership.",
    ],
    examples: [
      "fulcrum product planning preview --plan p-12 --file plan.md --json",
      "fulcrum sprints list --json",
      "fulcrum sprints add-task --sprint s-3 --task t-9",
    ],
  },
  {
    label: "Build",
    summary: "Execute the plan — tasks, agent runs, work items, and routing.",
    commands: [
      "fulcrum task|tasks <list|get|new|create|update|delete>",
      "                                             Create and manage build tasks.",
      "fulcrum work <create|inspect|move|link|report>",
      "                                             Manage durable units of work.",
      "fulcrum runs <list|show|cancel|retry|dispatch|preview|feed|worker-tick|logs>",
      "                                             Inspect and control agent runs.",
      "fulcrum agents <list|profile|test>           Inspect the agent registry.",
      "fulcrum routing <rules|assign|simulate>      Route action kinds to agents.",
      "fulcrum symphony runs list --state ready     Inspect orchestrated run queues.",
    ],
    examples: [
      "fulcrum task list --status open --json",
      "fulcrum runs feed --watch --json",
      "fulcrum routing simulate --action build.run.step --json",
    ],
  },
  {
    label: "Review",
    summary: "Quality gates — UAT, code review, and final-handoff decisions.",
    commands: [
      "fulcrum product reports uat-handoff <id>     Hand a task to the UAT review gate.",
      "fulcrum product reports decision <id>        Record an approve/request-changes decision.",
      "fulcrum product reports e2e-run --project <id>",
      "                                             Run the end-to-end review suite.",
    ],
    examples: [
      "fulcrum product reports uat-handoff t-9 --json",
      "fulcrum product reports decision t-9 --decision approve",
      "fulcrum product reports e2e-run --project fulcrum --json",
    ],
  },
  {
    label: "Ship",
    summary: "Release outputs — artifacts, repositories, and promoted memory.",
    commands: [
      "fulcrum artifacts <list|show|upload|accept|reject|download|archive|unarchive|delete>",
      "                                             Manage run artifacts and releases.",
      "fulcrum repos <register|list|sync|unregister|status>",
      "                                             Manage tracked repositories.",
      "fulcrum memory <list|get|add|delete|search|promote>",
      "                                             Manage and promote persistent memory.",
    ],
    examples: [
      "fulcrum artifacts list --json",
      "fulcrum repos status --json",
      "fulcrum memory promote --candidate m-4 --tier semantic",
    ],
  },
  {
    label: "Operate",
    summary: "Run the system — health, installs, MCP, hooks, config, and audit.",
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
    summary: "Step-scoped agent sessions — the CLI side of the AI Assist drawer.",
    commands: [
      "fulcrum mode <manual|play|discuss|ai> <step> Apply a per-step mode affordance.",
      "fulcrum ai start --task <id> --title <title> Start a step-scoped AI Assist session.",
      "fulcrum session <list|pause|resume|abort|checkpoint|restore|checkpoints|watch>",
      "                                             Control persisted AI Assist sessions.",
    ],
    examples: [
      "fulcrum mode play AUTH-42 --agent codex --json",
      "fulcrum ai start --task t-9 --title \"draft tests\" --json",
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

function renderStageGroup(stage: StageHelp): string {
  const heading = stage.label.toUpperCase();
  const body = stage.commands.map((line) => `  ${line}`).join("\n");
  return `${heading}\n  ${stage.summary}\n${body}`;
}

/** Root `fulcrum --help` — workflow-stage organized command tree. */
const ROOT_HELP = `fulcrum — local-first CLI Agent OS

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
  return `fulcrum — ${stage.label} stage

${stage.summary}

Commands:
${commands}

Examples:
${examples}

${GLOBAL_FLAGS_NOTE}
`;
}

export {
  HELP,
  ROOT_HELP,
  STAGE_HELP_TOPICS,
  renderStageHelp,
};

