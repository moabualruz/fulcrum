import type { GraphLink, GraphNodeType } from "@fulcrum/shared";
import type { GraphLinkRepositoryPort } from "./service.js";

export interface TraceabilityQuery {
  type: GraphNodeType;
  id: string;
  depth?: number;
  includeStale?: boolean;
}

export interface TraceabilityResult {
  root: { type: GraphNodeType; id: string };
  links: GraphLink[];
  limitations: Array<{ graphLinkId: string; message: string }>;
  affected: Record<string, string[]>;
}

export class TraceabilityQueryService {
  constructor(private readonly repository: GraphLinkRepositoryPort) {}

  trace(input: TraceabilityQuery): TraceabilityResult {
    const maxDepth = Math.max(1, Math.min(input.depth ?? 2, 4));
    const visitedNodes = new Set<string>();
    const collected = new Map<string, GraphLink>();
    const queue: Array<{ type: GraphNodeType; id: string; depth: number }> = [
      { type: input.type, id: input.id, depth: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const nodeKey = key(current.type, current.id);
      if (visitedNodes.has(nodeKey) || current.depth >= maxDepth) continue;
      visitedNodes.add(nodeKey);

      for (const link of this.repository.listForNode(current.type, current.id)) {
        if (!input.includeStale && link.freshness === "stale") continue;
        collected.set(link.graphLinkId, link);
        const next =
          link.sourceType === current.type && link.sourceId === current.id
            ? { type: link.targetType, id: link.targetId }
            : { type: link.sourceType, id: link.sourceId };
        queue.push({ ...next, depth: current.depth + 1 });
      }
    }

    const links = [...collected.values()];
    return {
      root: { type: input.type, id: input.id },
      links,
      limitations: links
        .filter((link) => link.limitation || link.freshness === "stale")
        .map((link) => ({
          graphLinkId: link.graphLinkId,
          message: link.limitation ?? "Linked evidence is stale."
        })),
      affected: groupAffected(links)
    };
  }
}

function key(type: GraphNodeType, id: string): string {
  return `${type}:${id}`;
}

function groupAffected(links: GraphLink[]): Record<string, string[]> {
  const affected: Record<string, Set<string>> = {};
  for (const link of links) {
    const source = (affected[link.sourceType] ??= new Set<string>());
    source.add(link.sourceId);
    const target = (affected[link.targetType] ??= new Set<string>());
    target.add(link.targetId);
  }
  return Object.fromEntries(Object.entries(affected).map(([type, ids]) => [type, [...ids].sort()]));
}
