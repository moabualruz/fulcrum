import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("TUI surface decoupling", () => {
  test("production TUI source does not import server router packages", async () => {
    const files = await listTypeScriptFiles("apps/tui/src");
    const serverRouterPath = ["@fulcrum", "server", "trpc"].join("/");
    const offenders: string[] = [];

    for (const file of files.filter((path) => !path.includes("/__tests__/"))) {
      const source = await readFile(file, "utf8");
      if (source.includes(serverRouterPath)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}
