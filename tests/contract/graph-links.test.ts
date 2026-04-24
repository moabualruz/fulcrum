import { describe, expect, it } from "vitest";
import { GraphLinkSchema } from "@fulcrum/shared";

describe("graph link contracts", () => {
  it("validates traceability link shape", () => {
    const link = GraphLinkSchema.parse({
      graphLinkId: "gl_task_memory",
      projectId: "proj_01",
      sourceType: "task",
      sourceId: "task_01",
      targetType: "memory",
      targetId: "mem_01",
      relation: "references",
      sourceRef: { type: "task", uri: "fulcrum://tasks/task_01" },
      targetRef: { type: "memory", uri: "fulcrum://memory/mem_01" },
      evidenceRef: { type: "file", uri: "file:///notes.md", lineStart: 1 },
      reason: "Task references memory note.",
      freshness: "fresh",
      confidence: 0.9,
      derived: false,
      redactionStatus: "not_applicable",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      schemaVersion: "1.0"
    });

    expect(link.sourceType).toBe("task");
    expect(link.targetType).toBe("memory");
    expect(link.evidenceRef?.lineStart).toBe(1);
  });
});
