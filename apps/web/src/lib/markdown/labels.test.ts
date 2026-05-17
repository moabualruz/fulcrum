import { describe, expect, test } from "bun:test";
import { parseLabels, serializeLabels } from "./labels.ts";

describe("parseLabels", () => {
  test("empty string returns empty array", () => {
    expect(parseLabels("")).toEqual([]);
  });

  test("trims whitespace + drops empty entries", () => {
    expect(parseLabels("  one ,  , two,  three ")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });
});

describe("serializeLabels", () => {
  test("empty list serialises to empty string", () => {
    expect(serializeLabels([])).toBe("");
  });

  test("multiple labels join with comma + space", () => {
    expect(serializeLabels(["a", "b", "c"])).toBe("a, b, c");
  });
});
