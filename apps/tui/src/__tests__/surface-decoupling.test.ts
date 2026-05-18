import { readdir, readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

const TUI_SRC_ROOT = new URL("../", import.meta.url);

describe("TUI surface decoupling", () => {
  test("production TUI source does not import server router packages", async () => {
    const files = await listTypeScriptFiles(TUI_SRC_ROOT);
    const serverRouterPath = ["@fulcrum", "server", "trpc"].join("/");
    const offenders: string[] = [];

    for (const file of files.filter((path) => !path.includes("/__tests__/"))) {
      const source = await readFile(file, "utf8");
      if (source.includes(serverRouterPath)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});

async function listTypeScriptFiles(root: URL): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (path.pathname.endsWith(".ts")) {
      files.push(path.pathname);
    }
  }

  return files;
}
