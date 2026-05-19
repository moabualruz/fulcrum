export interface OperatePluginsOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  loadPlugins?: () => Promise<readonly ClaudePluginMarker[]>;
}

export interface ClaudePluginMarker {
  id: string;
  name: string;
  enabled: boolean;
  source: "claude" | "fulcrum" | "user";
  marker: string;
}

const HELP = `fulcrum operate plugins

Usage:
  fulcrum operate plugins list [--json]
  fulcrum operate plugins show <id> [--json]
`;

export async function run(argv: readonly string[], opts: OperatePluginsOptions = {}): Promise<void> {
  const print = opts.print ?? console.log;
  const printErr = opts.printErr ?? console.error;
  const exit = opts.exit ?? process.exit;
  const [verb = "help", ...rest] = argv;

  if (verb === "help" || verb === "--help" || verb === "-h") {
    print(HELP);
    return;
  }

  if (verb === "list") {
    const plugins = await loadOrFail({ printErr, exit, ...opts });
    if (!plugins) return;
    if (rest.includes("--json")) {
      print(JSON.stringify(plugins));
      return;
    }
    if (plugins.length === 0) {
      print("No Claude plugin markers found.");
      return;
    }
    for (const plugin of plugins) {
      const enabledIcon = plugin.enabled ? "✓" : "○";
      print(`${enabledIcon} ${plugin.id} (${plugin.source})  ${plugin.name}  ${plugin.marker}`);
    }
    return;
  }

  if (verb === "show") {
    const id = rest.find((arg) => !arg.startsWith("--"));
    if (!id) {
      printErr("fulcrum operate plugins show: missing required argument <id>");
      exit(2);
      return;
    }
    const plugins = await loadOrFail({ printErr, exit, ...opts });
    if (!plugins) return;
    const target = plugins.find((plugin) => plugin.id === id);
    if (!target) {
      printErr(`fulcrum operate plugins show: unknown plugin id '${id}'`);
      exit(1);
      return;
    }
    if (rest.includes("--json")) {
      print(JSON.stringify(target));
      return;
    }
    print(`${target.id} ${target.enabled ? "enabled" : "disabled"} via ${target.source}`);
    print(`  marker: ${target.marker}`);
    return;
  }

  printErr(`fulcrum operate plugins: unknown command '${verb}'`);
  printErr(HELP);
  exit(2);
}

async function loadOrFail(opts: Required<Pick<OperatePluginsOptions, "printErr" | "exit">> & OperatePluginsOptions): Promise<readonly ClaudePluginMarker[] | null> {
  if (!opts.loadPlugins) {
    opts.printErr("fulcrum operate plugins: plugin marker loader is not configured.");
    opts.exit(1);
    return null;
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
