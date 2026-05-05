/**
 * ContextBundleService tests — D-25
 *
 * Verifies slice assembly, token budget enforcement, and real repository wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ContextBundleService,
  type BundleContext,
} from "./context-bundle-service.ts";

// --- helpers -----------------------------------------------------------------

function makeItem(size: number): { content: string } {
  // Each item's JSON will be ~size*4 chars => estimateTokens returns ~size
  return { content: "x".repeat(size * 4) };
}

// --- mocks -------------------------------------------------------------------

const mockMemoryRepo = {
  searchProjectAndGlobal: vi.fn(),
};

const mockDocumentRepo = {
  getContextSummariesForProject: vi.fn(),
};

const mockAgentRunRepo = {
  getRecentForProject: vi.fn(),
};

const CTX: BundleContext = {
  orgId: "org-1",
  projectId: "proj-1",
};

// --- suite -------------------------------------------------------------------

describe("ContextBundleService", () => {
  let svc: ContextBundleService;

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: return empty arrays
    mockMemoryRepo.searchProjectAndGlobal.mockResolvedValue([]);
    mockDocumentRepo.getContextSummariesForProject.mockResolvedValue([]);
    mockAgentRunRepo.getRecentForProject.mockResolvedValue([]);

    svc = new ContextBundleService(
      mockMemoryRepo as any,
      mockDocumentRepo as any,
      mockAgentRunRepo as any,
    );
  });

  it("Test 1: assemble() returns object with all 5 expected keys", async () => {
    const bundle = await svc.assemble(CTX);
    expect(bundle).toHaveProperty("memories");
    expect(bundle).toHaveProperty("linkedDocs");
    expect(bundle).toHaveProperty("recentRuns");
    expect(bundle).toHaveProperty("repoState");
    expect(bundle).toHaveProperty("skillPrompts");
  });

  it("Test 2: total tokens across all slices <= 8000 (TOTAL_TOKEN_BUDGET)", async () => {
    // Fill each repo with large items that could overflow
    const bigItems = Array.from({ length: 100 }, () => makeItem(500));
    mockMemoryRepo.searchProjectAndGlobal.mockResolvedValue(bigItems);
    mockDocumentRepo.getContextSummariesForProject.mockResolvedValue(bigItems);
    mockAgentRunRepo.getRecentForProject.mockResolvedValue(bigItems);

    const bundle = await svc.assemble(CTX);
    const allItems = [
      ...bundle.memories,
      ...bundle.linkedDocs,
      ...bundle.recentRuns,
      ...bundle.repoState,
      ...bundle.skillPrompts,
    ];
    const totalTokens = allItems.reduce(
      (sum, item) => sum + Math.ceil(JSON.stringify(item).length / 4),
      0,
    );
    expect(totalTokens).toBeLessThanOrEqual(8000);
  });

  it("Test 3: memories slice max tokens is ~25% of 8000 (2000)", async () => {
    // Provide items that would exceed budget if not capped
    const bigItems = Array.from({ length: 50 }, () => makeItem(100));
    mockMemoryRepo.searchProjectAndGlobal.mockResolvedValue(bigItems);

    const bundle = await svc.assemble(CTX);
    const memoriesTokens = bundle.memories.reduce(
      (sum, item) => sum + Math.ceil(JSON.stringify(item).length / 4),
      0,
    );
    expect(memoriesTokens).toBeLessThanOrEqual(2000);
  });

  it("Test 4: repoState slice always returns empty array (D-29 placeholder)", async () => {
    const bundle = await svc.assemble(CTX);
    expect(bundle.repoState).toEqual([]);
  });

  it("Test 5: greedy fill stops when slice budget exceeded", async () => {
    // Items of 300 tokens each; memories budget=2000 => max 6 items
    const items = Array.from({ length: 20 }, () => makeItem(300));
    mockMemoryRepo.searchProjectAndGlobal.mockResolvedValue(items);

    const bundle = await svc.assemble(CTX);
    expect(bundle.memories.length).toBeLessThan(20);
    expect(bundle.memories.length).toBeGreaterThan(0);
  });

  it("Test 6: memories slice calls MemoryRepository.searchProjectAndGlobal()", async () => {
    await svc.assemble(CTX);
    expect(mockMemoryRepo.searchProjectAndGlobal).toHaveBeenCalledWith(
      CTX.orgId,
      CTX.projectId,
    );
  });

  it("Test 7: linkedDocs slice calls DocumentRepository.getContextSummariesForProject()", async () => {
    await svc.assemble(CTX);
    expect(mockDocumentRepo.getContextSummariesForProject).toHaveBeenCalledWith(
      CTX.projectId,
    );
  });

  it("Test 8: recentRuns slice calls AgentRunRepository.getRecentForProject()", async () => {
    await svc.assemble(CTX);
    expect(mockAgentRunRepo.getRecentForProject).toHaveBeenCalledWith(
      CTX.projectId,
    );
  });
});
