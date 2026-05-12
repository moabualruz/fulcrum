import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  disableHookRecipe,
  enableHookRecipe,
  isRecipeName,
  removeAllHookRegistrations,
  run,
} from "../../apps/cli/src/hooks.ts";
import type { AgentId } from "../../apps/cli/src/mcp-registry.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;
let previousRepoDir: string | undefined;

const allAgents = new Set<AgentId>(["claude-code", "codex", "gemini", "opencode", "pi"]);

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function captureRun(args: string[]): Promise<{ stdout: string; stderr: string; exits: number[] }> {
  let stdout = "";
  let stderr = "";
  const exits: number[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWrite = process.stdout.write;
  const originalExit = process.exit;
  console.log = (...parts: unknown[]) => { stdout += `${parts.map(String).join(" ")}\n`; };
  console.error = (...parts: unknown[]) => { stderr += `${parts.map(String).join(" ")}\n`; };
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((code?: string | number | null) => {
    exits.push(typeof code === "number" ? code : Number(code ?? 0));
    throw new Error(`process.exit(${exits.at(-1)})`);
  }) as typeof process.exit;
  try {
    await run(args);
  } catch (error) {
    if (!String((error as Error).message).startsWith("process.exit(")) throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalWrite;
    process.exit = originalExit;
  }
  return { stdout, stderr, exits };
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-hooks-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  previousRepoDir = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
  await mkdir(process.env["HOME"]!, { recursive: true });
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  if (previousRepoDir === undefined) delete process.env["FULCRUM_REPO_DIR"];
  else process.env["FULCRUM_REPO_DIR"] = previousRepoDir;
  await rm(scratch, { recursive: true, force: true });
});

