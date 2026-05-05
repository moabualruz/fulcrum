import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  ContextBundleService,
  TOTAL_TOKEN_BUDGET,
  SLICE_BUDGETS,
} from "./context-bundle-service.ts";

type MemoryItem = { id: string; body: string; projectId: string | null; global: boolean };
type DocItem = { id: string; title: string; contextSummary: { headings: string[]; wikilinks: string[] } };
type RunItem = { id: string; taskId: string; status: string; tokensUsed: number };
type TokenItem = MemoryItem | DocItem | RunItem | { id: string; body: string };

function makeMockRepo() {
  return {
    searchProjectAndGlobal: mock(() =>
      Promise.resolve([
        { id: "mem-1", body: "project memory alpha", projectId: "p1", global: false },
        { id: "mem-2", body: "global memory beta", projectId: null, global: true },
      ]),
    ),
  };
}

function makeMockDocRepo() {
  return {
    getContextSummariesForProject: mock(() =>
      Promise.resolve([
        { id: "doc-1", title: "Architecture", contextSummary: { headings: ["Overview"], wikilinks: [] } },
        { id: "doc-2", title: "Runbook", contextSummary: { headings: ["Steps"], wikilinks: ["[[arch]]"] } },
      ]),
    ),
  };
}

function makeMockRunRepo() {
  return {
    getRecentForProject: mock(() =>
      Promise.resolve([
        { id: "run-1", taskId: "t1", status: "success", tokensUsed: 500 },
        { id: "run-2", taskId: "t2", status: "failed", tokensUsed: 200 },
        { id: "run-3", taskId: "t3", status: "success", tokensUsed: 800 },
      ]),
    ),
  };
}

describe("ContextBundleService", () => {
  let svc: ContextBundleService;
  let memRepo: ReturnType<typeof makeMockRepo>;
  let docRepo: ReturnType<typeof makeMockDocRepo>;
  let runRepo: ReturnType<typeof makeMockRunRepo>;

  beforeEach(() => {
    memRepo = makeMockRepo();
    docRepo = makeMockDocRepo();
    runRepo = makeMockRunRepo();
    svc = new ContextBundleService(
      memRepo as never,
      docRepo as never,
      runRepo as never,
    );
  });

  test("assemble returns all 5 slice keys", async () => {
    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(Object.keys(bundle).sort()).toEqual([
      "linkedDocs", "memories", "recentRuns", "repoState", "skillPrompts",
    ]);
  });

  test("memories slice populated from MemoryRepository", async () => {
    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(bundle.memories.length).toBeGreaterThan(0);
    expect(memRepo.searchProjectAndGlobal).toHaveBeenCalledWith("org-1", "p1");
  });

  test("linkedDocs slice populated from DocumentRepository", async () => {
    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(bundle.linkedDocs.length).toBeGreaterThan(0);
    expect(docRepo.getContextSummariesForProject).toHaveBeenCalledWith("p1");
  });

  test("recentRuns slice populated from AgentRunRepository", async () => {
    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(bundle.recentRuns.length).toBeGreaterThan(0);
    expect(runRepo.getRecentForProject).toHaveBeenCalledWith("p1");
  });

  test("repoState returns empty array per D-29", async () => {
    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(bundle.repoState).toEqual([]);
  });

  test("skillPrompts returns empty array (Pillar 9 pending)", async () => {
    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(bundle.skillPrompts).toEqual([]);
  });

  test("greedy fill respects token budget per slice", async () => {
    const bigItems: MemoryItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      body: "x".repeat(200),
      projectId: "p1",
      global: false,
    }));
    memRepo.searchProjectAndGlobal = mock(() => Promise.resolve(bigItems));

    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    const memoriesBudget = Math.floor(TOTAL_TOKEN_BUDGET * SLICE_BUDGETS.memories);
    const totalTokens = bundle.memories.reduce(
      (sum: number, item) => sum + Math.ceil(JSON.stringify(item).length / 4),
      0,
    );
    expect(totalTokens).toBeLessThanOrEqual(memoriesBudget);
    expect(bundle.memories.length).toBeLessThan(100);
  });

  test("empty repositories produce empty slices without error", async () => {
    memRepo.searchProjectAndGlobal = mock(() => Promise.resolve([]));
    docRepo.getContextSummariesForProject = mock(() => Promise.resolve([]));
    runRepo.getRecentForProject = mock(() => Promise.resolve([]));

    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    expect(bundle.memories).toEqual([]);
    expect(bundle.linkedDocs).toEqual([]);
    expect(bundle.recentRuns).toEqual([]);
  });

  test("total bundle size stays under TOTAL_TOKEN_BUDGET", async () => {
    const memoryItems: MemoryItem[] = Array.from({ length: 200 }, (_, i) => ({
      id: `big-${i}`,
      body: "y".repeat(500),
      projectId: "p1",
      global: false,
    }));
    const docItems: DocItem[] = memoryItems.map((item) => ({
      id: item.id,
      title: item.body,
      contextSummary: { headings: [item.body], wikilinks: [] },
    }));
    const runItems: RunItem[] = memoryItems.map((item) => ({
      id: item.id,
      taskId: item.id,
      status: item.body,
      tokensUsed: 500,
    }));
    memRepo.searchProjectAndGlobal = mock(() => Promise.resolve(memoryItems));
    docRepo.getContextSummariesForProject = mock(() => Promise.resolve(docItems));
    runRepo.getRecentForProject = mock(() => Promise.resolve(runItems));

    const bundle = await svc.assemble({ orgId: "org-1", projectId: "p1" });
    const bundleItems = [
      ...bundle.memories,
      ...bundle.linkedDocs,
      ...bundle.recentRuns,
      ...bundle.repoState,
      ...bundle.skillPrompts,
    ] as TokenItem[];
    const totalTokens = bundleItems.reduce(
      (sum, item) => sum + Math.ceil(JSON.stringify(item).length / 4),
      0,
    );

    expect(totalTokens).toBeLessThanOrEqual(TOTAL_TOKEN_BUDGET);
  });
});
