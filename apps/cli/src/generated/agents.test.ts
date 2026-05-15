import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgentsCommand } from "./agents.ts";

const originalLog = console.log;
const originalPath = process.env["PATH"];
const originalOpenAiKey = process.env["OPENAI_API_KEY"];

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(async () => {
  console.log = originalLog;
  restoreEnv("PATH", originalPath);
  restoreEnv("OPENAI_API_KEY", originalOpenAiKey);
  process.exitCode = 0;
});

describe("generated agent profile commands", () => {
  test("list-profiles returns registered profiles from the agent catalog", async () => {
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await runGeneratedAgentsCommand(["list-profiles", "--json"]);

    const profiles = JSON.parse(output.join("\n")) as Array<{ name: string }>;
    expect(profiles.map((profile) => profile.name).sort()).toEqual([
      "claude-code",
      "codex",
      "copilot",
      "gemini-cli",
      "opencode",
      "pi",
    ]);
  });

  test("get-profile returns a named profile without tRPC placeholders", async () => {
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await runGeneratedAgentsCommand(["get-profile", "--name", "codex", "--json"]);

    const profile = JSON.parse(output.join("\n")) as { name?: string; cliPath?: string };
    expect(profile).toMatchObject({ name: "codex", cliPath: "codex" });
  });

  test("get-profile reports unknown profiles as structured CLI errors", async () => {
    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    await runGeneratedAgentsCommand(["get-profile", "--name", "missing", "--json"]);

    expect(process.exitCode).toBe(1);
    const result = JSON.parse(output.join("\n")) as { error?: { code?: string; message?: string } };
    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.error?.message).toContain("missing");
  });

  test("test-profile returns runtime check shape for a registered profile", async () => {
    const binDir = await mkdtemp(join(tmpdir(), "fulcrum-agent-bin-"));
    await writeFile(join(binDir, "codex"), "#!/usr/bin/env sh\nexit 0\n");
    await chmod(join(binDir, "codex"), 0o755);
    process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;
    process.env["OPENAI_API_KEY"] = "test-key";

    const output: string[] = [];
    console.log = (line?: unknown) => {
      output.push(String(line));
    };

    try {
      await runGeneratedAgentsCommand(["test-profile", "--name", "codex", "--json"]);

      const result = JSON.parse(output.join("\n")) as { name?: string; passed?: boolean; testedAt?: string };
      expect(result.name).toBe("codex");
      expect(result.passed).toBe(true);
      expect(Number.isNaN(Date.parse(result.testedAt ?? ""))).toBe(false);
      expect(process.exitCode).toBe(0);
    } finally {
      await rm(binDir, { recursive: true, force: true });
    }
  });
});

async function runGeneratedAgentsCommand(args: string[]): Promise<void> {
  await createAgentsCommand().parseAsync(args, { from: "user" });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
