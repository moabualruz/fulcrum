import { describe, expect, test } from "bun:test";
import { computeCapacity } from "./capacity-helpers.ts";

describe("computeCapacity", () => {
  test("no capacity_points → percent and flags null/false", () => {
    const result = computeCapacity([3, 5], null);
    expect(result.used).toBe(8);
    expect(result.total).toBeNull();
    expect(result.percent).toBeNull();
    expect(result.overCapacity).toBe(false);
    expect(result.nearCapacity).toBe(false);
    expect(result.barClass).toBe("bg-green-500");
  });

  test("under 80% → green", () => {
    const result = computeCapacity([3, 2], 10);
    expect(result.used).toBe(5);
    expect(result.percent).toBe(50);
    expect(result.overCapacity).toBe(false);
    expect(result.nearCapacity).toBe(false);
    expect(result.barClass).toBe("bg-green-500");
  });

  test("at 81-100% → amber (near capacity)", () => {
    const result = computeCapacity([5, 4], 10);
    expect(result.used).toBe(9);
    expect(result.percent).toBe(90);
    expect(result.overCapacity).toBe(false);
    expect(result.nearCapacity).toBe(true);
    expect(result.barClass).toBe("bg-amber-400");
  });

  test("over 100% → red (over capacity)", () => {
    const result = computeCapacity([6, 7], 10);
    expect(result.used).toBe(13);
    expect(result.percent).toBe(130);
    expect(result.overCapacity).toBe(true);
    expect(result.nearCapacity).toBe(false);
    expect(result.barClass).toBe("bg-red-500");
  });

  test("null estimate_points treated as 0", () => {
    const result = computeCapacity([3, null, 2], 10);
    expect(result.used).toBe(5);
  });

  test("empty array → 0 used", () => {
    const result = computeCapacity([], 10);
    expect(result.used).toBe(0);
    expect(result.percent).toBe(0);
  });
});
