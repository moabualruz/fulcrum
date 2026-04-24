import type { GraphLinkService, TraceabilityQueryService } from "@fulcrum/core";
import type { GraphLink, GraphNodeType } from "@fulcrum/shared";

export interface GraphCommandDeps {
  graph: GraphLinkService;
  traceability: TraceabilityQueryService;
  rebuildSources: (projectId: string) => Parameters<GraphLinkService["rebuild"]>[1];
}

export function linkGraphCommand(
  deps: GraphCommandDeps,
  input: Omit<GraphLink, "graphLinkId" | "createdAt" | "updatedAt" | "schemaVersion">
): GraphLink {
  return deps.graph.link(input);
}

export function traceGraphCommand(
  deps: GraphCommandDeps,
  input: { type: string; id: string; depth?: number; includeStale?: boolean }
) {
  return deps.traceability.trace({ ...input, type: input.type as GraphNodeType });
}

export function rebuildGraphCommand(deps: GraphCommandDeps, projectId: string): GraphLink[] {
  return deps.graph.rebuild(projectId, deps.rebuildSources(projectId));
}
