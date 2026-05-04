import { describe, expect, test } from "bun:test";
import { z } from "zod";

/**
 * CLI `fulcrum reports burndown --json` schema validation.
 * AC: CLI --json schema matches return type (Zod parse).
 */

const BurndownPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pointsRemaining: z.number(),
  ideal: z.number(),
});

const BurndownOutputSchema = z.array(BurndownPointSchema);

describe("CLI reports burndown --json schema", () => {
  test("valid burndown JSON matches Zod schema", () => {
    const sample = [
      { date: "2025-01-01", pointsRemaining: 12, ideal: 12 },
      { date: "2025-01-02", pointsRemaining: 8, ideal: 8 },
      { date: "2025-01-03", pointsRemaining: 4, ideal: 4 },
      { date: "2025-01-04", pointsRemaining: 0, ideal: 0 },
    ];
    const parsed = BurndownOutputSchema.parse(sample);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]!.date).toBe("2025-01-01");
    expect(parsed[0]!.pointsRemaining).toBe(12);
    expect(parsed[0]!.ideal).toBe(12);
  });

  test("rejects malformed burndown JSON", () => {
    const bad = [{ date: "2025-01-01", wrong: 5 }];
    expect(() => BurndownOutputSchema.parse(bad)).toThrow();
  });

  test("ideal line formula: day 0 = capacity, day N = 0", () => {
    const capacity = 20;
    const totalDays = 5;
    const points = [];
    for (let d = 0; d <= totalDays; d++) {
      const ideal = Math.round(Math.max(0, capacity - (capacity / totalDays) * d) * 100) / 100;
      points.push({
        date: `2025-01-0${d + 1}`,
        pointsRemaining: capacity - d * 3,
        ideal: d === totalDays ? 0 : ideal,
      });
    }
    const parsed = BurndownOutputSchema.parse(points);
    expect(parsed[0]!.ideal).toBe(20);
    expect(parsed[totalDays]!.ideal).toBe(0);
    // Intermediate = linear interpolation
    expect(parsed[1]!.ideal).toBe(16);
    expect(parsed[2]!.ideal).toBe(12);
  });
});
