/**
 * Embedding model metadata contract.
 *
 * Asserts model-metadata-driven dimension enforcement.
 */

import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { assertEmbeddingDimension } from "./model-metadata.ts";

describe("embedding dimension guard", () => {
  it("accepts vectors whose length matches expected=384", () => {
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
  it("finds no stale vector(1536) tokens under service and app source roots", () => {
    // Non-comment references to `vector(1536)` are forbidden.  This test
    // greps the tree and tracks any hits as failures.
    const stdout = execSync(
      'rg -n "vector\\(1536\\)" --glob "!services/platform-core/src/application/inference/embedding-dimension.test.ts" --type-add "all:*.{ts,js,json,yaml,yml,toml,sql}" -t all services/ apps/ tests/ scripts/ 2>/dev/null || true',
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
