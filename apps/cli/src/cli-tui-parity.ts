export type CliTuiParityStage = "Capture" | "Build" | "Review" | "Ship" | "Operate" | "System";

export interface CliTuiParityRow {
  readonly stage: CliTuiParityStage;
  readonly cli: string;
  readonly tui: string;
  readonly route: string;
  readonly keyPath: readonly string[];
}

export const CLI_TUI_PARITY_MATRIX: readonly CliTuiParityRow[] = [
  { stage: "Build", cli: "fulcrum runs feed --watch", tui: ":runs (auto-tail on)", route: ":runs", keyPath: [":", "runs"] },
  { stage: "Build", cli: "fulcrum runs feed --json (JSONL)", tui: "TUI subscribes to same JSONL stream", route: ":runs", keyPath: [":", "runs"] },
  { stage: "Build", cli: "fulcrum run view <id> --watch", tui: ":run / :run/<id>", route: ":run/<id>", keyPath: [":", "run", "<id>"] },
  { stage: "Build", cli: "fulcrum runs tail <id>", tui: "log pane inside :run/<id>", route: ":run/<id>", keyPath: [":", "run", "<id>", "log pane"] },
  { stage: "Build", cli: "fulcrum task list --filter status=open", tui: ":list with filter prefilled", route: ":list", keyPath: [":", "list", "/", "status=open"] },
  { stage: "Build", cli: "fulcrum task list --view board", tui: ":board", route: ":board", keyPath: [":", "board"] },
  { stage: "Build", cli: "fulcrum task list --view timeline", tui: ":timeline", route: ":timeline", keyPath: [":", "timeline"] },
  { stage: "Build", cli: "fulcrum task list --view graph", tui: ":graph", route: ":graph", keyPath: [":", "graph"] },
  { stage: "Build", cli: "fulcrum task list --sort <field>:<asc|desc>", tui: ":list s opens sort menu; field/direction shown in header", route: ":list", keyPath: [":", "list", "s"] },
  { stage: "Operate", cli: "fulcrum doctor --json", tui: ":doctor", route: ":doctor", keyPath: [":", "doctor"] },
  { stage: "Operate", cli: "fulcrum audit list --trace <id>", tui: ":audit with filter prefilled", route: ":audit", keyPath: [":", "audit", "/", "trace=<id>"] },
  { stage: "Operate", cli: "fulcrum trace show <id>", tui: ":trace/<id>", route: ":trace/<id>", keyPath: [":", "trace", "<id>"] },
  { stage: "System", cli: "fulcrum ai --step <id>", tui: ":ai scoped to current step (inline pane)", route: ":ai", keyPath: [":", "ai", "--step", "<id>"] },
  { stage: "System", cli: "fulcrum ai --thread <id>", tui: ":ai re-attached to thread", route: ":ai", keyPath: [":", "ai", "--thread", "<id>"] },
  { stage: "Capture", cli: "fulcrum doc edit <id>", tui: ":doc/<id> then e", route: ":doc/<id>", keyPath: [":", "doc", "<id>", "e"] },
  { stage: "System", cli: "fulcrum agent list", tui: ":agents", route: ":agents", keyPath: [":", "agents"] },
  { stage: "System", cli: "fulcrum agent add <id> --client <kind>", tui: ":agents -> a add", route: ":agents", keyPath: [":", "agents", "a"] },
  { stage: "System", cli: "fulcrum agent set-default <id> --action <kind>", tui: ":routes -> e edit", route: ":routes", keyPath: [":", "routes", "e"] },
  { stage: "System", cli: "fulcrum route list", tui: ":routes", route: ":routes", keyPath: [":", "routes"] },
  { stage: "System", cli: "fulcrum route set <kind> <agent>", tui: ":routes -> e edit", route: ":routes", keyPath: [":", "routes", "e"] },
  { stage: "Operate", cli: "fulcrum mcp list --agent <id>", tui: ":mcp with scope chip = <id>", route: ":mcp", keyPath: [":", "mcp", "scope=<id>"] },
  { stage: "Operate", cli: "fulcrum mcp enable <name> --agent <id>", tui: ":mcp -> toggle row", route: ":mcp", keyPath: [":", "mcp", "toggle"] },
  { stage: "Operate", cli: "fulcrum plugin list --agent <id>", tui: ":plugins with scope chip = <id>", route: ":plugins", keyPath: [":", "plugins", "scope=<id>"] },
  { stage: "Operate", cli: "fulcrum plugin update <name> --agent <id>", tui: ":plugins -> u update", route: ":plugins", keyPath: [":", "plugins", "u"] },
  { stage: "System", cli: "fulcrum settings", tui: ":settings", route: ":settings", keyPath: [":", "settings"] },
  { stage: "System", cli: "fulcrum profile switch <name>", tui: ":set profile <name> or :settings -> General", route: ":settings", keyPath: [":", "set", "profile", "<name>"] },
  { stage: "System", cli: "fulcrum workspace switch <name>", tui: ":set workspace <name>", route: ":settings", keyPath: [":", "set", "workspace", "<name>"] },
  { stage: "Ship", cli: "fulcrum ship list", tui: ":ship", route: ":ship", keyPath: [":", "ship"] },
  { stage: "Ship", cli: "fulcrum ship view <id>", tui: ":ship/<id> (top-anchored sheet)", route: ":ship/<id>", keyPath: [":", "ship", "<id>"] },
  { stage: "Review", cli: "fulcrum review list --tab awaiting", tui: ":review with tab=awaiting", route: ":review", keyPath: [":", "review", "tab=awaiting"] },
  { stage: "Operate", cli: "fulcrum doctor --probe <subsystem>", tui: ":doctor -> row probe", route: ":doctor", keyPath: [":", "doctor", "Enter"] },
  { stage: "Operate", cli: "fulcrum operate telemetry --tail", tui: ":telemetry", route: ":telemetry", keyPath: [":", "telemetry"] },
  { stage: "Operate", cli: "fulcrum operate alerts list", tui: ":alerts", route: ":alerts", keyPath: [":", "alerts"] },
] as const;

export function listCliTuiParityRows(): readonly CliTuiParityRow[] {
  return CLI_TUI_PARITY_MATRIX;
}

