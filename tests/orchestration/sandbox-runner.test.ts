import { afterEach, describe, expect, test } from "bun:test";
import type { AgentProvider } from "@ai-hero/sandcastle";
import { runAgent, TRUST_BOUNDARY_WARNING } from "../../src/orchestration/sandbox-runner.ts";
import type { AgentRunRequest } from "../../src/orchestration/types.ts";

function echoAgent(): AgentProvider {
  return {
    name: "echo",
    env: {},
    captureSessions: false,
    buildPrintCommand: () => ({ command: "echo COMPLETE" }),
    parseStreamLine: (line) => [{ type: "text", text: line }],
  };
}

function request(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    runId: "run-1",
    worktree: {
      cwd: process.cwd(),
      branch: "agent/run-1",
    },
    agentProfile: {
      name: "echo",
      cliPath: "echo",
      defaultFlags: ["COMPLETE"],
      skillFolder: "",
      authEnvVars: [],
      sandcastleProvider: "noSandbox",
      maxIterations: 1,
      defaultTimeout: 30_000,
    },
    prompt: "say complete",
    contextBundle: { id: "ctx-1", files: [] },
    timeout: 30_000,
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.FULCRUM_KEEP_WORKTREE_ON_FAILURE;
  delete process.env.FULCRUM_MAX_TOKENS_PER_RUN;
});

describe("runAgent noSandbox happy path", () => {
  test("returns AgentRunResult shape, warns, and closes the worktree", async () => {
    const warnings: string[] = [];
    let closeCalls = 0;
    let sandboxTag: string | undefined;

    const result = await runAgent(request(), {
      createWorktree: async () => ({
        branch: "agent/run-1",
        worktreePath: "/tmp/fulcrum-agent-run",
        interactive: async (options) => {
          sandboxTag = options.sandbox?.tag;
          return { stdout: "COMPLETE\n", exitCode: 0 };
        },
        close: async () => {
          closeCalls += 1;
          return { removed: true };
        },
      }),
      logger: { warn: (message) => warnings.push(message) },
      agentProvider: echoAgent(),
      now: () => 1_000,
    });

    expect(result).toEqual({
      transcript: "COMPLETE\n",
      exitCode: 0,
      filesChanged: [],
      artifacts: [],
      durationMs: 0,
      iterationCount: 1,
      exitReason: "complete",
      tokenUsed: 1,
    });
    expect(warnings).toEqual([TRUST_BOUNDARY_WARNING]);
    expect(sandboxTag).toBe("none");
    expect(closeCalls).toBe(1);
  });

  test("preserves the worktree on failure when FULCRUM_KEEP_WORKTREE_ON_FAILURE=1", async () => {
    process.env.FULCRUM_KEEP_WORKTREE_ON_FAILURE = "1";
    let closeCalls = 0;

    await expect(runAgent(request(), {
      createWorktree: async () => ({
        branch: "agent/run-1",
        worktreePath: "/tmp/fulcrum-agent-run",
        interactive: async () => {
          throw new Error("agent failed");
        },
        close: async () => {
          closeCalls += 1;
          return { removed: true };
        },
      }),
      logger: { warn: () => undefined },
      agentProvider: echoAgent(),
      now: () => 1_000,
    })).rejects.toThrow("agent failed");

    expect(closeCalls).toBe(0);
  });
});

describe("runAgent iteration loop", () => {
  test("stops at agentProfile.maxIterations when COMPLETE never appears", async () => {
    const prompts: string[] = [];
    const patches: unknown[] = [];

    const result = await runAgent(request({
      agentProfile: {
        ...request().agentProfile,
        maxIterations: 3,
      },
    }), {
      createWorktree: async () => ({
        branch: "agent/run-1",
        worktreePath: "/tmp/fulcrum-agent-run",
        interactive: async (options) => {
          prompts.push(options.prompt);
          return { stdout: `turn ${prompts.length}\n`, exitCode: 0 };
        },
        close: async () => ({ removed: true }),
      }),
      logger: { warn: () => undefined },
      agentRunRepository: {
        updateSandcastleRun: async (_runId, patch) => {
          patches.push(patch);
        },
      },
      now: () => 1_000,
    });

    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain("Previous agent output");
    expect(result.iterationCount).toBe(3);
    expect(result.exitReason).toBe("max_iterations");
    expect(patches.at(-1)).toEqual({
      sandboxMode: "host",
      exitCode: 0,
      durationMs: 0,
      iterationCount: 3,
      exitReason: "max_iterations",
      tokenUsed: expect.any(Number),
    });
  });

  test("ignores COMPLETE in mid-content and stops only on standalone final line", async () => {
    const outputs = [
      "some text COMPLETE more text\n",
      "work finished\nCOMPLETE\n",
    ];
    let turns = 0;

    const result = await runAgent(request({
      agentProfile: {
        ...request().agentProfile,
        maxIterations: 5,
      },
    }), {
      createWorktree: async () => ({
        branch: "agent/run-1",
        worktreePath: "/tmp/fulcrum-agent-run",
        interactive: async () => ({ stdout: outputs[turns++] ?? "", exitCode: 0 }),
        close: async () => ({ removed: true }),
      }),
      logger: { warn: () => undefined },
      now: () => 1_000,
    });

    expect(turns).toBe(2);
    expect(result.iterationCount).toBe(2);
    expect(result.exitReason).toBe("complete");
  });

  test("stops complete on turn 2 of 10-cap run", async () => {
    const outputs = ["still working\n", "done\nCOMPLETE\n"];
    let turns = 0;

    const result = await runAgent(request({
      agentProfile: {
        ...request().agentProfile,
        maxIterations: 10,
      },
    }), {
      createWorktree: async () => ({
        branch: "agent/run-1",
        worktreePath: "/tmp/fulcrum-agent-run",
        interactive: async () => ({ stdout: outputs[turns++] ?? "", exitCode: 0 }),
        close: async () => ({ removed: true }),
      }),
      logger: { warn: () => undefined },
      now: () => 1_000,
    });

    expect(turns).toBe(2);
    expect(result.iterationCount).toBe(2);
    expect(result.exitReason).toBe("complete");
  });

  test("stops with token_cap when FULCRUM_MAX_TOKENS_PER_RUN is exceeded", async () => {
    process.env.FULCRUM_MAX_TOKENS_PER_RUN = "2";
    let turns = 0;

    const result = await runAgent(request({
      agentProfile: {
        ...request().agentProfile,
        maxIterations: 10,
      },
    }), {
      createWorktree: async () => ({
        branch: "agent/run-1",
        worktreePath: "/tmp/fulcrum-agent-run",
        interactive: async () => {
          turns += 1;
          return { stdout: "one two three\n", exitCode: 0 };
        },
        close: async () => ({ removed: true }),
      }),
      logger: { warn: () => undefined },
      now: () => 1_000,
    });

    expect(turns).toBe(1);
    expect(result.iterationCount).toBe(1);
    expect(result.exitReason).toBe("token_cap");
    expect(result.tokenUsed).toBe(3);
  });
});
