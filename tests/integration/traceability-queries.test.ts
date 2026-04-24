import { describe, expect, it } from "vitest";
import {
  GraphLinkService,
  TraceabilityQueryService,
  type GraphLinkRepositoryPort
} from "@fulcrum/core";
import type { GraphLink, GraphNodeType } from "@fulcrum/shared";

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

describe("traceability queries", () => {
  it("answers why task work happened and what it affected", () => {
    const repository = new MemoryGraphRepository();
    const graph = new GraphLinkService(repository);
    const traceability = new TraceabilityQueryService(repository);

    graph.link({
      projectId: "proj_01",
      sourceType: "memory",
      sourceId: "mem_01",
      targetType: "task",
      targetId: "task_01",
      relation: "references",
      sourceRef: { type: "memory", uri: "fulcrum://memory/mem_01" },
      targetRef: { type: "task", uri: "fulcrum://tasks/task_01" },
      reason: "Memory explains task intent.",
      freshness: "fresh",
      derived: false,
      redactionStatus: "not_applicable"
    });
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

    const result = traceability.trace({ type: "task", id: "task_01" });

    expect(result.links).toHaveLength(2);
    expect(result.affected.memory).toContain("mem_01");
    expect(result.affected.run).toContain("run_01");
  });
});
