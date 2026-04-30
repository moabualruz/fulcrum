import { BUILTIN_MCPS } from "../../cli/mcp-builtins.ts";
import {
  applyToAgents,
  loadRegistry,
  registerServer,
  removeFromAgents,
  setEnabled,
  unregisterServer,
  type AgentId,
} from "../../cli/mcp-registry.ts";
import type { ComponentAction } from "../types.ts";

export async function registerBuiltinMcpByName(
  name: string,
  opts: { enabled?: boolean; agents?: readonly AgentId[]; dryRun?: boolean } = {},
): Promise<void> {
  const entry = BUILTIN_MCPS.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`unknown builtin MCP: ${name}`);

  await registerServer(entry.name, entry.spec);
  if (opts.enabled !== undefined) {
    await setEnabled(entry.name, opts.enabled, mutableAgentOpts(opts.agents));
  }
  await applyToAgents(entry.name, { agents: opts.agents, dryRun: opts.dryRun });
}

export async function applyMcpAction(action: ComponentAction, dryRun = false): Promise<void> {
  if (action.change === "noop" || action.change === "preserve") return;

  const name = mcpNameFromAction(action);
  const agents = action.agentId ? [action.agentId] as const : undefined;

  if (action.componentId === "mcp.registry" || name === "registry") {
    if (action.change === "remove" || action.change === "disable") {
      if (dryRun) {
        console.log("     [dry-run] would remove MCP registry entries from agents");
        return;
      }
      const registry = await loadRegistry();
      for (const serverName of Object.keys(registry.servers)) {
        await removeFromAgents(serverName);
        await unregisterServer(serverName);
      }
      return;
    }
    for (const entry of BUILTIN_MCPS) {
      await registerServer(entry.name, entry.spec);
    }
    return;
  }

  switch (action.change) {
    case "remove":
      await removeFromAgents(name, { agents, dryRun });
      return;
    case "disable":
      await setEnabled(name, false, mutableAgentOpts(agents));
      await removeFromAgents(name, { agents, dryRun });
      return;
    case "enable":
      await registerBuiltinMcpByName(name, { enabled: true, agents, dryRun });
      return;
    case "create-or-update":
      await registerBuiltinMcpByName(name, { agents, dryRun });
      return;
  }
}

function mcpNameFromAction(action: ComponentAction): string {
  const payloadName = action.payload?.["name"];
  if (typeof payloadName === "string" && payloadName.length > 0) return payloadName;
  return action.componentId.startsWith("mcp.") ? action.componentId.slice("mcp.".length) : action.componentId;
}

function mutableAgentOpts(agents: readonly AgentId[] | undefined): { agents?: AgentId[] } {
  return agents ? { agents: [...agents] } : {};
}
