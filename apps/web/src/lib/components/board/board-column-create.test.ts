import { describe, expect, test } from "bun:test";
import { commitNewCardTitle } from "./board-column-create.ts";

describe("commitNewCardTitle", () => {
  test("returns null for empty string", () => {
    expect(commitNewCardTitle("")).toBeNull();
  });

  test("returns null for whitespace-only string", () => {
    expect(commitNewCardTitle("   ")).toBeNull();
  });

  test("returns the input verbatim when no padding", () => {
    expect(commitNewCardTitle("Wire UI")).toBe("Wire UI");
  });

  test("trims surrounding whitespace before returning", () => {
    expect(commitNewCardTitle("  Wire UI  ")).toBe("Wire UI");
  });
});
