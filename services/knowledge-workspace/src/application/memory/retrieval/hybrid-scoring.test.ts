/**
 * Hybrid scoring tests.
 *
 * Verifies updated weights (0.3 FTS / 0.7 cosine) and embeddings flag gate.
 */

import { describe, expect, test } from "bun:test";
import {
  hybridScore,
  cosineSimilarity,
  normalizeBm25,
  FTS_WEIGHT,
  COSINE_WEIGHT,
} from "./hybrid-scoring.ts";

describe("hybridScore", () => {
  test("uses 0.3 FTS + 0.7 cosine weights when useEmbeddings=true", () => {
    const fts = 0.8;
    const cosine = 0.9;
    const expected = FTS_WEIGHT * fts + COSINE_WEIGHT * cosine;
    expect(hybridScore(fts, cosine, { useEmbeddings: true })).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(0.3 * 0.8 + 0.7 * 0.9, 6);
  });

  test("returns FTS score only when useEmbeddings=false", () => {
    const fts = 0.8;
    const cosine = 0.9;
    expect(hybridScore(fts, cosine, { useEmbeddings: false })).toBe(fts);
  });

  test("FTS_WEIGHT is 0.3 and COSINE_WEIGHT is 0.7", () => {
    expect(FTS_WEIGHT).toBe(0.3);
    expect(COSINE_WEIGHT).toBe(0.7);
  });

  test("FTS_WEIGHT + COSINE_WEIGHT === 1.0", () => {
    expect(FTS_WEIGHT + COSINE_WEIGHT).toBeCloseTo(1.0, 6);
  });

  test("ignores cosine entirely when useEmbeddings=false (0 cosine same as high cosine)", () => {
    const fts = 0.5;
    expect(hybridScore(fts, 0.0, { useEmbeddings: false })).toBe(fts);
    expect(hybridScore(fts, 1.0, { useEmbeddings: false })).toBe(fts);
  });
});

describe("cosineSimilarity", () => {
  test("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  test("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  test("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("normalizeBm25", () => {
  test("normalizes score by max", () => {
    expect(normalizeBm25(3, 10)).toBeCloseTo(0.3, 6);
  });

  test("returns 0 when maxScore is 0", () => {
    expect(normalizeBm25(5, 0)).toBe(0);
  });
});

describe("embedding dimension declarations", () => {
  test("codebase contains no vector(1536) column declarations (non-test, non-comment files)", async () => {
    // Verify via the bun shell that no actual column declarations exist in src/
    // Exclude: *.test.ts files (test descriptions), comment lines (// and *)
    const proc = Bun.spawn(
      ["grep", "-r", "--include=*.ts", "--exclude=*.test.ts", "vector(1536)", "src/"],
      { cwd: process.cwd() },
    );
    const text = await new Response(proc.stdout).text();
    const declarations = text
      .split("\n")
      .filter(Boolean)
      // Exclude comment lines
      .filter((line) => {
        const code = line.split(":").slice(1).join(":").trim();
        return !code.startsWith("//") && !code.startsWith("*") && !code.startsWith("/*");
      });
    expect(declarations).toHaveLength(0);
  });
});