describe("hooks CLI source command", () => {
  it("validates recipe names and lists marker state as JSON and text", async () => {
    expect(isRecipeName("format")).toBe(true);
    expect(isRecipeName("wat")).toBe(false);

    await mkdir(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled"), { recursive: true });
    await writeFile(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled", "format"), "");

    const json = await captureRun(["list", "--json"]);
    const recipes = JSON.parse(json.stdout) as Array<{ name: string; enabled: boolean }>;
    expect(recipes.find((recipe) => recipe.name === "format")?.enabled).toBe(true);
    expect(recipes.find((recipe) => recipe.name === "lint-gate")?.enabled).toBe(false);

    const text = await captureRun(["list"]);
    expect(text.stdout).toContain("Available hooks");
    expect(text.stdout).toContain("1 of 8 marked enabled");
  });

  it("enables and disables JSON and TypeScript hook registrations for all agent surfaces", async () => {
    const home = process.env["HOME"]!;

    await enableHookRecipe("pm-policy", allAgents);

    const claude = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
    expect(claude.hooks.PreToolUse[0].hooks[0].command).toBe("fulcrum hook pm-policy");

    const codex = JSON.parse(await readFile(join(home, ".codex", "hooks.json"), "utf8"));
    expect(codex.hooks.PreToolUse[0].hooks[0].command).toBe("fulcrum hook pm-policy");

    const gemini = JSON.parse(await readFile(join(home, ".gemini", "settings.json"), "utf8"));
    expect(gemini.hooks.BeforeTool[0].command).toBe("fulcrum hook pm-policy");

    const opencode = await readFile(join(home, ".config", "opencode", "plugins", "fulcrum-pm-policy.ts"), "utf8");
    expect(opencode).toContain("tool.execute.before");

    const pi = await readFile(join(home, ".pi", "agent", "extensions", "fulcrum-pm-policy.ts"), "utf8");
    expect(pi).toContain("tool_call");
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled", "pm-policy"))).toBe(true);

    await disableHookRecipe("pm-policy", allAgents);

    expect(await exists(join(home, ".claude", "settings.json"))).toBe(false);
    expect(await exists(join(home, ".codex", "hooks.json"))).toBe(false);
    expect(await exists(join(home, ".gemini", "settings.json"))).toBe(false);
    expect(await exists(join(home, ".config", "opencode", "plugins", "fulcrum-pm-policy.ts"))).toBe(false);
    expect(await exists(join(home, ".pi", "agent", "extensions", "fulcrum-pm-policy.ts"))).toBe(false);
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled", "pm-policy"))).toBe(false);
  });

  it("updates existing configs conservatively and skips malformed JSON", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "hooks.json"), JSON.stringify({
      keep: true,
      hooks: {
        PostToolUse: [
          { hooks: [{ type: "command", command: "fulcrum hook format" }] },
          { hooks: [{ type: "command", command: "custom hook" }] },
        ],
      },
    }, null, 2));

    await enableHookRecipe("format", new Set(["codex"]));
    const enabled = JSON.parse(await readFile(join(home, ".codex", "hooks.json"), "utf8"));
    expect(enabled.keep).toBe(true);
    expect(enabled.hooks.PostToolUse).toHaveLength(2);
    expect(enabled.hooks.PostToolUse.filter((entry: any) => entry.hooks?.[0]?.command === "fulcrum hook format")).toHaveLength(1);

    await writeFile(join(home, ".codex", "hooks.json"), "not json");
    const result = await captureRun(["enable", "format", "--all"]);
    expect(result.stdout).toContain("Codex CLI config is not valid JSON");
    expect(await readFile(join(home, ".codex", "hooks.json"), "utf8")).toBe("not json");
  });

  it("skips JSON configs whose hooks block or event arrays have the wrong shape", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });

    await writeFile(join(home, ".claude", "settings.json"), JSON.stringify({ hooks: [] }));
    const badRoot = await captureRun(["enable", "format", "--all"]);
    expect(badRoot.stdout).toContain("Claude Code hooks block is not an object");
    expect(JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8")).hooks).toEqual([]);

    await writeFile(join(home, ".gemini", "settings.json"), JSON.stringify({ hooks: { AfterTool: {} } }));
    const badEvent = await captureRun(["enable", "format", "--all"]);
    expect(badEvent.stdout).toContain("Gemini CLI AfterTool hooks are not an array");
    expect(JSON.parse(await readFile(join(home, ".gemini", "settings.json"), "utf8")).hooks.AfterTool).toEqual({});
  });

  it("renders every TypeScript hook recipe for OpenCode and Pi with the expected command wiring", async () => {
    const home = process.env["HOME"]!;
    const recipes = [
      "format",
      "lint-gate",
      "pm-policy",
      "test-on-edit",
      "audit-log",
      "index-check",
      "index-rebuild",
      "tool-output-router",
    ] as const;

    for (const recipe of recipes) {
      await enableHookRecipe(recipe, new Set(["opencode", "pi"]));
      const openCode = await readFile(join(home, ".config", "opencode", "plugins", `fulcrum-${recipe}.ts`), "utf8");
      const pi = await readFile(join(home, ".pi", "agent", "extensions", `fulcrum-${recipe}.ts`), "utf8");
      expect(openCode).toContain(`fulcrum hook ${recipe}`);
      expect(pi).toContain(`fulcrum hook ${recipe}`);
    }

    expect(await readFile(join(home, ".config", "opencode", "plugins", "fulcrum-lint-gate.ts"), "utf8")).toContain("violations - fix before continuing");
    expect(await readFile(join(home, ".config", "opencode", "plugins", "fulcrum-index-check.ts"), "utf8")).toContain("session.created");
    expect(await readFile(join(home, ".config", "opencode", "plugins", "fulcrum-index-rebuild.ts"), "utf8")).toContain("session.idle");
    expect(await readFile(join(home, ".pi", "agent", "extensions", "fulcrum-pm-policy.ts"), "utf8")).toContain("tool_call");
    expect(await readFile(join(home, ".pi", "agent", "extensions", "fulcrum-index-rebuild.ts"), "utf8")).toContain("session_shutdown");
  });

  it("writes, deduplicates, and removes direct Gemini hook registrations", async () => {
    const home = process.env["HOME"]!;
    await enableHookRecipe("audit-log", new Set(["gemini"]));
    await enableHookRecipe("audit-log", new Set(["gemini"]));

    const enabled = JSON.parse(await readFile(join(home, ".gemini", "settings.json"), "utf8"));
    expect(enabled.hooks.AfterTool).toEqual([{ type: "command", command: "fulcrum hook audit-log" }]);

    await writeFile(join(home, ".gemini", "settings.json"), JSON.stringify({
      keep: true,
      hooks: {
        AfterTool: [
          { type: "command", command: "fulcrum hook audit-log" },
          { type: "command", command: "custom hook" },
        ],
      },
    }, null, 2));

    await disableHookRecipe("audit-log", new Set(["gemini"]));
    const disabled = JSON.parse(await readFile(join(home, ".gemini", "settings.json"), "utf8"));
    expect(disabled).toEqual({
      keep: true,
      hooks: {
        AfterTool: [{ type: "command", command: "custom hook" }],
      },
    });
  });

  it("run enable/disable validates arguments, writes markers, and prints snippets", async () => {
    const missing = await captureRun(["enable"]);
    expect(missing.stderr).toContain("usage: fulcrum hooks enable");
    expect(missing.exits).toEqual([2]);

    const unknown = await captureRun(["disable", "nope"]);
    expect(unknown.stderr).toContain("unknown recipe");
    expect(unknown.exits).toEqual([2]);

    const enabled = await captureRun(["enable", "format", "--all"]);
    expect(enabled.stdout).toContain("Marked enabled");
    expect(enabled.stdout).toContain("Registration snippet");
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled", "format"))).toBe(true);

    const disabled = await captureRun(["disable", "format", "--all"]);
    expect(disabled.stdout).toContain("Marked disabled");
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled", "format"))).toBe(false);

    const bad = await captureRun(["wat"]);
    expect(bad.stderr).toContain("unknown subcommand");
    expect(bad.exits).toEqual([2]);
  });

  it("removeAllHookRegistrations supports dry-run and detected-agent cleanup", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await enableHookRecipe("audit-log", new Set(["codex"]));

    await removeAllHookRegistrations({ dryRun: true });
    expect(await exists(join(home, ".codex", "hooks.json"))).toBe(true);

    await removeAllHookRegistrations();
    expect(await exists(join(home, ".codex", "hooks.json"))).toBe(false);
  });
});
