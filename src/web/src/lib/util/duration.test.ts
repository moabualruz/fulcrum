import { describe, expect, test } from "bun:test";
import { formatDuration } from "./duration.ts";

describe("formatDuration", () => {
  test("returns '—' when end is null", () => {
    expect(formatDuration("2026-01-01T00:00:00Z", null)).toBe("—");
  });

  test("formats sub-minute durations as <s>s", () => {
    expect(
      formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:45Z"),
    ).toBe("45s");
  });

  test("zero-second window formats as 0s", () => {
    expect(
      formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ).toBe("0s");
  });

  test("formats sub-hour durations as <m>m <s>s", () => {
    expect(
      formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:05:09Z"),
    ).toBe("5m 9s");
  });

  test("formats sub-day durations as <h>h <m>m", () => {
    expect(
      formatDuration("2026-01-01T00:00:00Z", "2026-01-01T01:05:00Z"),
    ).toBe("1h 5m");
  });

  test("formats 2h 13m exact", () => {
    expect(
      formatDuration("2026-01-01T00:00:00Z", "2026-01-01T02:13:42Z"),
    ).toBe("2h 13m");
  });

  test("formats multi-day durations as <d>d <h>h", () => {
    expect(
      formatDuration("2026-01-01T00:00:00Z", "2026-01-03T05:30:00Z"),
    ).toBe("2d 5h");
  });
});
