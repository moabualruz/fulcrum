// fulcrum mcp: MCP registry CLI.
//
// Subcommands:
//   fulcrum mcp list [--json]
//   fulcrum mcp register <name> [--http URL | --stdio CMD] [--vendor V] [--description D] [--auth-env VAR ...]
//   fulcrum mcp unregister <name>
//   fulcrum mcp enable <name> [--agent <id> ...] [--all-agents]
//   fulcrum mcp disable <name> [--agent <id> ...] [--all-agents]
//   fulcrum mcp test <name> [--agent <id>]
//   fulcrum mcp reload <name> [--agent <id> ...] [--all-agents]

import {
  ALL_AGENT_IDS,
  type AgentId,
  applyDisabledToAgents,
  applyToAgents,
  disabledConfigSupport,
  isEnabled,
  type McpServer,
  loadRegistry,
  type McpServerSpec,
  type McpServerVisibility,
  registerServer,
  removeFromAgents,
  setEnabled,
  unregisterServer,
} from "./mcp-registry.ts";
import { emitErrorResult, emitResult } from "./lib/cli-output.ts";

const HELP = `fulcrum mcp <list|register|unregister|enable|disable|test|reload> [options]

  fulcrum mcp list             List MCP servers [--json] [--agent <id>]
  fulcrum mcp register <name>  Register an MCP server
                               [--http <url>|--stdio <cmd>] [--vendor <v>]
                               [--agent <id> ...] [--all-agents]
  fulcrum mcp unregister <name>
                               Remove an MCP server
                               [--agent <id> ...] [--all-agents]
  fulcrum mcp enable <name>    Enable a server for agents
                               [--agent <id> ...] [--all-agents]
  fulcrum mcp disable <name>   Disable a server for agents
                               [--agent <id> ...] [--all-agents]
  fulcrum mcp test <name>      Inspect server config for one agent [--agent <id>]
  fulcrum mcp reload <name>    Reapply registry config to agent surfaces
                               [--agent <id> ...] [--all-agents]

Options:
  --json                       Canonical fulcrum.cli.v1 JSON envelope
`;

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function cmdList(args: string[]): Promise<void> {
  const agentFilter = optionValue(args, "--agent");
  if (agentFilter && !ALL_AGENT_IDS.includes(agentFilter as AgentId)) {
    console.error(`fulcrum mcp list: unknown agent id '${agentFilter}'. Valid: ${ALL_AGENT_IDS.join(", ")}`);
    process.exit(2);
  }
  const agentIds = agentFilter ? [agentFilter as AgentId] : ALL_AGENT_IDS;
  const reg = await loadRegistry();
  const servers = Object.values(reg.servers);

  const out = servers.map((s) => ({
    name: s.name,
    transport: s.transport,
    vendor: s.vendor,
    default_enabled: s.default_enabled,
    agent_state: Object.fromEntries(
      agentIds.map((id) => [
        id,
        !s.agent_visibility[id] ? "hidden" : isEnabled(s, id) ? "enabled" : "disabled",
      ])
    ),
    disabled_config: Object.fromEntries(
      agentIds.map((id) => [id, disabledConfigSupport(s, id)]),
    ),
    description: s.description,
    url: s.url,
    command_line: s.command,
    agent_visibility: s.agent_visibility,
  }));
  emitResult(
    {
      argv: args,
      command: "fulcrum mcp list",
      result: out,
      args: { subcommand: "list", agent: agentFilter ?? null },
      renderHuman: (value) => {
        if (value.length === 0) {
          console.log("No MCP servers registered. Run: fulcrum mcp register <name> ...");
          return;
        }

        console.log("Managed MCPs:\n");
        for (const s of value) {
          const transport = s.transport === "http" ? `http  ${s.url ?? ""}` : `stdio ${s.command_line ?? ""}`;
          console.log(`  ${pad(s.name, 16)}  ${s.vendor}  [${transport}]`);
          console.log(`    ${s.description}`);
          for (const id of agentIds) {
            const state = s.agent_state[id];
            const visible = s.agent_visibility[id];
            const disabledConfig = state === "disabled" && visible ? `  ${s.disabled_config[id]}` : "";
            console.log(`    ${pad(id, 14)}  ${state}${disabledConfig}`);
          }
          console.log();
        }
      },
    },
    { print: console.log, printErr: console.error },
  );
}

