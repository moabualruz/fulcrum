import { describe, expect, it } from "vitest";
import { MemoryEntrySchema, type MemoryEntry } from "@fulcrum/shared";

describe("memory entry contract", () => {
  it("requires local provenance and redaction status", () => {
    const now = new Date().toISOString();
    const entry = MemoryEntrySchema.parse({
      memoryId: "mem_contract",
      projectId: "proj_contract",
      status: "active",
      title: "README heading",
      bodyRef: "file:///tmp/NOTES.md",
      excerpt: "Remember README heading behavior.",
      sourceRefs: [{ type: "file", uri: "/tmp/NOTES.md", label: "NOTES.md", lineStart: 1 }],
      linkedTaskIds: ["task_contract"],
      linkedRunIds: ["run_contract"],
      linkedFileRefs: [{ type: "file", uri: "/tmp/README.md" }],
      linkedSymbolRefs: [],
      linkedArtifactIds: [],
      backend: "markdown",
      freshness: "fresh",
      exportStatus: "not_exported",
      redactionStatus: "not_redacted",
      createdAt: now,
      updatedAt: now,
      schemaVersion: "1.0"
    } satisfies MemoryEntry);

    expect(entry.memoryId).toMatch(/^mem_/);
    expect(entry.sourceRefs[0]?.uri).toBe("/tmp/NOTES.md");
    expect(entry.redactionStatus).toBe("not_redacted");
    expect(entry.freshness).toBe("fresh");
  });

  it("rejects entries without provenance", () => {
    const now = new Date().toISOString();
    expect(() =>
      MemoryEntrySchema.parse({
        memoryId: "mem_missing_source",
        projectId: "proj_contract",
        status: "active",
        title: "No provenance",
        bodyRef: "file:///tmp/NOTES.md",
        sourceRefs: [],
        backend: "markdown",
        freshness: "fresh",
        exportStatus: "not_exported",
        redactionStatus: "not_redacted",
        createdAt: now,
        updatedAt: now,
        schemaVersion: "1.0"
      })
    ).toThrow();
  });
});
