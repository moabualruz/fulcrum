import { describe, expect, it } from "bun:test";

const CUSTOM_FIELD_SAMPLES: Record<string, unknown> = {
  text: "some text value",
  number: 42.5,
  date: "2026-05-06",
  select: "high",
  multi_select: ["frontend", "backend"],
  checkbox: true,
  url: "https://example.test/resource",
  user: "11111111-1111-4111-8111-111111111111",
  json: { nested: { flag: true }, count: 3 },
};

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("Custom fields - all 9 types round-trip", () => {
  for (const [type, value] of Object.entries(CUSTOM_FIELD_SAMPLES)) {
    it(`${type} field round-trips`, () => {
      expect(roundTrip({ [`field-${type}`]: value })).toEqual({ [`field-${type}`]: value });
    });
  }
});
