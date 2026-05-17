import { describe, expect, it } from "bun:test";

import { cn } from "$lib/utils";

describe("cn", () => {
  it("filters out falsy class values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("de-duplicates conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
