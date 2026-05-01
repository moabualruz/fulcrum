import { describe, expect, test } from "bun:test";

import { scoreCommand } from "./score";

describe("scoreCommand", () => {
  test("exact case-insensitive match beats prefix match", () => {
    expect(scoreCommand("Open project", "open project")).toBeGreaterThan(
      scoreCommand("Open project", "open p"),
    );
  });

  test("prefix match beats subsequence match", () => {
    expect(scoreCommand("Open project", "Op p")).toBeGreaterThan(
      scoreCommand("Open project", "n p"),
    );
  });

  test("subsequence match beats miss", () => {
    expect(scoreCommand("Open project", "Opn")).toBeGreaterThan(0);
    expect(scoreCommand("Open project", "xyz")).toBe(0);
  });

  test("miss returns 0", () => {
    expect(scoreCommand("Open project", "zzz")).toBe(0);
  });

  test("empty query returns 0", () => {
    expect(scoreCommand("Open project", "")).toBe(0);
  });

  test("empty label returns 0 for non-empty query", () => {
    expect(scoreCommand("", "open")).toBe(0);
  });

  test("case insensitivity — uppercase query matches lowercase label", () => {
    expect(scoreCommand("Open Project", "OPEN")).toBeGreaterThan(0);
    expect(scoreCommand("Open Project", "OPEN")).toBe(
      scoreCommand("Open Project", "open"),
    );
  });

  test("prefix on a very long label still beats best subsequence", () => {
    // Regression: prefix score must clamp at PREFIX_BASE - PREFIX_TAPER_MAX
    // (= 401) so it never falls below subsequence ceiling (~100 + bonus).
    const longLabel = "a" + "z".repeat(800);
    const prefixScore = scoreCommand(longLabel, "a");
    const subseqLabel = "qwerty asdfgh zxcvbn";
    const subseqScore = scoreCommand(subseqLabel, "qaz");
    expect(prefixScore).toBeGreaterThan(subseqScore);
    expect(prefixScore).toBeGreaterThanOrEqual(401);
  });

  test("consecutive subsequence bonus rewards adjacent letters", () => {
    // "Opn" — O,p consecutive then n directly after p (positions 0,1,3 — gap of 1)
    // "Opt" — O,p consecutive then t much later (positions 0,1,7 — gap of 5)
    expect(scoreCommand("Open project", "Opn")).toBeGreaterThan(
      scoreCommand("Open project", "Opt"),
    );
  });
});
