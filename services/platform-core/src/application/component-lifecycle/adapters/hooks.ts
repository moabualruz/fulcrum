import { disableHookRecipe, enableHookRecipe, isRecipeName } from "@fulcrum/cli/hooks.ts";
import type { AgentId } from "@fulcrum/cli/mcp-registry.ts";
import type { ComponentAction } from "../types.ts";

export async function applyHookAction(action: ComponentAction): Promise<void> {
  if (action.kind !== "hook-registration") {
    throw new Error(`unsupported hook action kind: ${action.kind}`);
  }

  if (action.change === "noop" || action.change === "preserve") {
    return;
  }

  const recipe = action.payload?.["recipe"];
  if (typeof recipe !== "string") {
    throw new Error("hook action requires string payload.recipe");
  }
  if (!isRecipeName(recipe)) {
    throw new Error(`unknown hook recipe: ${recipe}`);
  }
  if (action.agentId === undefined) {
    throw new Error("hook action requires agentId");
  }

  const targetAgents = new Set<AgentId>([action.agentId]);
  switch (action.change) {
    case "create-or-update":
    case "enable":
      await enableHookRecipe(recipe, targetAgents);
      return;
    case "remove":
    case "disable":
      await disableHookRecipe(recipe, targetAgents);
      return;
    default:
      throw new Error(`unsupported hook action change: ${action.change}`);
  }
}
