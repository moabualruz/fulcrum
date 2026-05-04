import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_MEMORY_CONFIG,
  buildMemoryListInput,
  buildMemorySourceHref,
  createDebouncedMemorySearch,
  optimisticMemoryAction,
  scoreMemoryForConfig,
  shouldConfirmMetadataEdit,
} from "../../src/web/src/lib/memory/memory-browser.ts";

describe("web memory browser routes", () => {
  test("/memory page wires list/search filters and bulk actions to memory tRPC", async () => {
    const source = await readFile("src/web/src/routes/memory/+page.svelte", "utf8");

    expect(source).toContain("data-memory-browser");
    expect(source).toContain("memory.list");
    expect(source).toContain("memory.search");
    expect(source).toContain("data-memory-filter-project");
    expect(source).toContain("data-memory-filter-kind");
    expect(source).toContain("data-memory-filter-importance");
    expect(source).toContain("data-memory-filter-tags");
    expect(source).toContain("data-memory-filter-date-range");
    expect(source).toContain("data-memory-filter-source");
    expect(source).toContain("data-memory-filter-archived");
    expect(source).toContain("data-memory-bulk-bar");
    expect(source).toContain("bulkPromote");
    expect(source).toContain("bulkArchive");
    expect(source).toContain("bulkTag");
  });

  test("/memory/[id] page renders detail, links, guarded metadata edit, and actions", async () => {
    const source = await readFile("src/web/src/routes/memory/[id]/+page.svelte", "utf8");

    expect(source).toContain("data-memory-detail");
    expect(source).toContain("memory.get");
    expect(source).toContain("memory.update");
    expect(source).toContain("data-memory-source-ref");
    expect(source).toContain("data-memory-links");
    expect(source).toContain("confirmMetadataEdit");
    expect(source).toContain("archiveMemory");
    expect(source).toContain("promoteMemory");
    expect(source).toContain("restoreMemory");
  });

  test("project settings memory tab saves memory_config controls", async () => {
    const source = await readFile("src/web/src/routes/projects/[id]/settings/memory/+page.svelte", "utf8");

    expect(source).toContain("data-project-memory-settings");
    expect(source).toContain("bm25_weight");
    expect(source).toContain("recency_weight");
    expect(source).toContain("importance_boost");
    expect(source).toContain("token_budget");
    expect(source).toContain("memory_config");
    expect(source).toContain("resetDefaults");
  });
});

describe("memory browser helpers", () => {
  test("filters map to memory.list input and omit empty values", () => {
    expect(buildMemoryListInput({
      projectId: "p1",
      kind: "decision",
      importance: "high",
      tags: "routing, memory",
      source: "manual",
      archived: true,
    })).toEqual({
      projectId: "p1",
      kind: "decision",
      importance: "high",
      tags: ["routing", "memory"],
      source: "manual",
      archived: true,
      limit: 50,
    });

    expect(buildMemoryListInput({ tags: "   ", archived: false })).toEqual({
      archived: false,
      limit: 50,
    });
  });

  test("search calls are debounced by 300ms", async () => {
    const calls: unknown[] = [];
    const search = createDebouncedMemorySearch((input) => {
      calls.push(input);
    }, 300);

    search({ query: "first" });
    search({ query: "second" });
    await Bun.sleep(330);

    expect(calls).toEqual([{ query: "second" }]);
  });

  test("non-manual metadata edits require confirmation", () => {
    expect(shouldConfirmMetadataEdit("manual")).toBe(false);
    expect(shouldConfirmMetadataEdit("heuristic")).toBe(true);
    expect(shouldConfirmMetadataEdit("llm")).toBe(true);
  });

  test("optimistic actions produce promoted, archived, and restored rows", () => {
    const row = {
      id: "m1",
      global: false,
      archived: false,
      importance: "medium" as const,
      tags: ["alpha"],
    };

    expect(optimisticMemoryAction(row, "promote")).toMatchObject({ global: true, importance: "high" });
    expect(optimisticMemoryAction(row, "archive")).toMatchObject({ archived: true });
    expect(optimisticMemoryAction({ ...row, archived: true }, "restore")).toMatchObject({ archived: false });
    expect(optimisticMemoryAction(row, "tag", "beta")).toMatchObject({ tags: ["alpha", "beta"] });
  });

  test("settings weights affect scoring", () => {
    const row = { textRank: 2, recencyBoost: 1, importanceBoost: 1 };

    expect(scoreMemoryForConfig(row, DEFAULT_MEMORY_CONFIG)).toBe(4);
    expect(scoreMemoryForConfig(row, {
      bm25_weight: 2,
      recency_weight: 0,
      importance_boost: 3,
      token_budget: 4096,
    })).toBe(7);
  });

  test("source refs become stable links", () => {
    expect(buildMemorySourceHref({ run_id: "run-1" })).toBe("/runs/run-1");
    expect(buildMemorySourceHref({ doc_id: "doc-1" })).toBe("/docs/doc-1");
    expect(buildMemorySourceHref({ task_id: "task-1" })).toBe("/tasks/task-1");
    expect(buildMemorySourceHref({})).toBeNull();
  });
});
