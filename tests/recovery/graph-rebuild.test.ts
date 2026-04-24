import { describe, expect, it } from "vitest";
import { rebuildGraphLinks } from "@fulcrum/core";

const now = new Date(0).toISOString();

describe("graph projection rebuild", () => {
  it("rebuilds derived links from canonical records", () => {
    const links = rebuildGraphLinks("proj_01", {
      tasks: [
        {
          taskId: "task_01",
          projectId: "proj_01",
          title: "Trace work",
          status: "todo",
          priority: "normal",
          labels: [],
          createdAt: now,
          updatedAt: now,
          schemaVersion: "1.0"
        }
      ],
      memories: [
        {
          memoryId: "mem_01",
          projectId: "proj_01",
          status: "active",
          title: "Decision note",
          bodyRef: "file:///notes.md",
          sourceRefs: [{ type: "file", uri: "file:///notes.md" }],
          linkedTaskIds: ["task_01"],
          linkedRunIds: [],
          linkedFileRefs: [],
          linkedSymbolRefs: [],
          linkedArtifactIds: [],
          backend: "markdown",
          freshness: "fresh",
          exportStatus: "not_exported",
          redactionStatus: "not_applicable",
          createdAt: now,
          updatedAt: now,
          schemaVersion: "1.0"
        }
      ],
      runs: [
        {
          runId: "run_01",
          taskId: "task_01",
          projectId: "proj_01",
          agentId: "agent_validation",
          commandIdentity: "validation",
          status: "completed",
          heartbeatState: "fresh",
          logArtifactIds: [],
          artifactIds: ["art_01"],
          qualityGateIds: [],
          policyDecisionIds: ["pol_01"],
          redactionStatus: "not_applicable",
          createdAt: now,
          updatedAt: now,
          schemaVersion: "1.0"
        }
      ]
    });

    expect(links.map((link) => link.relation)).toEqual(
      expect.arrayContaining(["depends_on", "references", "affected", "produced", "governed_by"])
    );
    expect(links.every((link) => link.derived)).toBe(true);
  });
});
