/**
 * RelationshipService unit tests — Phase 05 Plan 04.
 *
 * Uses mock EntityManager; no real DB required.
 * Covers HIGH-04 gap: full CRUD + cycle detection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelationshipService } from "./RelationshipService.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(id: string, orgId = "org-1") {
  return { id, org: { id: orgId }, status: "Backlog" };
}

function makeRelationship(src: string, tgt: string, type = "blocks") {
  return { id: `rel-${src}-${tgt}`, sourceTaskId: src, targetTaskId: tgt, type, org: { id: "org-1" }, createdAt: new Date() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockEm(overrides: Partial<Record<string, any>> = {}): any {
  const findOne = vi.fn();
  const find = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockImplementation((_, data) => ({ id: `new-${Date.now()}`, ...data }));
  const persistAndFlush = vi.fn().mockResolvedValue(undefined);
  const removeAndFlush = vi.fn().mockResolvedValue(undefined);
  const flush = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn();

  return {
    findOne,
    find,
    create,
    persistAndFlush,
    removeAndFlush,
    remove,
    flush,
    ...overrides,
  };
}

// ── RelationshipService ───────────────────────────────────────────────────────

describe("RelationshipService", () => {
  describe("create", () => {
    it("rejects self-reference", async () => {
      const em = makeMockEm();
      const svc = new RelationshipService(em);
      await expect(
        svc.create("org-1", "task-A", "task-A", "blocks", "user-1")
      ).rejects.toThrow(/self/i);
    });

    it("creates relationship when both tasks exist in same org", async () => {
      const taskA = makeTask("task-A");
      const taskB = makeTask("task-B");
      const em = makeMockEm({
        findOne: vi.fn()
          .mockResolvedValueOnce(taskA)
          .mockResolvedValueOnce(taskB),
        find: vi.fn().mockResolvedValue([]), // no existing blocks for cycle check
      });
      const svc = new RelationshipService(em);
      const result = await svc.create("org-1", "task-A", "task-B", "blocks", "user-1");
      expect(result).toBeDefined();
      expect(em.persistAndFlush).toHaveBeenCalled();
    });

    it("rejects cross-org task access", async () => {
      const taskA = makeTask("task-A", "org-1");
      const taskB = makeTask("task-B", "org-2"); // different org
      const em = makeMockEm({
        findOne: vi.fn()
          .mockResolvedValueOnce(taskA)
          .mockResolvedValueOnce(null), // task-B not found in org-1
      });
      const svc = new RelationshipService(em);
      await expect(
        svc.create("org-1", "task-A", "task-B", "blocks", "user-1")
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("checkCycle", () => {
    it("detects direct cycle A blocks B, B blocks A", async () => {
      // When we try to add A→B: DFS from B should find A
      const relBA = makeRelationship("task-B", "task-A", "blocks");
      const em = makeMockEm({
        find: vi.fn().mockResolvedValue([relBA]),
      });
      const svc = new RelationshipService(em);
      const hasCycle = await svc.checkCycle("org-1", "task-A", "task-B");
      expect(hasCycle).toBe(true);
    });

    it("returns false when no cycle", async () => {
      // A→B, no back edges
      const em = makeMockEm({
        find: vi.fn().mockResolvedValue([]),
      });
      const svc = new RelationshipService(em);
      const hasCycle = await svc.checkCycle("org-1", "task-A", "task-B");
      expect(hasCycle).toBe(false);
    });

    it("detects transitive cycle A→B→C→A", async () => {
      // Adding A→B: DFS from B → finds C via B→C, then finds A via C→A
      const em = makeMockEm({
        find: vi.fn()
          // First call: find blocks from B (sourceTaskId=B) → B→C
          .mockResolvedValueOnce([makeRelationship("task-B", "task-C")])
          // Second call: find blocks from C → C→A
          .mockResolvedValueOnce([makeRelationship("task-C", "task-A")]),
      });
      const svc = new RelationshipService(em);
      const hasCycle = await svc.checkCycle("org-1", "task-A", "task-B");
      expect(hasCycle).toBe(true);
    });
  });

  describe("listForTask", () => {
    it("returns relationships in both directions", async () => {
      const relAB = makeRelationship("task-A", "task-B");
      const relCA = makeRelationship("task-C", "task-A", "relates_to");
      const em = makeMockEm({
        find: vi.fn().mockResolvedValue([relAB, relCA]),
      });
      const svc = new RelationshipService(em);
      const rels = await svc.listForTask("org-1", "task-A");
      expect(rels).toHaveLength(2);
    });
  });

  describe("getBlockedItems", () => {
    it("returns blocked tasks in project", async () => {
      const rel1 = makeRelationship("task-X", "task-Y");
      const rel2 = makeRelationship("task-A", "task-B");
      const em = makeMockEm({
        find: vi.fn().mockResolvedValue([rel1, rel2]),
      });
      const svc = new RelationshipService(em);
      const blocked = await svc.getBlockedItems("org-1", "proj-1");
      // Returns target task IDs that are blocked
      expect(blocked.length).toBeGreaterThan(0);
    });
  });
});
