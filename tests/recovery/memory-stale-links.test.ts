import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

describe("memory stale-link recovery", () => {
  it("marks memory stale when source file is deleted", async () => {
    const service = new MemoryService(new MemoryRepo());
    const dir = mkdtempSync(path.join(tmpdir(), "fulcrum-memory-stale-"));
    const source = path.join(dir, "NOTES.md");
    writeFileSync(source, "# Source\n\nStale recovery.");
    const imported = await service.import({ projectId: "proj_stale", path: source });

    rmSync(source);
    const stale = service.markStaleForMissingSources("proj_stale");

    expect(stale).toHaveLength(1);
    expect(stale[0]?.memoryId).toBe(imported[0]?.memoryId);
    expect(stale[0]?.status).toBe("stale");
    expect(stale[0]?.freshness).toBe("stale");
  });
});
