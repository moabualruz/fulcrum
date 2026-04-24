import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cliSource = readFileSync("apps/cli/src/main.ts", "utf8");

describe("CLI global flags", () => {
  it("declares contracted global flags", () => {
    for (const flag of [
      "--config <path>",
      "--project <projectId>",
      "--task <taskId>",
      "--run <runId>",
      "--local-only",
      "--preview",
      "--dry-run",
      "--yes",
      "--verbose",
      "--no-color"
    ]) {
      expect(cliSource).toContain(`.option("${flag}`);
    }
  });

  it("wires global context flags into policy-sensitive command input", () => {
    expect(cliSource).toContain("program.opts().localOnly");
    expect(cliSource).toContain("program.opts().project");
    expect(cliSource).toContain("program.opts().task");
    expect(cliSource).toContain("program.opts().run");
    expect(cliSource).toContain("program.opts().dryRun");
  });
});
