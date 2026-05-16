// Round-trip tests for the tool-output router.
// Verifies the TS implementation produces output equivalent to the bash recipe
// for each tier on the same JSON envelope.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;
let POLICY: string;

const POLICY_TOML = `
[default]
tier = "leave-as-is"

[profiles.raw_then_head]
tier_under = "raw"
tier_over = "summary+head"
threshold_bytes = 100

[profiles.always_file]
tier = "file-only"

[tools.fd]
tier = "raw"

[tools.rg]
profile = "raw_then_head"
threshold_bytes = 50

profile = "always_file"

[tools.mise]
tier = "status-only"

[tools.kubectl]
tier = "summary+file"
`.trim();

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-router-"));
  POLICY = join(TMP, "tool-output-policy.toml");
  await Bun.write(POLICY, POLICY_TOML);
  process.env["FULCRUM_POLICY"] = POLICY;
  process.env["HOME"] = TMP; // state files land in $TMP/.fulcrum/state/
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

// Write envelope to a temp file; return path.
async function writeEnvFile(envelope: object): Promise<string> {
  const p = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(p, JSON.stringify(envelope));
  return p;
}

async function runRouterWith(envelope: object): Promise<{ stdout: string; exit: number; stderr: string }> {
  const json = JSON.stringify(envelope);
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, json);
  const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "hook", "router"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FULCRUM_POLICY: POLICY, HOME: TMP },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  if (stderr && process.env["FULCRUM_TEST_DEBUG"]) console.error("[test stderr]", stderr);
  return { stdout, exit, stderr };
}

describe("tool-output-router", () => {
  test("raw tier — small fd output unchanged", async () => {
    const env = {
      tool_name: "Bash",
      tool_input: { command: "fd -e ts" },
      tool_response: { stdout: "src/a.ts\nsrc/b.ts\n", exit_code: 0 },
    };
    const { stdout, exit } = await runRouterWith(env);
    expect(exit).toBe(0);
    expect(stdout).toBe("src/a.ts\nsrc/b.ts\n");
  });

  test("status-only tier — mise outputs just the exit", async () => {
    const env = {
      tool_name: "Bash",
      tool_input: { command: "mise install" },
      tool_response: { stdout: "tons\nof\noutput\n", stderr: "", exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout.startsWith("exit=0")).toBe(true);
    expect(stdout).not.toContain("tons");
  });

  test("summary+head tier — large rg output truncated to head", async () => {
    const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const env = {
      tool_name: "Bash",
      tool_input: { command: "rg foo" },
      tool_response: { stdout: big, exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).toContain("--- head ---");
    expect(stdout).toContain("line 0");
    expect(stdout).not.toContain("line 199");
    expect(stdout).toContain(`bytes=${big.length}`);
  });

  test("file-redirect tier — huge Bash output saved to file", async () => {
    const huge = "x".repeat(5000);
    const env = {
      tool_name: "Bash",
      tool_response: { stdout: huge, exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).not.toContain("xxxxxxxxxxxxxxxxxxxx");
    expect(stdout).toContain("file=");
    expect(stdout).toContain("bytes=5000");
  });

  test("leave-as-is — unknown tool passes through unchanged", async () => {
    const env = {
      tool_name: "Bash",
      tool_input: { command: "completely_unknown_tool foo" },
      tool_response: { stdout: "hello\n", exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).toBe("hello\n");
  });

  test("default policy — when tool not listed but [default] is leave-as-is", async () => {
    const env = {
      tool_name: "Bash",
      tool_input: { command: "no_such_thing_xx" },
      tool_response: { stdout: "preserved\n", exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).toBe("preserved\n");
  });

  test("kubectl — flat tier 'summary+file' applied regardless of size", async () => {
    const env = {
      tool_name: "Bash",
      tool_input: { command: "kubectl get pods" },
      tool_response: { stdout: "small output\n", exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).toContain("file=");
    expect(stdout).toContain("--- head ---");
  });

  test("Bash command extraction — pipelined first token wins", async () => {
    const env = {
      tool_name: "Bash",
      tool_input: { command: "fd -e ts | head" },
      tool_response: { stdout: "x\n", exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).toBe("x\n"); // routed as fd, which is "raw"
  });

  test("Pi proxy-shape mcp tool — normalised to mcp__deepwiki__ask_question, routed as raw", async () => {
    // Write a fresh policy file for this test to avoid mutation ordering issues.
    const piPolicy = join(TMP, "pi-ask-policy.toml");
    await Bun.write(piPolicy, POLICY_TOML + `\n[tools.mcp__deepwiki__ask_question]\ntier = "raw"\n`);

    const env = {
      tool_name: "mcp",
      tool_input: { server: "deepwiki", tool: "ask_question", input: { question: "what is this repo?" } },
      tool_response: { stdout: "This is a monorepo.\n", exit_code: 0 },
    };
    const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "hook", "router"], {
      stdin: Bun.file(await writeEnvFile(env)),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FULCRUM_POLICY: piPolicy, HOME: TMP },
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout).toBe("This is a monorepo.\n");
  });

  test("Pi proxy-shape mcp tool — routes read_wiki_contents to summary+file", async () => {
    const piPolicy = join(TMP, "pi-read-policy.toml");
    await Bun.write(piPolicy, POLICY_TOML + `\n[profiles.pi_summary_file]\ntier = "summary+file"\n[tools.mcp__deepwiki__read_wiki_contents]\nprofile = "pi_summary_file"\n`);

    const env = {
      tool_name: "mcp",
      tool_input: { server: "deepwiki", tool: "read_wiki_contents", input: {} },
      tool_response: { stdout: "a".repeat(500), exit_code: 0 },
    };
    const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "hook", "router"], {
      stdin: Bun.file(await writeEnvFile(env)),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FULCRUM_POLICY: piPolicy, HOME: TMP },
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout).toContain("file=");
    expect(stdout).toContain("--- head ---");
  });

  test("Pi proxy-shape mcp tool — unknown server falls through to leave-as-is", async () => {
    const env = {
      tool_name: "mcp",
      tool_input: { server: "unknown-server", tool: "some_tool" },
      tool_response: { stdout: "passthrough\n", exit_code: 0 },
    };
    const { stdout } = await runRouterWith(env);
    expect(stdout).toBe("passthrough\n");
  });
});
