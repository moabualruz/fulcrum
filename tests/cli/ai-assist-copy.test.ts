import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { run as runProduct } from "../../apps/cli/src/product.ts";

function testIo() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

describe("CLI AI Assist visible copy", () => {
  test("planning command errors do not expose internal protocol acronym", async () => {
    const productSource = await readFile("apps/cli/src/product.ts", "utf8");

    expect(productSource).toContain("guided-acp-start");
    expect(productSource).not.toContain("planning guided ACP start caller is not configured");
  });

  test("help copy uses AI Assist labels without protocol or chat leaks", async () => {
    const io = testIo();

    await runProduct(["help"], io.opts);

    const help = io.out.join("\n");
    expect(io.exits).toEqual([]);
    expect(help).toContain("AI Assist");
    expect(help).not.toMatch(/\bacp\b/i);
    expect(help).not.toMatch(/\bchat\b/i);
  });
});
