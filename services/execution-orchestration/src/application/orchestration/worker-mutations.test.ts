import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workerFiles = [
  "services/execution-orchestration/src/infrastructure/agent-runtime/symphony/orchestrator.ts",
  "services/execution-orchestration/src/infrastructure/agent-runtime/symphony/retry.ts",
];

describe("worker orchestration mutations", () => {
  test("worker state changes call application orchestration commands", async () => {
    for (const file of workerFiles) {
      const source = await readFile(file, "utf8");
      expect(source).toContain("@execution-orchestration/application/orchestration/commands.ts");
      expect(source).not.toMatch(/nativeUpdate\(/);
    }
  });

  test("notification defaults use repositories instead of raw connection execute", async () => {
    const source = await readFile("services/notification-center/src/application/delivery-runtime/defaults.ts", "utf8");
    expect(source).not.toContain("getConnection().execute");
  });
});
