import { describe, expect, test } from "bun:test";

import { relationshipIncludeSchema, relationshipSummarySchema, summarizeRelationships } from "./summary.ts";

describe("Phase 09.6 relationship summary service", () => {
  test("defaults to counts and IDs, not full graph embedding", () => {
    const summary = summarizeRelationships({
      entity: { kind: "work_item", id: "task-1" },
      trace: {
        workspace: { kind: "workspace", id: "workspace-1" },
        project: { kind: "project", id: "project-1" },
        workItem: { kind: "work_item", id: "task-1" },
      },
      refs: [
        { kind: "doc", id: "doc-1" },
        { kind: "run", id: "run-1" },
        { kind: "artifact", id: "artifact-1" },
      ],
    });

    expect(summary.counts).toMatchObject({ docs: 1, runs: 1, artifacts: 1 });
    expect(summary.ids.docs).toEqual(["doc-1"]);
    expect(summary.included).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain("nodes");
  });

  test("include expands only selected relationship buckets", () => {
    const summary = summarizeRelationships({
      entity: { kind: "project", id: "project-1" },
      trace: {
        workspace: { kind: "workspace", id: "workspace-1" },
        project: { kind: "project", id: "project-1" },
      },
      refs: [
        { kind: "doc", id: "doc-1" },
        { kind: "run", id: "run-1" },
      ],
      include: ["docs"],
    });

    expect(summary.included).toEqual(["docs"]);
    expect(summary.expanded?.docs).toEqual([{ kind: "doc", id: "doc-1" }]);
    expect(summary.expanded?.runs).toBeUndefined();
  });

  test("schemas reject unknown include values and orphan summaries", () => {
    expect(() => relationshipIncludeSchema.parse(["fullGraph"])).toThrow();
    expect(() => relationshipSummarySchema.parse({
      entity: { kind: "work_item", id: "task-1" },
      trace: { workspace: { kind: "workspace", id: "workspace-1" } },
      counts: {},
      ids: {},
      included: [],
    })).toThrow(/project/i);
  });
});
