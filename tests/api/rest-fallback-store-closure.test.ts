import { describe, expect, it } from "bun:test";
import { access } from "node:fs/promises";

const LEGACY_ROUTE_FILES = [
  "apps/server/src/api/routes/kernel-tasks.ts",
  "apps/server/src/api/routes/tasks.ts",
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("REST fallback store closure", () => {
  it("task REST routes no longer live in route-local Hono fallback files", async () => {
    for (const path of LEGACY_ROUTE_FILES) {
      expect(await fileExists(path), path).toBe(false);
    }
  });
});
