import {
  createMcpToolDefinitions,
  listMcpToolVisibility,
  type FulcrumMcpRuntime
} from "@fulcrum/mcp";

export function listMcpToolsCommand(runtime: FulcrumMcpRuntime) {
  return listMcpToolVisibility(createMcpToolDefinitions(runtime));
}
