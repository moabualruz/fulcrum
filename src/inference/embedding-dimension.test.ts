/**
 * Embedding model metadata contract (INF-01, INF-06).
 *
 * Asserts model-metadata-driven dimension enforcement.  Imports from
 * model-metadata.ts — the RED phase fails when the module is absent,
 * GREEN phase resolves it.
 */

import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { assertEmbeddingDimension } from "./model-metadata.ts";

describe("embedding dimension guard", () => {
  it("accepts vectors whose length matches expected=384", () => {
    // When the function is wired this will pass; for now RED is expected.
    const vector = new Array<number>(384).fill(0.5);
    expect(() => assertEmbeddingDimension(vector, 384)).not.toThrow();
  });

  it("rejects vectors whose length differs from expected=384", () => {
    const short = new Array<number>(3).fill(0.5);
    expect(() => assertEmbeddingDimension(short, 384)).toThrow(
      "embedding dimension mismatch expected=384 actual=3",
    );
  });

  it("rejects zero-length vectors against expected=384", () => {
    expect(() => assertEmbeddingDimension([], 384)).toThrow(
      /expected=384/,
    );
  });
});

describe("stale vector(1536) references", () => {
  it("finds no stale vector(1536) tokens under src/ or inference/", () => {
    // Non-comment references to `vector(1536)` are forbidden.  This test
    // greps the tree and tracks any hits as failures.
    const stdout = execSync(
      'rg -n "vector\\(1536\\)" --type-add "all:*.{ts,js,json,yaml,yml,toml,sql}" -t all src/ inference/ 2>/dev/null || true',
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    ).toString().trim();

    if (stdout.length > 0) {
      // Print hits for debugging.
      console.warn("stale vector(1536) references found:\n" + stdout);
    }

    // Every line in `stdout` that is not a comment line is a violation.
    const violations = stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .filter((line) => !line.includes("//") && !line.includes("/*") && !line.includes("*"))
      .filter((line) => !line.includes("RG-IGNORE:vector1536"));
    expect(violations).toEqual([]);
  });
});
