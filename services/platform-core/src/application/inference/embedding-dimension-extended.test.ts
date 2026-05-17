/**
 * routing workflow — Embedding dimension enforcement (384-dim validation).
 */
import { describe, expect, test } from "bun:test";
import { assertEmbeddingDimension } from "@platform-core/application/inference/model-metadata.ts";

describe("assertEmbeddingDimension", () => {
  test("accepts 384-dim vector when expected=384", () => {
    const vector = new Array<number>(384).fill(0.1);
    expect(() => assertEmbeddingDimension(vector, 384)).not.toThrow();
  });

  test("rejects 1536-dim vector when expected=384", () => {
    const vector = new Array<number>(1536).fill(0.1);
    expect(() => assertEmbeddingDimension(vector, 384)).toThrow(
      "embedding dimension mismatch expected=384 actual=1536",
    );
  });

  test("rejects 3-dim vector when expected=384", () => {
    const vector = [0.1, 0.2, 0.3];
    expect(() => assertEmbeddingDimension(vector, 384)).toThrow(
      /expected=384 actual=3/,
    );
  });

  test("rejects empty vector", () => {
    expect(() => assertEmbeddingDimension([], 384)).toThrow(/expected=384/);
  });

  test("accepts arbitrary expected dimension when vector matches", () => {
    const vector = new Array<number>(768).fill(0.5);
    expect(() => assertEmbeddingDimension(vector, 768)).not.toThrow();
  });

  test("error message contains both expected and actual values", () => {
    try {
      assertEmbeddingDimension(new Array(100).fill(0), 384);
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("expected=384");
      expect(e.message).toContain("actual=100");
    }
  });
});
