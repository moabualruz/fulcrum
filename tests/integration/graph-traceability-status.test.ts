import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  GraphLinkService,
  InvalidationService,
  MemoryInvalidationRepository,
  TraceabilityQueryService,
  type GraphLinkRepositoryPort
} from "@fulcrum/core";
import type { GraphLink, GraphNodeType } from "@fulcrum/shared";
import { registerGraphRoutes } from "../../apps/server/src/routes/graph.js";

class MemoryGraphRepository implements GraphLinkRepositoryPort {
  links = new Map<string, GraphLink>();

  save(link: GraphLink): GraphLink {
    this.links.set(link.graphLinkId, link);
    return link;
  }

  list(projectId?: string): GraphLink[] {
    return [...this.links.values()].filter((link) => !projectId || link.projectId === projectId);
  }

  listForNode(type: GraphNodeType, id: string): GraphLink[] {
    return [...this.links.values()].filter(
      (link) =>
        (link.sourceType === type && link.sourceId === id) ||
        (link.targetType === type && link.targetId === id)
    );
  }

  replaceDerived(projectId: string, links: GraphLink[]): GraphLink[] {
    this.links = new Map(
      [...this.links.values()]
        .filter((link) => link.projectId !== projectId || !link.derived)
        .map((link) => [link.graphLinkId, link])
    );
    for (const link of links) this.save(link);
    return links;
  }
}

describe("graph traceability status", () => {
  it("returns invalidation status alongside traceability data for cockpit", async () => {
    const repository = new MemoryGraphRepository();
    const invalidation = new InvalidationService(new MemoryInvalidationRepository());
    const graph = new GraphLinkService(repository, invalidation);
    const traceability = new TraceabilityQueryService(repository);
    graph.link({
      projectId: "proj_01",
      sourceType: "run",
      sourceId: "run_01",
      targetType: "task",
      targetId: "task_01",
      relation: "affected",
      sourceRef: { type: "run", uri: "fulcrum://runs/run_01" },
      targetRef: { type: "task", uri: "fulcrum://tasks/task_01" },
      reason: "Run executed task.",
      freshness: "fresh",
      derived: false,
      redactionStatus: "not_applicable"
    });
    invalidation.recordGenerated({
      derivedKind: "graph_projection",
      rebuildSource: "graph:proj_01"
    });

    const app = new Hono();
    registerGraphRoutes(app, graph, traceability, () => ({ tasks: [] }), invalidation);

    const response = await app.request("/api/v1/graph/trace?type=task&id=task_01");
    const payload = (await response.json()) as {
      data: {
        links: GraphLink[];
        invalidationStatus: { total: number; fresh: number; stale: number; nextAction: string };
      };
    };

    expect(payload.data.links).toHaveLength(1);
    expect(payload.data.invalidationStatus).toMatchObject({
      total: 1,
      fresh: 1,
      stale: 0
    });
  });
});
