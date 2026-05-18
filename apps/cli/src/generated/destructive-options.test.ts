import { describe, expect, test } from "bun:test";

import { createArtifactsCommand } from "./artifacts.ts";
import { createCredentialsCommand } from "./credentials.ts";

function normalizeHelp(help: string): string {
  return help.replace(/\s+/g, " ");
}

describe("generated destructive CLI options", () => {
  test("artifact hard delete advertises explicit confirmation token", () => {
    const root = createArtifactsCommand();
    const deleteHelp = root.commands.find((command) => command.name() === "delete")?.helpInformation() ?? "";

    expect(deleteHelp).toContain("--hard");
    expect(deleteHelp).toContain("--id <string>");
    expect(deleteHelp).toContain("--confirm <string>");
    expect(normalizeHelp(deleteHelp)).toContain("must match artifact identifier");
  });

  test("credential destructive and secret-changing commands advertise confirmation tokens without sample secrets", () => {
    const root = createCredentialsCommand();
    const helps = new Map(root.commands.map((command) => [command.name(), command.helpInformation()]));

    for (const name of ["archive", "remove", "rotate", "set"]) {
      expect(helps.get(name)).toContain("--confirm <string>");
      expect(normalizeHelp(helps.get(name) ?? "")).toContain("must match credential name");
    }
    expect(helps.get("rotate")).toContain("--new-value <string>");
    expect([...helps.values()].join("\n")).not.toContain("plain-secret");
  });
});
