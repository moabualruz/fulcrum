// @ts-nocheck
/**
 * TDD: semantic search toggle gating.
 * RED written first; GREEN by apps/tui/src/screens/search-screen.ts.
 *
 * Acceptance criteria covered:
 *  - Embeddings OFF → "Semantic" chip not visible; mode='fts'
 *  - Embeddings ON  → "Semantic" chip visible
 *  - Embeddings ON  → toggling mode → mode='hybrid'
 *  - Embeddings ON  → hybrid mode calls search.query with mode='hybrid'
 *  - Results differ between fts and hybrid (fixture data)
 *  - Both flags independent (i18n ON + embeddings OFF → no chip)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
  buildFilterChips,
  toggleSemanticMode,
  executeSearch,
} from "@fulcrum/tui/screens/search-screen.ts";
import type { SearchOptions, SearchResult } from "@fulcrum/tui/types.ts";
import { resetFeaturesCache } from "@feature-flags/application/index.ts";

beforeEach(() => {
  resetFeaturesCache();
});

// Fixture search service that records calls and returns mode-dependent results.
function makeSearchService(): {
  calls: SearchOptions[];
  query(opts: SearchOptions): Promise<SearchResult[]>;
} {
  const calls: SearchOptions[] = [];
  return {
    calls,
    async query(opts: SearchOptions): Promise<SearchResult[]> {
      calls.push({ ...opts });
      if (opts.mode === "hybrid") {
        return [
          { id: "h1", title: "Hybrid result 1", body: "cosine match", score: 0.9 },
          { id: "h2", title: "Hybrid result 2", body: "bm25+cosine", score: 0.85 },
        ];
      }
      return [
        { id: "f1", title: "FTS result 1", body: "keyword match", score: 1.0 },
      ];
    },
  };
}

describe("buildFilterChips: embeddings OFF", () => {
  const env = { FULCRUM_FEATURES: "" };

  test("semanticChipVisible is false", () => {
    const chips = buildFilterChips(env);
    expect(chips.semanticChipVisible).toBe(false);
  });

  test("initial mode is 'fts'", () => {
    const chips = buildFilterChips(env);
    expect(chips.mode).toBe("fts");
  });

  test("baseChips are present", () => {
    const chips = buildFilterChips(env);
    expect(chips.baseChips).toContain("All");
  });
});

describe("buildFilterChips: embeddings ON", () => {
  const env = { FULCRUM_FEATURES: "embeddings" };

  test("semanticChipVisible is true", () => {
    const chips = buildFilterChips(env);
    expect(chips.semanticChipVisible).toBe(true);
  });

  test("initial mode is still 'fts' (user must explicitly toggle)", () => {
    const chips = buildFilterChips(env);
    expect(chips.mode).toBe("fts");
  });
});

describe("toggleSemanticMode: embeddings OFF", () => {
  const env = { FULCRUM_FEATURES: "" };

  test("toggle returns mode='fts' (no-op guard)", () => {
    const chips = buildFilterChips(env);
    const toggled = toggleSemanticMode(chips, env);
    expect(toggled.mode).toBe("fts");
  });

  test("toggle hides chip even if it was somehow set visible", () => {
    const chips = { ...buildFilterChips(env), semanticChipVisible: true };
    const toggled = toggleSemanticMode(chips, env);
    expect(toggled.semanticChipVisible).toBe(false);
  });
});

describe("toggleSemanticMode: embeddings ON", () => {
  const env = { FULCRUM_FEATURES: "embeddings" };

  test("fts → hybrid on first toggle", () => {
    const chips = buildFilterChips(env);
    const toggled = toggleSemanticMode(chips, env);
    expect(toggled.mode).toBe("hybrid");
  });

  test("hybrid → fts on second toggle", () => {
    const chips = buildFilterChips(env);
    const once = toggleSemanticMode(chips, env);
    const twice = toggleSemanticMode(once, env);
    expect(twice.mode).toBe("fts");
  });
});

describe("executeSearch: mode propagation", () => {
  const envOff = { FULCRUM_FEATURES: "" };
  const envOn = { FULCRUM_FEATURES: "embeddings" };

  test("embeddings OFF → query called with mode='fts'", async () => {
    const svc = makeSearchService();
    const chips = buildFilterChips(envOff);
    await executeSearch("tasks", "org1", chips, svc);
    expect(svc.calls[0]?.mode).toBe("fts");
  });

  test("embeddings ON + chips still fts → query called with mode='fts'", async () => {
    const svc = makeSearchService();
    const chips = buildFilterChips(envOn);
    await executeSearch("tasks", "org1", chips, svc);
    expect(svc.calls[0]?.mode).toBe("fts");
  });

  test("embeddings ON + toggle → query called with mode='hybrid'", async () => {
    const svc = makeSearchService();
    const chips = toggleSemanticMode(buildFilterChips(envOn), envOn);
    await executeSearch("tasks", "org1", chips, svc);
    expect(svc.calls[0]?.mode).toBe("hybrid");
  });

  test("hybrid results differ from fts results (fixture)", async () => {
    const svc = makeSearchService();
    const ftsChips = buildFilterChips(envOn);
    const hybridChips = toggleSemanticMode(ftsChips, envOn);

    const ftsResults = await executeSearch("tasks", "org1", ftsChips, svc);
    const hybridResults = await executeSearch("tasks", "org1", hybridChips, svc);

    expect(ftsResults[0]?.id).toBe("f1");
    expect(hybridResults[0]?.id).toBe("h1");
    expect(ftsResults).not.toEqual(hybridResults);
  });
});

describe("flag independence", () => {
  test("i18n ON + embeddings OFF → no semantic chip", () => {
    const env = { FULCRUM_FEATURES: "i18n" };
    const chips = buildFilterChips(env);
    expect(chips.semanticChipVisible).toBe(false);
  });

  test("embeddings ON + i18n OFF → semantic chip visible", () => {
    const env = { FULCRUM_FEATURES: "embeddings" };
    const chips = buildFilterChips(env);
    expect(chips.semanticChipVisible).toBe(true);
  });

  test("both ON → semantic chip visible", () => {
    const env = { FULCRUM_FEATURES: "i18n,embeddings" };
    const chips = buildFilterChips(env);
    expect(chips.semanticChipVisible).toBe(true);
  });
});
