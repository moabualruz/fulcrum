import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("CLI AI Assist visible copy", () => {
  test("planning command errors do not expose internal protocol acronym", async () => {
    const productSource = await readFile("apps/cli/src/product.ts", "utf8");

    expect(productSource).toContain("guided-acp-start");
    expect(productSource).not.toContain("planning guided ACP start caller is not configured");
  });
});