async function cmdRegister(args: string[]): Promise<void> {
  const name = args[0];
  if (!name || name.startsWith("--")) {
    console.error("usage: fulcrum mcp register <name> [--http URL | --stdio CMD] ...");
    process.exit(2);
  }

  let transport: "http" | "stdio" = "http";
  let url: string | undefined;
  let command: string | undefined;
  let vendor = "unknown";
  let description = "";
  const authEnvVars: string[] = [];
  let targetAgents: AgentId[] | "all" = "all";

  let i = 1;
  while (i < args.length) {
    const a = args[i]!;
    if (a === "--http") {
      transport = "http";
      url = args[++i] ?? "";
    } else if (a === "--stdio") {
      transport = "stdio";
      command = args[++i] ?? "";
    } else if (a === "--vendor") {
      vendor = args[++i] ?? vendor;
    } else if (a === "--description") {
      description = args[++i] ?? description;
    } else if (a === "--auth-env") {
      authEnvVars.push(args[++i] ?? "");
    } else if (a === "--all-agents") {
      targetAgents = "all";
    } else if (a === "--agent") {
      const id = args[++i] as AgentId;
      if (!ALL_AGENT_IDS.includes(id)) {
        console.error(`fulcrum mcp register: unknown agent id '${id}'. Valid: ${ALL_AGENT_IDS.join(", ")}`);
        process.exit(2);
      }
      if (targetAgents === "all") targetAgents = [];
      targetAgents.push(id);
    } else {
      console.error(`fulcrum mcp register: unknown arg '${a}'`);
      process.exit(2);
    }
    i++;
  }

  const visibility: McpServerVisibility = {
    "claude-code": targetAgents === "all" || targetAgents.includes("claude-code"),
    codex: targetAgents === "all" || targetAgents.includes("codex"),
    gemini: targetAgents === "all" || targetAgents.includes("gemini"),
    opencode: targetAgents === "all" || targetAgents.includes("opencode"),
    pi: targetAgents === "all" || targetAgents.includes("pi"),
  };

  if (transport === "http" && !url) {
    console.error("fulcrum mcp register: --http requires a URL");
    process.exit(2);
  }
  if (transport === "stdio" && !command) {
    console.error("fulcrum mcp register: --stdio requires a command");
    process.exit(2);
  }

  const spec: McpServerSpec = {
    transport,
    url,
    command,
    description,
    vendor,
    default_enabled: false,
    auth_env_vars: authEnvVars,
    agent_visibility: visibility,
  };

  await registerServer(name, spec);
  console.log(`✓ Registered MCP server '${name}' (${transport})`);
}

async function cmdUnregister(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("usage: fulcrum mcp unregister <name>");
    process.exit(2);
  }
  // Remove from all agents first.
  await removeFromAgents(name);
  await unregisterServer(name);
  console.log(`✓ Unregistered MCP server '${name}'`);
}

function parseAgentFlags(args: string[]): AgentId[] | "all" {
  const agents: AgentId[] = [];
  let allAgents = false;
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (a === "--all-agents") {
      allAgents = true;
    } else if (a === "--agent") {
      const id = args[++i] as AgentId;
      if (!ALL_AGENT_IDS.includes(id)) {
        console.error(`fulcrum mcp: unknown agent id '${id}'. Valid: ${ALL_AGENT_IDS.join(", ")}`);
        process.exit(2);
      }
      agents.push(id);
    }
    i++;
  }
  if (allAgents || agents.length === 0) return "all";
  return agents;
}

interface VisibleAgentListOptions {
  json: boolean;
  argv: readonly string[];
  command: string;
  args: Record<string, unknown>;
}

function emitMcpLookupError(
  options: VisibleAgentListOptions | undefined,
  error: { code: string; message: string; fix: string },
): never {
  if (options?.json) {
    emitErrorResult(
      {
        argv: options.argv,
        command: options.command,
        args: options.args,
        error,
        renderHuman: () => {},
      },
      { print: console.log, printErr: console.error },
    );
    process.exit(2);
  }
  console.error(error.message);
  process.exit(2);
}

async function visibleAgentList(
  name: string,
  target: AgentId[] | "all",
  options?: VisibleAgentListOptions,
): Promise<AgentId[]> {
  const reg = await loadRegistry();
  const server = reg.servers[name] as McpServer | undefined;
  if (!server) {
    emitMcpLookupError(options, {
      code: "FUL_MCP_SERVER_NOT_FOUND",
      message: `fulcrum mcp: server '${name}' not registered`,
      fix: "Run `fulcrum mcp list --json` to inspect registered MCP servers, then retry with a listed name.",
    });
  }
  const requested = target === "all" ? [...ALL_AGENT_IDS] : target;
  const visible = requested.filter((id) => server.agent_visibility[id]);
  const hidden = requested.filter((id) => !server.agent_visibility[id]);
  if (hidden.length > 0 && !options?.json) {
    console.log(`· ${name}: skip plugin/extension-owned or unsupported agent(s): ${hidden.join(", ")}`);
  }
  if (visible.length === 0) {
    emitMcpLookupError(options, {
      code: "FUL_MCP_NO_VISIBLE_AGENTS",
      message: `fulcrum mcp: '${name}' has no registry-owned target agents in this request`,
      fix: "Retry with `--all-agents` or an agent listed as visible by `fulcrum mcp list --json`.",
    });
  }
  return visible;
}

