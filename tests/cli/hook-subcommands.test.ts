import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let scratch: string;
const repoRoot = process.cwd();
const cliEntry = join(repoRoot, "apps/cli/src/main.ts");

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runHook(
  name: string,
  input: string | object,
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exit: number }> {
  const stdinFile = join(scratch, `stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(stdinFile, typeof input === "string" ? input : JSON.stringify(input));
  const processEnv = {
    ...process.env,
    HOME: join(scratch, "home"),
    FULCRUM_HOME: join(scratch, "fulcrum-home"),
    CLAUDE_PROJECT_DIR: scratch,
    ...env,
  } as Record<string, string>;
  delete processEnv["FULCRUM_DEBUG"];

  const proc = Bun.spawn(["bun", cliEntry, "hook", name], {
    cwd: repoRoot,
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env: processEnv,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, stderr, exit };
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-hook-subcommands-"));
  await mkdir(join(scratch, "home"), { recursive: true });
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("fulcrum hook subcommands", () => {
  test("unknown hook command exits as usage error", async () => {
    const result = await runHook("nope", {});
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain("unknown hook recipe 'nope'");
  });

  test("malformed payload is reported once and hooks fail open", async () => {
    const result = await runHook("format", "{not-json");
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("fulcrum hook format: envelope parse failed (invalid JSON):");
  });

  test("pm-policy simulates pass and fail blocking semantics", async () => {
    await writeFile(join(scratch, "bun.lock"), "");

    const allowed = await runHook("pm-policy", {
      tool_name: "Bash",
      tool_input: { command: "bun install" },
    });
    expect(allowed.exit).toBe(0);
    expect(allowed.stderr).toBe("");

    const blocked = await runHook("pm-policy", {
      tool_name: "Bash",
      tool_input: { command: "npm install" },
    });
    expect(blocked.exit).toBe(2);
    expect(blocked.stderr).toContain("this repo uses bun");
  });

  test("lint-gate skips missing files without blocking", async () => {
    const result = await runHook("lint-gate", {
      tool_name: "Edit",
      tool_input: { file_path: join(scratch, "missing.ts") },
    });
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("tool-output-router bounds large output through summary tiers", async () => {
    const policy = join(scratch, "tool-output-policy.toml");
    await writeFile(policy, [
      "[default]",
      "tier = \"leave-as-is\"",
      "",
      "[tools.rg]",
      "tier = \"summary+head\"",
      "",
    ].join("\n"));
    const large = Array.from({ length: 80 }, (_, index) => `line-${index}`).join("\n");

    const result = await runHook("tool-output-router", {
      tool_name: "Bash",
      tool_input: { command: "rg token" },
      tool_response: { stdout: large, exit_code: 0 },
    }, { FULCRUM_POLICY: policy, FULCRUM_HEAD_LINES: "3" });

    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("exit=0");
    expect(result.stdout).toContain("--- head ---");
    expect(result.stdout).toContain("line-0");
    expect(result.stdout).toContain("line-2");
    expect(result.stdout).not.toContain("line-79");
  });

  test("audit-log writes shell command state instead of stdout noise", async () => {
    const result = await runHook("audit-log", {
      tool_name: "Bash",
      tool_input: { command: "bun test" },
      tool_response: { exit_code: 0 },
    });
    const log = join(scratch, "home", ".fulcrum", "state", scratch.split("/").at(-1)!, "shell-commands.log");

    expect(result.exit).toBe(0);
    expect(result.stdout).toBe("");
    expect(await exists(log)).toBe(true);
    expect(await readFile(log, "utf8")).toContain("bun test\t0");
  });
});
