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
    patch: {
      sandboxMode: "host";
      exitCode: number;
      durationMs: number;
      iterationCount: number;
      exitReason: AgentRunResult["exitReason"];
      tokenUsed: number;
    },
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
      const agent = deps.agentProvider ?? agentProviderFromProfile(req.agentProfile);
      const maxIterations = req.opts?.maxIterations ?? req.agentProfile.maxIterations;
      const maxTokens = maxTokensPerRun();
      const outputs: string[] = [];
      let tokenUsed = 0;
      let exitCode = 0;
      let exitReason: AgentRunResult["exitReason"] = "max_iterations";

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const interactiveResult = await worktree.interactive({
          agent,
          sandbox,
          prompt: promptForIteration(req.prompt, req.contextBundle, outputs),
          name: req.runId,
          env: req.opts?.env,
          signal: controller.signal,
        });
        const transcript = transcriptFromInteractiveResult(interactiveResult);
        outputs.push(transcript);
        tokenUsed += countTokens(transcript);
        exitCode = interactiveResult.exitCode ?? 0;

        if (tokenUsed > maxTokens) {
          exitReason = "token_cap";
          break;
        }

        if (hasStandaloneFinalCompleteLine(transcript)) {
          exitReason = "complete";
          break;
        }
      }

      const durationMs = Math.max(0, now() - startedAt);
      const result: AgentRunResult = {
        transcript: outputs.join(""),
        exitCode,
        filesChanged: [],
        artifacts: [],
        durationMs,
        iterationCount: outputs.length,
        exitReason,
        tokenUsed,
      };
      if (req.runId) {
        await deps.agentRunRepository?.updateSandcastleRun?.(req.runId, {
          sandboxMode: "host",
          exitCode: result.exitCode,
          durationMs,
          iterationCount: result.iterationCount,
          exitReason: result.exitReason,
          tokenUsed,
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

function promptForIteration(
  basePrompt: string,
  contextBundle: unknown,
  previousOutputs: readonly string[],
): string {
  if (previousOutputs.length === 0) {
    return basePrompt;
  }

  return [
    basePrompt,
    "",
    "Context bundle:",
    JSON.stringify(contextBundle, null, 2),
    "",
    "Previous agent output:",
    previousOutputs.at(-1) ?? "",
    "",
    "Continue. Finish by putting COMPLETE alone on the final non-empty line.",
  ].join("\n");
}

function hasStandaloneFinalCompleteLine(transcript: string): boolean {
  const finalLine = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  return finalLine === "COMPLETE";
}

function maxTokensPerRun(): number {
  const value = Number(process.env.FULCRUM_MAX_TOKENS_PER_RUN ?? "200000");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200000;
}

function countTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}
