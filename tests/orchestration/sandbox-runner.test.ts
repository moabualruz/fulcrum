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
