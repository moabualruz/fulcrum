import { describe, expect, test } from "bun:test";
import { createSprintsCommand } from "./sprints.ts";

describe("CLI sprints command", () => {
  test("get subcommand accepts --active flag", () => {
    const cmd = createSprintsCommand();
    const getCmd = cmd.commands.find((c) => c.name() === "get");
    expect(getCmd).toBeDefined();

    const optionNames = getCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--active");
    expect(optionNames).toContain("--project");
  });

  test("get subcommand accepts --id flag", () => {
    const cmd = createSprintsCommand();
    const getCmd = cmd.commands.find((c) => c.name() === "get");
    expect(getCmd).toBeDefined();

    const optionNames = getCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--id");
  });
});
