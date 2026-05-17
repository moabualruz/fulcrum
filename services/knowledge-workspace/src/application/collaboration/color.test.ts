import { describe, expect, test } from "bun:test";
import { userColor } from "./color.ts";

describe("userColor", () => {
  test("returns valid HSL string", () => {
    const c = userColor("user-1");
    expect(c).toMatch(/^hsl\(\d+, 70%, 50%\)$/);
  });

  test("same userId → same colour (deterministic)", () => {
    expect(userColor("alice")).toBe(userColor("alice"));
  });

  test("different userIds → different colours (probabilistic)", () => {
    // Not guaranteed but extremely unlikely to collide for short distinct IDs
    expect(userColor("alice")).not.toBe(userColor("bob"));
  });
});
