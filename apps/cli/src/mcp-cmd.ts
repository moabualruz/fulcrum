// fulcrum mcp — MCP registry CLI.
//
// Subcommands:
//   fulcrum mcp list [--json]
//   fulcrum mcp register <name> [--http URL | --stdio CMD] [--vendor V] [--description D] [--auth-env VAR ...]
//   fulcrum mcp unregister <name>
//   fulcrum mcp enable <name> [--agent <id> ...] [--all-agents]
//   fulcrum mcp disable <name> [--agent <id> ...] [--all-agents]

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

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function cmdList(args: string[]): Promise<void> {
  const asJson = args.includes("--json");
  const reg = await loadRegistry();
  const servers = Object.values(reg.servers);

  if (asJson) {
    const out = servers.map((s) => ({
      name: s.name,
      transport: s.transport,
      vendor: s.vendor,
      default_enabled: s.default_enabled,
      agent_state: Object.fromEntries(
        ALL_AGENT_IDS.map((id) => [
          id,
          !s.agent_visibility[id] ? "hidden" : isEnabled(s, id) ? "enabled" : "disabled",
        ])
      ),
      disabled_config: Object.fromEntries(
        ALL_AGENT_IDS.map((id) => [id, disabledConfigSupport(s, id)]),
      ),
    }));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (servers.length === 0) {
    console.log("No MCP servers registered. Run: fulcrum mcp register <name> ...");
    return;
  }

  console.log("Managed MCPs:\n");
  for (const s of servers) {
    const transport = s.transport === "http" ? `http  ${s.url ?? ""}` : `stdio ${s.command ?? ""}`;
    console.log(`  ${pad(s.name, 16)}  ${s.vendor}  [${transport}]`);
    console.log(`    ${s.description}`);
    for (const id of ALL_AGENT_IDS) {
      const enabled = isEnabled(s, id);
      const vis = s.agent_visibility[id];
      const state = !vis ? "hidden" : enabled ? "enabled" : "disabled";
      const disabledConfig = !enabled && vis ? `  ${disabledConfigSupport(s, id)}` : "";
      console.log(`    ${pad(id, 14)}  ${state}${disabledConfig}`);
    }
    console.log();
  }
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
  const visibility: McpServerVisibility = {
    "claude-code": true, codex: true, gemini: true, opencode: true, pi: true,
  };

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
    } else {
      console.error(`fulcrum mcp register: unknown arg '${a}'`);
      process.exit(2);
    }
    i++;
  }

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

async function visibleAgentList(name: string, target: AgentId[] | "all"): Promise<AgentId[]> {
  const reg = await loadRegistry();
  const server = reg.servers[name] as McpServer | undefined;
  if (!server) {
    console.error(`fulcrum mcp: server '${name}' not registered`);
    process.exit(2);
  }
  const requested = target === "all" ? [...ALL_AGENT_IDS] : target;
  const visible = requested.filter((id) => server.agent_visibility[id]);
  const hidden = requested.filter((id) => !server.agent_visibility[id]);
  if (hidden.length > 0) {
    console.log(`· ${name}: skip plugin/extension-owned or unsupported agent(s): ${hidden.join(", ")}`);
  }
  if (visible.length === 0) {
    console.error(`fulcrum mcp: '${name}' has no registry-owned target agents in this request`);
    process.exit(2);
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

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "list";
  switch (sub) {
    case "list":        return cmdList(args.slice(1));
    case "register":    return cmdRegister(args.slice(1));
    case "unregister":  return cmdUnregister(args.slice(1));
    case "enable":      return cmdEnable(args.slice(1));
    case "disable":     return cmdDisable(args.slice(1));
    default:
      console.error(`fulcrum mcp: unknown subcommand '${sub}'`);
      console.error("Available: list, register, unregister, enable, disable");
      process.exit(2);
  }
}
