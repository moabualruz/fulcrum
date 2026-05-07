import { ALL_AGENT_IDS, type AgentId } from "@fulcrum/cli/mcp-registry.ts";
import { expandProfile, getComponent } from "./catalog.ts";
import type { ComponentAction, ComponentPlan, ComponentSpec, Operation, SurfaceSpec } from "./types.ts";

export interface PlanInput {
  operation: Exclude<Operation, "status">;
  target: string;
  agents?: readonly AgentId[];
  exclude?: readonly string[];
}

export function planComponentOperation(input: PlanInput): ComponentPlan {
  const targetComponent = getComponent(input.target);
  if (targetComponent === null) {
    throw new Error(`unknown component: ${input.target}`);
  }

  const requestedAgents = input.agents && input.agents.length > 0 ? [...input.agents] : [...ALL_AGENT_IDS];
  const excluded = new Set(input.exclude ?? []);
  const components =
    (targetComponent.kind === "profile" ? expandProfile(targetComponent.id) : [targetComponent])
      .filter((component) => !excluded.has(component.id));
  const warnings = new Set<string>();

  const actions = components.flatMap((component) =>
    component.surfaces.flatMap((surface) =>
      surfaceAgents(surface, requestedAgents).map((agentId) => {
        const change = actionChange(input.operation, surface);
        if (change === "noop" && (input.operation === "enable" || input.operation === "disable")) {
          warnings.add(`${component.id} does not support ${input.operation}`);
        }
        return componentAction(component, surface, input.operation, change, agentId);
      }),
    ),
  );

  return {
    operation: input.operation,
    target: input.target,
    profile: targetComponent.kind === "profile" ? targetComponent.id : null,
    agents: requestedAgents,
    actions,
    warnings: [...warnings],
  };
}

function componentAction(
  component: ComponentSpec,
  surface: SurfaceSpec,
  operation: Exclude<Operation, "status">,
  change: ComponentAction["change"],
  agentId: AgentId | undefined,
): ComponentAction {
  return {
    id: `${surface.id}:${agentId ?? "global"}:${operation}`,
    componentId: component.id,
    surfaceId: surface.id,
    ...(agentId === undefined ? {} : { agentId }),
    operation,
    kind: surface.kind,
    target: surface.target,
    change,
    risk: surface.kind === "vendor-command" ? "external-command" : "managed",
    reason: `${operation} ${component.id} via ${surface.kind}`,
    ...(surface.payload === undefined ? {} : { payload: { ...surface.payload } }),
  };
}

function actionChange(
  operation: Exclude<Operation, "status">,
  surface: SurfaceSpec,
): ComponentAction["change"] {
  switch (operation) {
    case "install":
      return "create-or-update";
    case "remove":
      return "remove";
    case "enable":
    case "disable":
      return surface.supportsDisable === true ? operation : "noop";
  }
}

function surfaceAgents(
  surface: SurfaceSpec,
  requestedAgents: readonly AgentId[],
): Array<AgentId | undefined> {
  if (surface.agents !== undefined) {
    return requestedAgents.filter((agentId) => surface.agents?.includes(agentId));
  }
  if (isAgentScopedSurface(surface)) {
    return [...requestedAgents];
  }
  return [undefined];
}

function isAgentScopedSurface(surface: SurfaceSpec): boolean {
  return (
    surface.kind === "sentinel-block" ||
    surface.target.startsWith("agent-") ||
    surface.target.startsWith("mcp:") ||
    surface.target.startsWith("hook:")
  );
}
