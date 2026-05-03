import {
  createWorktree as sandcastleCreateWorktree,
  type AgentProvider,
} from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import type { AgentRunRequest, AgentRunResult } from "./types.ts";

export const SANDCASTLE_API_VERSION = "0.5.6";

export const TRUST_BOUNDARY_WARNING =
  "FULCRUM TRUST BOUNDARY: noSandbox runs the agent directly on the host with no isolation.";

interface Logger {
  warn(message: string): void;
}

interface WorktreeHandle {
  readonly branch: string;
  readonly worktreePath: string;
  interactive(options: {
    readonly agent: AgentProvider;
    readonly sandbox?: ReturnType<typeof noSandbox>;
    readonly prompt: string;
    readonly name?: string;
    readonly env?: Record<string, string>;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly stdout?: string;
    readonly exitCode?: number;
    readonly commits?: readonly { readonly sha: string }[];
  }>;
  close(): Promise<unknown>;
}

interface AgentRunRepositoryLike {
  updateSandcastleRun?(
    runId: string,
    patch: { sandboxMode: "host"; exitCode: number; durationMs: number },
  ): Promise<void>;
}

export interface SandboxRunnerDeps {
  readonly createWorktree?: (options: {
    readonly branchStrategy: { readonly type: "branch"; readonly branch: string };
    readonly cwd?: string;
    readonly copyToWorktree?: readonly string[];
  }) => Promise<WorktreeHandle>;
  readonly logger?: Logger;
  readonly agentProvider?: AgentProvider;
  readonly now?: () => number;
  readonly agentRunRepository?: AgentRunRepositoryLike;
}

const defaultLogger: Logger = console;

export async function runAgent(
  req: AgentRunRequest,
  deps: SandboxRunnerDeps = {},
): Promise<AgentRunResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const logger = deps.logger ?? defaultLogger;
  const createWorktree = deps.createWorktree ?? sandcastleCreateWorktree;
  const branch = req.worktree.branch ?? `agent/${req.runId ?? crypto.randomUUID()}`;
  const worktree = await createWorktree({
    branchStrategy: { type: "branch", branch },
    cwd: req.worktree.cwd,
    copyToWorktree: req.worktree.copyToWorktree,
  });
  let failed = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("agent run timed out")), req.timeout);
    try {
      logger.warn(TRUST_BOUNDARY_WARNING);
      const sandbox = noSandbox();
      const interactiveResult = await worktree.interactive({
        agent: deps.agentProvider ?? agentProviderFromProfile(req.agentProfile),
        sandbox,
        prompt: req.prompt,
        name: req.runId,
        env: req.opts?.env,
        signal: controller.signal,
      });
      const durationMs = Math.max(0, now() - startedAt);
      const result: AgentRunResult = {
        transcript: transcriptFromInteractiveResult(interactiveResult),
        exitCode: interactiveResult.exitCode ?? 0,
        filesChanged: [],
        artifacts: [],
        durationMs,
        iterationCount: 1,
      };
      if (req.runId) {
        await deps.agentRunRepository?.updateSandcastleRun?.(req.runId, {
          sandboxMode: "host",
          exitCode: result.exitCode,
          durationMs,
        });
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!failed || process.env.FULCRUM_KEEP_WORKTREE_ON_FAILURE !== "1") {
      await worktree.close();
    }
  }
}

function agentProviderFromProfile(profile: AgentRunRequest["agentProfile"]): AgentProvider {
  return {
    name: profile.name,
    env: {},
    captureSessions: false,
    buildPrintCommand: ({ prompt }) => ({
      command: [profile.cliPath, ...profile.defaultFlags, prompt].map(shellQuote).join(" "),
    }),
    parseStreamLine: (line) => [{ type: "text", text: line }],
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function transcriptFromInteractiveResult(result: unknown): string {
  if (
    typeof result === "object" &&
    result !== null &&
    "stdout" in result &&
    typeof result.stdout === "string"
  ) {
    return result.stdout;
  }
  return "";
}
