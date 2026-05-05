import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";

import { listMissingTuiDomains } from "../../surfaces/parity.ts";

function extractNavLabels(source: string): string[] {
  return [...source.matchAll(/label:\s*["']([^"']+)["']/g)].map((match) => match[1] ?? "");
}

async function exists(path: URL): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("Phase 08 TUI parity inventory", () => {
  test("navigation labels cover every required Phase 08 domain", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf-8");
    const labels = extractNavLabels(source);

    expect(listMissingTuiDomains(labels)).toEqual([]);
  });

  test("required domain screen modules exist for navigation targets", async () => {
    const screens = [
      "projects.ts",
      "task-board.ts",
      "sprints.ts",
      "docs-tree-screen.ts",
      "memory-browser.ts",
      "runs.ts",
      "repos.ts",
      "artifacts.ts",
      "search-screen.ts",
      "notifications.ts",
      "skills.ts",
      "routing-rules.ts",
      "inference.ts",
      "doctor.ts",
      "auth.ts",
    ];
    const missing: string[] = [];

    for (const screen of screens) {
      if (!(await exists(new URL(`../screens/${screen}`, import.meta.url)))) {
        missing.push(screen);
      }
    }

    expect(missing).toEqual([]);
  });
});
