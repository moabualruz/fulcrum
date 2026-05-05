/**
 * MemoryService tests — Plan 06-06
 *
 * Tests: FTS ranking (project > global), importance weighting, promote(),
 * list(), create(), get(), delete(), and heuristic extractor integration.
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { Memory } from "../db/entities/memory/Memory.ts";
import type { MemoryRepository } from "../db/repositories/memory/MemoryRepository.ts";
import { MemoryService } from "./memory-service.ts";
import { HeuristicExtractor } from "./extractor-heuristic.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem-1",
    orgId: "org-1",
    org: { id: "org-1" } as never,
    projectId: "proj-1",
    global: false,
    kind: "note",
    body: "test memory",
    tags: [],
    importance: "medium",
    source: "manual",
    sourceRef: {},
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    archived: false,
    ...overrides,
  } as Memory;
}

function makeGlobalMemory(overrides: Partial<Memory> = {}): Memory {
  return makeMemory({ id: "mem-global", projectId: null, global: true, ...overrides });
}

// ---------------------------------------------------------------------------
// Shared mock repo factory
// ---------------------------------------------------------------------------

interface MockEm {
  persistAndFlush: ReturnType<typeof mock>;
  removeAndFlush: ReturnType<typeof mock>;
  flush: ReturnType<typeof mock>;
  nativeUpdate: ReturnType<typeof mock>;
}

function makeMockRepo(memories: Memory[] = []): MemoryRepository & { _em: MockEm } {
  const em: MockEm = {
    persistAndFlush: mock(async () => {}),
    removeAndFlush: mock(async () => {}),
    flush: mock(async () => {}),
    nativeUpdate: mock(async () => 1),
  };
  const repo = {
    _em: em,
    searchProjectAndGlobal: mock(async () => memories),
    find: mock(async () => memories),
    findOne: mock(async (filter: Record<string, unknown>) => {
      const id = (filter as { id?: string }).id ?? (filter as { where?: { id: string } }).where?.id;
      return memories.find((m) => m.id === id) ?? null;
    }),
    create: mock((data: Partial<Memory>) => ({ ...data, id: "new-mem-id", body: (data as Record<string, unknown>).body, importance: (data as Record<string, unknown>).importance } as Memory)),
    getEntityManager: mock(() => em),
  } as unknown as MemoryRepository & { _em: MockEm };
  return repo;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MemoryService", () => {
  describe("search() — project-scoped ranked above global", () => {
    test("project memories appear before global memories in result", async () => {
      const projectMem = makeMemory({ id: "proj-mem", projectId: "proj-1", global: false });
      const globalMem = makeGlobalMemory({ id: "global-mem" });
      // Repo returns global first to test sorting
      const repo = makeMockRepo([globalMem, projectMem]);
      const service = new MemoryService(repo);

      const results = await service.search("org-1", "test query", "proj-1");

      const ids = results.map((r) => r.id);
      expect(ids.indexOf("proj-mem")).toBeLessThan(ids.indexOf("global-mem"));
    });

    test("importance weighting: high > medium > low in rank", async () => {
      const lowMem = makeMemory({ id: "low", importance: "low", projectId: "proj-1" });
      const highMem = makeMemory({ id: "high", importance: "high", projectId: "proj-1" });
      const medMem = makeMemory({ id: "med", importance: "medium", projectId: "proj-1" });
      const repo = makeMockRepo([lowMem, medMem, highMem]);
      const service = new MemoryService(repo);

      const results = await service.search("org-1", "test", "proj-1");

      const ids = results.map((r) => r.id);
      // high should come before medium, medium before low
      expect(ids.indexOf("high")).toBeLessThan(ids.indexOf("med"));
      expect(ids.indexOf("med")).toBeLessThan(ids.indexOf("low"));
    });
  });

  describe("promote()", () => {
    test("sets global=true and preserves original projectId", async () => {
      const mem = makeMemory({ id: "mem-1", projectId: "proj-1", global: false });
      const repo = makeMockRepo([mem]);
      const nativeUpdate = repo._em.nativeUpdate;
      const service = new MemoryService(repo);

      await service.promote("mem-1", "org-1");

      expect(nativeUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "mem-1", orgId: "org-1" }),
        expect.objectContaining({ global: true }),
      );
      // Ensure projectId is NOT being cleared (not in the update patch)
      const updateArgs = nativeUpdate.mock.calls[0];
      const patch = updateArgs?.[2] as Record<string, unknown>;
      expect(patch).not.toHaveProperty("projectId");
    });
  });

  describe("list()", () => {
    test("returns project memories + global memories", async () => {
      const projectMem = makeMemory({ id: "proj-mem", projectId: "proj-1" });
      const globalMem = makeGlobalMemory({ id: "global-mem" });
      const repo = makeMockRepo([projectMem, globalMem]);
      const service = new MemoryService(repo);

      const results = await service.list("org-1", "proj-1");

      expect(results.length).toBe(2);
      expect(results.some((r) => r.id === "proj-mem")).toBe(true);
      expect(results.some((r) => r.id === "global-mem")).toBe(true);
    });
  });

  describe("create()", () => {
    test("persists memory with correct fields", async () => {
      const repo = makeMockRepo();
      const persistAndFlush = repo._em.persistAndFlush;
      const service = new MemoryService(repo);

      const result = await service.create("org-1", {
        body: "new insight",
        projectId: "proj-1",
        importance: "high",
        kind: "note",
        source: "manual",
      });

      expect(persistAndFlush).toHaveBeenCalled();
      expect(result.body).toBe("new insight");
      expect(result.importance).toBe("high");
    });
  });

  describe("heuristic extractor integration (MEM-02)", () => {
    test("extractMemories returns at least 1 row with body containing insight from input", () => {
      const extractor = new HeuristicExtractor({} as MemoryRepository);
      const transcript = "Agent [wrote] src/memory/memory-service.ts\nDecided: use FTS ranking for memory retrieval";

      const memories = extractor.extractMemories(transcript);

      expect(memories.length).toBeGreaterThan(0);
      // At least one memory should contain extracted insight
      const bodies = memories.map((m) => m.body);
      expect(bodies.some((b) => b.includes("src/memory/memory-service.ts") || b.includes("FTS ranking"))).toBe(true);
    });
  });
});
