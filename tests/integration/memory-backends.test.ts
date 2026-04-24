import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryService, type MemoryRepositoryPort } from "@fulcrum/core";
import type { MemoryEntry } from "@fulcrum/shared";

class MemoryRepo implements MemoryRepositoryPort {
  entries = new Map<string, MemoryEntry>();
  save(entry: MemoryEntry): MemoryEntry {
    this.entries.set(entry.memoryId, entry);
    return entry;
  }
  get(memoryId: string): MemoryEntry | undefined {
    return this.entries.get(memoryId);
  }
  list(projectId?: string): MemoryEntry[] {
    return [...this.entries.values()].filter(
      (entry) => !projectId || entry.projectId === projectId
    );
  }
}

describe("memory backends", () => {
  it("imports markdown and searches through markdown, memsearch, and Engram fallback", async () => {
    const repo = new MemoryRepo();
    const service = new MemoryService(repo);
    const dir = mkdtempSync(path.join(tmpdir(), "fulcrum-memory-"));
    const source = path.join(dir, "NOTES.md");
    writeFileSync(source, "# README heading\n\nMemory says use local provenance.");

    const imported = await service.import({ projectId: "proj_memory", path: source });
    const markdown = await service.search({ projectId: "proj_memory", query: "README heading" });
    const memsearch = await service.search({
      projectId: "proj_memory",
      query: "README heading",
      backend: "memsearch"
    });
    const engram = await service.search({
      projectId: "proj_memory",
      query: "README heading",
      backend: "engram"
    });

    expect(imported[0]?.sourceRefs[0]?.uri).toBe(source);
    expect(markdown[0]?.entry.memoryId).toBe(imported[0]?.memoryId);
    expect(memsearch[0]?.limitation).toContain("local markdown");
    expect(engram[0]?.limitation).toContain("local markdown");
  });
});
