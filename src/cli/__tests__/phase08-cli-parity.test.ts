import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { listMissingCliDomains } from "../../surfaces/parity.ts";

function extractCaseLabels(source: string): string[] {
  return [...source.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map((match) => match[1] ?? "");
}

describe("Phase 08 CLI parity inventory", () => {
  test("top-level CLI dispatch covers every required domain or compatibility wrapper", async () => {
    const [rootSource, productSource] = await Promise.all([
      readFile(new URL("../../index.ts", import.meta.url), "utf-8"),
      readFile(new URL("../index.ts", import.meta.url), "utf-8"),
    ]);
    const dispatchCases = [
      ...extractCaseLabels(rootSource),
      ...extractCaseLabels(productSource),
    ];

    expect(listMissingCliDomains(dispatchCases)).toEqual([]);
  });

  test("src/cli/index.ts has direct or delegated cases for Phase 08 command domains", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf-8");

    expect(source).toContain('case "tasks"');
    expect(source).toContain('case "docs"');
    expect(source).toContain('case "repos"');
    expect(source).toContain('case "runs"');
    expect(source).toContain('case "notify"');
  });
});