async function cmdEnable(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("usage: fulcrum mcp enable <name> [--agent <id> ...] [--all-agents]");
    process.exit(2);
  }
  const target = parseAgentFlags(args.slice(1));
  const agentList = await visibleAgentList(name, target);
  await setEnabled(name, true, { agents: agentList });
  await applyToAgents(name, { agents: agentList });
  console.log(`✓ Enabled MCP server '${name}' for: ${agentList.join(", ")}`);
}

async function cmdDisable(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("usage: fulcrum mcp disable <name> [--agent <id> ...] [--all-agents]");
    process.exit(2);
  }
  const target = parseAgentFlags(args.slice(1));
  const agentList = await visibleAgentList(name, target);
  await setEnabled(name, false, { agents: agentList });
  await applyDisabledToAgents(name, { agents: agentList });
  console.log(`✓ Disabled MCP server '${name}' for: ${agentList.join(", ")}`);
}

async function cmdTest(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("usage: fulcrum mcp test <name> [--agent <id>]");
    process.exit(2);
  }
  const target = parseAgentFlags(args.slice(1));
  const agentList = await visibleAgentList(name, target, {
    json: args.includes("--json"),
    argv: args,
    command: "fulcrum mcp test",
    args: { subcommand: "test", name },
  });
  const reg = await loadRegistry();
  const server = reg.servers[name]!;
  const checks = agentList.map((agent) => ({
    agent,
    visible: server.agent_visibility[agent],
    enabled: isEnabled(server, agent),
    disabled_config: disabledConfigSupport(server, agent),
  }));
  const result = {
    name,
    transport: server.transport,
    vendor: server.vendor,
    status: "configured",
    agent: agentList.length === 1 ? agentList[0] : null,
    agents: agentList,
    checks,
    testedAt: new Date().toISOString(),
  };
  emitResult(
    {
      argv: args,
      command: "fulcrum mcp test",
      args: { subcommand: "test", name, agents: agentList },
      result,
      renderHuman: (value) => {
        console.log(`${value.name}: ${value.status}`);
        for (const check of value.checks) {
          console.log(`  ${check.agent}: ${check.enabled ? "enabled" : "disabled"} (${check.disabled_config})`);
        }
      },
    },
    { print: console.log, printErr: console.error },
  );
}

async function cmdReload(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("usage: fulcrum mcp reload <name> [--agent <id> ...] [--all-agents]");
    process.exit(2);
  }
  const asJson = args.includes("--json");
  const target = parseAgentFlags(args.slice(1));
  const agentList = await visibleAgentList(name, target, {
    json: asJson,
    argv: args,
    command: "fulcrum mcp reload",
    args: { subcommand: "reload", name },
  });
  if (asJson) {
    const messages = await captureConsoleLog(async () => {
      await applyToAgents(name, { agents: agentList });
    });
    emitResult(
      {
        argv: args,
        command: "fulcrum mcp reload",
        args: { subcommand: "reload", name, agents: agentList },
        result: { name, reloaded: true, agents: agentList, messages },
        renderHuman: () => {},
      },
      { print: console.log, printErr: console.error },
    );
    return;
  }
  await applyToAgents(name, { agents: agentList });
  console.log(`✓ Reloaded MCP server '${name}' for: ${agentList.join(", ")}`);
}

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "list";
  switch (sub) {
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    case "list":        return cmdList(args.slice(1));
    case "register":    return cmdRegister(args.slice(1));
    case "unregister":  return cmdUnregister(args.slice(1));
    case "enable":      return cmdEnable(args.slice(1));
    case "disable":     return cmdDisable(args.slice(1));
    case "test":        return cmdTest(args.slice(1));
    case "reload":      return cmdReload(args.slice(1));
    default:
      if (args.includes("--json")) {
        emitErrorResult(
          {
            argv: args,
            command: `fulcrum mcp ${sub}`,
            args: { subcommand: sub },
            error: {
              code: "FUL_MCP_UNKNOWN_SUBCOMMAND",
              message: `fulcrum mcp: unknown subcommand '${sub}'`,
              fix: "Run `fulcrum mcp list --json` or `fulcrum mcp --help`.",
            },
            renderHuman: () => {},
          },
          { print: console.log, printErr: console.error },
        );
        process.exit(2);
      }
      console.error(`fulcrum mcp: unknown subcommand '${sub}'`);
      console.error("Available: list, register, unregister, enable, disable, test, reload");
      process.exit(2);
  }
}

function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

async function captureConsoleLog(action: () => Promise<void>): Promise<string[]> {
  const originalLog = console.log;
  const messages: string[] = [];
  console.log = (...parts: unknown[]) => {
    messages.push(parts.map(String).join(" "));
  };
  try {
    await action();
  } finally {
    console.log = originalLog;
  }
  return messages;
}
