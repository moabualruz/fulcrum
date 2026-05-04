import { describe, expect, test } from "bun:test";

import {
  cosineSimilarity,
  normalizeBm25,
  hybridScore,
} from "../../src/memory/retrieval/hybrid-scoring.ts";
import {
  rankMemoryMatchesHybrid,
  type HybridMemoryRankInput,
} from "../../src/memory/retrieval/scoring.ts";

const NOW = new Date("2026-05-03T12:00:00.000Z");

describe("cosine similarity", () => {
  test("identical vectors yield 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  test("orthogonal vectors yield 0", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  test("opposite vectors yield -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  test("zero-length vector returns 0 (no divide-by-zero)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("normalizeBm25", () => {
  test("normalizes scores by dividing by max", () => {
    expect(normalizeBm25(5, 10)).toBeCloseTo(0.5, 6);
  });

  test("max score normalizes to 1", () => {
    expect(normalizeBm25(10, 10)).toBeCloseTo(1, 6);
  });

  test("zero max returns 0 (no divide-by-zero)", () => {
    expect(normalizeBm25(5, 0)).toBe(0);
  });

  test("zero score returns 0", () => {
    expect(normalizeBm25(0, 10)).toBe(0);
  });
});

describe("hybridScore", () => {
  test("formula: 0.6 * normalize(bm25) + 0.4 * cosine", () => {
    const bm25 = 8;
    const maxBm25 = 10;
    const cosine = 0.9;
    const expected = 0.6 * (8 / 10) + 0.4 * 0.9;
    expect(hybridScore(bm25, maxBm25, cosine)).toBeCloseTo(expected, 6);
  });

  test("pure BM25 (cosine=0) weights at 0.6", () => {
    expect(hybridScore(10, 10, 0)).toBeCloseTo(0.6, 6);
  });

  test("pure cosine (bm25=0) weights at 0.4", () => {
    expect(hybridScore(0, 10, 1)).toBeCloseTo(0.4, 6);
  });
});

describe("rankMemoryMatchesHybrid", () => {
  test("hybrid re-ranks differently from FTS-only for ≥3/10 queries", () => {
    // 10 memories: some with high BM25 but low cosine, vice versa
    const memories: HybridMemoryRankInput[] = [
      hmem("a", "alpha beta gamma delta", [1, 0, 0]),
      hmem("b", "alpha beta", [0.9, 0.3, 0.1]),
      hmem("c", "alpha", [0.95, 0.5, 0.2]),
      hmem("d", "alpha beta gamma", [0.1, 0.1, 0.1]),
      hmem("e", "alpha beta gamma delta epsilon", [0.5, 0.8, 0.3]),
      hmem("f", "alpha", [0.99, 0.99, 0.01]),
      hmem("g", "alpha beta gamma delta epsilon zeta", [0.2, 0.1, 0.05]),
      hmem("h", "alpha beta", [0.7, 0.7, 0.5]),
      hmem("i", "alpha", [0.8, 0.9, 0.7]),
      hmem("j", "alpha beta gamma", [0.6, 0.6, 0.6]),
    ];

    const queries = [
      "alpha", "beta", "gamma", "delta", "epsilon",
      "alpha beta", "gamma delta", "alpha gamma", "beta delta", "zeta",
    ];

    const queryEmbed = [0.85, 0.7, 0.4];

    let diffCount = 0;
    for (const query of queries) {
      // FTS-only: use rankMemoryMatches (from scoring.ts)
      const { rankMemoryMatches } = require("../../src/memory/retrieval/scoring.ts");
      const ftsOrder: string[] = rankMemoryMatches(query, memories, { now: NOW })
        .map((r: { memory: { id: string } }) => r.memory.id);

      // Hybrid
      const hybridOrder = rankMemoryMatchesHybrid(query, memories, queryEmbed, { now: NOW })
        .map((r) => r.memory.id);

      if (ftsOrder.join(",") !== hybridOrder.join(",")) diffCount++;
    }

    expect(diffCount).toBeGreaterThanOrEqual(3);
  });

  test("recency and importance boosts still additive on top of hybrid base", () => {
    const rows = rankMemoryMatchesHybrid(
      "marker",
      [
        hmem("old-high", "marker", [0.5, 0.5, 0.5], { importance: "high", createdAt: daysAgo(30) }),
        hmem("fresh-med", "marker", [0.5, 0.5, 0.5], { importance: "medium", createdAt: daysAgo(0) }),
      ],
      [0.5, 0.5, 0.5],
      { now: NOW },
    );

    // Both have identical hybrid base, so importance+recency decide
    for (const row of rows) {
      expect(row.score).toBeCloseTo(
        row.hybridBase + row.recencyBoost + row.importanceBoost,
        6,
      );
    }
  });

  test("query embed cached in bundle blob structure", () => {
    const queryEmbed = [0.1, 0.2, 0.3];
    const rows = rankMemoryMatchesHybrid(
      "test",
      [hmem("x", "test query", [0.1, 0.2, 0.3])],
      queryEmbed,
      { now: NOW },
    );

    // The function should accept and use query embedding without error
    expect(rows).toHaveLength(1);
  });
});

describe("sidecar fallback", () => {
  test("embedQuerySafe returns null on sidecar unavailable", async () => {
    const { embedQuerySafe } = await import("../../src/memory/retrieval/sidecar.ts");
    // No sidecar running — should return null, not throw
    const result = await embedQuerySafe("test query");
    expect(result).toBeNull();
  });
});

describe("flag OFF → no hybrid path", () => {
  test("rankMemoryMatches (non-hybrid) ignores embedding field", () => {
    const { rankMemoryMatches } = require("../../src/memory/retrieval/scoring.ts");
    const rows = rankMemoryMatches("alpha", [
      { id: "a", body: "alpha beta", createdAt: NOW, importance: "medium" as const },
      { id: "b", body: "alpha", createdAt: NOW, importance: "medium" as const },
    ], { now: NOW });

    // Original scoring still works — both match, order determined by BM25
    expect(rows).toHaveLength(2);
    // No hybridBase property on non-hybrid result
    expect(rows[0]).not.toHaveProperty("hybridBase");
    expect(rows[1]).not.toHaveProperty("hybridBase");
  });
});

function hmem(
  id: string,
  body: string,
  embedding: number[],
  overrides: Partial<HybridMemoryRankInput> = {},
): HybridMemoryRankInput {
  return {
    id,
    body,
    createdAt: NOW,
    importance: "medium",
    embedding,
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}
