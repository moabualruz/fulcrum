import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryService, type MemoryRepositoryPort } from "@fulcrum/core";
import { EngramMemoryAdapter, MemsearchMemoryAdapter } from "@fulcrum/memory";
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

describe("memory backend acceptance", () => {
  it("covers memsearch and Engram guidance, doctor health, search fallback, context inclusion, rebuild, and export provenance", async () => {
    const repo = new MemoryRepo();
    const service = new MemoryService(repo);
    const dir = mkdtempSync(path.join(tmpdir(), "fulcrum-memory-acceptance-"));
    const source = path.join(dir, "NOTES.md");
    writeFileSync(source, "# Architecture note\n\nUse adapter provenance in context packs.");

    const imported = await service.import({ projectId: "proj_memory", path: source });
    const memsearchAdapter = new MemsearchMemoryAdapter();
    const engramAdapter = new EngramMemoryAdapter();
    const memsearchHealth = memsearchAdapter.health();
    const engramHealth = engramAdapter.health();
    const memsearch = await service.search({
      projectId: "proj_memory",
      query: "adapter provenance",
      backend: "memsearch"
    });
    const engram = await service.search({
      projectId: "proj_memory",
      query: "adapter provenance",
      backend: "engram"
    });
    const exported = service.export("proj_memory");
    const stale = service.markStale(imported[0]!.memoryId, "backend rebuild requested");

    expect(memsearchHealth).toMatchObject({
      state: "degraded",
      nextAction: "Set FULCRUM_MEMSEARCH_ENABLED=1 after configuring memsearch."
    });
    expect(engramHealth).toMatchObject({
      state: "degraded",
      nextAction: "Set FULCRUM_ENGRAM_ENABLED=1 after configuring Engram."
    });
    expect(memsearch[0]?.entry.memoryId).toBe(imported[0]?.memoryId);
    expect(memsearch[0]?.limitation).toContain("local markdown");
    expect(engram[0]?.entry.memoryId).toBe(imported[0]?.memoryId);
    expect(engram[0]?.limitation).toContain("local markdown");
    expect(imported[0]?.sourceRefs[0]).toMatchObject({ type: "file", uri: source });
    expect(exported.entries[0]?.sourceRefs[0]?.uri).toBe(source);
    expect(exported.entries[0]?.redactionStatus).toBe("not_redacted");
    expect(stale.freshness).toBe("stale");
    expect(service.list("proj_memory")[0]?.status).toBe("stale");
  });
});
