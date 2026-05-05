import { describe, it, expect } from "bun:test";

describe("metrics-rollup worker", () => {
  it("rolls up daily snapshot from task state", () => {
    expect(true).toBe(false); // RED — goes GREEN in Plan 05
  });
  it("handles empty project gracefully", () => {
    expect(true).toBe(false);
  });
});
