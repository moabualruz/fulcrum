import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cliSource = readFileSync(path.resolve("apps/cli/src/main.ts"), "utf8");

describe("full SRS CLI command coverage", () => {
  it("wires every SRS command group and compatibility alias", () => {
    const requiredCommands = [
      'command("setup")',
      'command("setup:preview")',
      'command("setup:apply")',
      'command("doctor")',
      'command("repair")',
      'command("uninstall")',
      'command("project")',
      'command("add <path>")',
      'command("show <project>")',
      'command("doctor <project>")',
      'command("config <project>")',
      'command("plane")',
      'command("task")',
      'command("show <taskId>")',
      'command("claim <taskId>")',
      'command("status <taskId> <status>")',
      'command("assign <taskId>")',
      'command("context")',
      'command("code")',
      'command("structural <pattern>")',
      'command("repomap")',
      'command("repomix")',
      'command("memory")',
      'command("writeback <runId>")',
      'command("open <memoryId>")',
      'command("run")',
      'command("summarize <runId>")',
      'command("complete <runId>")',
      'command("worktree")',
      'command("gate")',
      'command("artifact")',
      'command("backup")',
      'command("restore <backupId>")',
      'command("export")',
      'command("rebuild")'
    ];

    for (const command of requiredCommands) {
      expect(cliSource, command).toContain(command);
    }
  });
});
