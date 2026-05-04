import { describe, expect, test } from "bun:test";

import {
  rankMemoryMatches,
  recencyBoostForDate,
  type MemoryRankInput,
} from "../../src/memory/retrieval/scoring.ts";

const NOW = new Date("2026-05-03T12:00:00.000Z");

describe("memory retriever BM25 ranking", () => {
  test("BM25 rewards repeated query terms over single matches", () => {
    const rows = rankMemoryMatches("alpha", [
      memory("single", "alpha beta gamma"),
      memory("repeated", "alpha alpha alpha beta"),
    ], { now: NOW });

    expect(ids(rows)).toEqual(["repeated", "single"]);
    expect(rows.at(0)?.textRank).toBeGreaterThan(rows.at(1)?.textRank ?? 0);
  });

  test("recency decay gives current memory a larger boost than 60-day-old memory", () => {
    const current = recencyBoostForDate(NOW, NOW);
    const stale = recencyBoostForDate(daysAgo(60), NOW);

    expect(current).toBeCloseTo(1, 6);
    expect(stale).toBeCloseTo(Math.exp(-2), 6);
    expect(current).toBeGreaterThan(stale);
  });

  test("importance weighting adds one point for high memories only", () => {
    const rows = rankMemoryMatches("marker", [
      memory("medium", "marker", { importance: "medium" }),
      memory("high", "marker", { importance: "high" }),
      memory("low", "marker", { importance: "low" }),
    ], { now: NOW });

    const byId = new Map(rows.map((row) => [row.memory.id, row]));

    expect(byId.get("high")?.importanceBoost).toBe(1);
    expect(byId.get("medium")?.importanceBoost).toBe(0);
    expect(byId.get("low")?.importanceBoost).toBe(0);
    expect(rows.at(0)?.memory.id).toBe("high");
  });

  test("combined ranking sums BM25, recency, and importance before sorting", () => {
    const rows = rankMemoryMatches("theta sigma rho lambda", [
      memory("older-heavy-text", "theta sigma rho lambda sigma rho lambda", {
        createdAt: daysAgo(90),
        importance: "medium",
      }),
      memory("fresh-high", "theta sigma rho lambda", {
        createdAt: daysAgo(0),
        importance: "high",
      }),
      memory("fresh-medium", "theta", {
        createdAt: daysAgo(0),
        importance: "medium",
      }),
    ], { now: NOW });

    expect(ids(rows)).toEqual(["fresh-high", "older-heavy-text", "fresh-medium"]);
    for (const row of rows) {
      expect(row.score).toBeCloseTo(
        row.textRank + row.recencyBoost + row.importanceBoost,
        6,
      );
    }
  });
});

function memory(
  id: string,
  body: string,
  overrides: Partial<MemoryRankInput> = {},
): MemoryRankInput {
  return {
    id,
    body,
    createdAt: NOW,
    importance: "medium",
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function ids(rows: ReturnType<typeof rankMemoryMatches>): string[] {
  return rows.map((row) => row.memory.id);
}
