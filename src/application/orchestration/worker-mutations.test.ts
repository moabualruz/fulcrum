import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workerFiles = [
  "src/orchestration/symphony/orchestrator.ts",
  "src/orchestration/symphony/retry.ts",
];

describe("worker orchestration mutations", () => {
  test("worker state changes call application orchestration commands", async () => {
    for (const file of workerFiles) {
      const source = await readFile(file, "utf8");
      expect(source).toContain("../../application/orchestration/commands.ts");
      expect(source).not.toMatch(/nativeUpdate\(/);
    }
  });

  test("notification defaults use repositories instead of raw connection execute", async () => {
    const source = await readFile("src/notifications/defaults.ts", "utf8");
    expect(source).not.toContain("getConnection().execute");
  });
});
