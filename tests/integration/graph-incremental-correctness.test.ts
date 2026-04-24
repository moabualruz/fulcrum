import { describe, expect, it } from "vitest";
import {
  GraphLinkService,
  InvalidationService,
  MemoryInvalidationRepository,
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
  replaceDerived(projectId: string, links: GraphLink[]): GraphLink[] {
    this.links = [
      ...links,
      ...this.links.filter((link) => link.projectId !== projectId || !link.derived)
    ];
    return links;
  }
}

const now = new Date(0).toISOString();

describe("graph incremental correctness", () => {
  it("records fresh graph generation and marks prior projection stale on source change", () => {
    const invalidation = new InvalidationService(new MemoryInvalidationRepository());
    const graph = new GraphLinkService(new MemoryGraphRepository(), invalidation);

    graph.rebuild("proj_01", {
      tasks: [
        {
          taskId: "task_01",
          projectId: "proj_01",
          title: "Old title",
          status: "todo",
          priority: "normal",
          labels: [],
          createdAt: now,
          updatedAt: now,
          schemaVersion: "1.0"
        }
      ]
    });
    expect(invalidation.status("graph_projection")).toMatchObject({ fresh: 1, stale: 0 });

    invalidation.markMatchingStale({
      derivedKinds: ["graph_projection"],
      sourceUriIncludes: "task_01",
      reason: "Task renamed."
    });

    expect(invalidation.status("graph_projection")).toMatchObject({ fresh: 0, stale: 1 });
    expect(invalidation.status("graph_projection").staleRecords[0]?.staleReason).toBe(
      "Task renamed."
    );
  });
});
