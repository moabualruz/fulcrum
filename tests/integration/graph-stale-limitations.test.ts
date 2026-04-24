import { describe, expect, it } from "vitest";
import {
  GraphLinkService,
  TraceabilityQueryService,
  type GraphLinkRepositoryPort
} from "@fulcrum/core";
import type { GraphLink, GraphNodeType } from "@fulcrum/shared";

class MemoryGraphRepository implements GraphLinkRepositoryPort {
  links: GraphLink[] = [];
  save(link: GraphLink): GraphLink {
    this.links = [link, ...this.links.filter((item) => item.graphLinkId !== link.graphLinkId)];
    return link;
  }
  list(projectId?: string): GraphLink[] {
    return this.links.filter((link) => !projectId || link.projectId === projectId);
  }
  listForNode(type: GraphNodeType, id: string): GraphLink[] {
    return this.links.filter(
      (link) =>
        (link.sourceType === type && link.sourceId === id) ||
        (link.targetType === type && link.targetId === id)
    );
  }
  replaceDerived(_projectId: string, links: GraphLink[]): GraphLink[] {
    this.links = links;
    return links;
  }
}

describe("graph stale limitations", () => {
  it("shows stale evidence limitations when requested", () => {
    const repository = new MemoryGraphRepository();
    const graph = new GraphLinkService(repository);
    const traceability = new TraceabilityQueryService(repository);
    graph.link({
      projectId: "proj_01",
      sourceType: "code",
      sourceId: "evid_01",
      targetType: "task",
      targetId: "task_01",
      relation: "affected",
      sourceRef: { type: "file", uri: "src/old.ts" },
      targetRef: { type: "task", uri: "fulcrum://tasks/task_01" },
      reason: "Old file matched task.",
      freshness: "stale",
      limitation: "Code evidence source is stale.",
      derived: false,
      redactionStatus: "not_applicable"
    });

    expect(traceability.trace({ type: "task", id: "task_01" }).links).toHaveLength(0);
    const withStale = traceability.trace({ type: "task", id: "task_01", includeStale: true });
    expect(withStale.links).toHaveLength(1);
    expect(withStale.limitations[0]?.message).toContain("stale");
  });
});
