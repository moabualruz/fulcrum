import {
  createWorktree as sandcastleCreateWorktree,
  type AgentProvider,
  type AnySandboxProvider,
  type IsolatedSandboxProvider,
} from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { podman } from "@ai-hero/sandcastle/sandboxes/podman";
import type { AgentRunRequest, AgentRunResult } from "./types.ts";
import {
  TranscriptWriter,
  captureWorkspaceDiff,
  maxTranscriptSize,
} from "./transcript-diff.ts";
import {
  matchArtifactGlob,
  extractArtifacts,
  DEFAULT_ARTIFACT_GLOB,
} from "./artifact-harvest-hook.ts";
import {
  harvestArtifacts,
  type HarvestArtifactDeps,
} from "../artifacts/harvest.ts";

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
    readonly sandbox?: SandboxProvider;
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
      sandboxMode: "host" | "docker" | "podman";
      exitCode: number;
      durationMs: number;
      iterationCount: number;
      exitReason: AgentRunResult["exitReason"];
      tokenUsed: number;
      transcriptPath?: string;
      workspaceDiffPath?: string;
      transcriptTruncated?: boolean;
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
  readonly features?: string;
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly commandExists?: (command: string, args: readonly string[]) => Promise<boolean>;
  readonly workspaceRoot?: string;
  readonly gitDiff?: (worktreePath: string) => Promise<string>;
  readonly artifactGlob?: string;
  readonly harvestDeps?: HarvestArtifactDeps;
  readonly orgSlug?: string;
  readonly projectSlug?: string | null;
}

const defaultLogger: Logger = console;

type SandboxProvider = AnySandboxProvider;

export type SandboxMode = "host" | "docker" | "podman" | "vercel" | "daytona" | "modal" | "e2b";

export class SandboxProviderUnavailableError extends Error {
  readonly code = "SANDBOX_PROVIDER_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "SandboxProviderUnavailableError";
  }
}

export interface ResolveProviderOptions {
  readonly features?: string;
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly commandExists?: (command: string, args: readonly string[]) => Promise<boolean>;
}

export interface ResolvedSandboxProvider {
  readonly mode: SandboxMode;
  readonly provider: SandboxProvider;
}

export interface SandboxProviderDoctorCheck {
  readonly provider: SandboxMode;
  readonly flag: string;
  readonly status: "ok" | "warn" | "error";
  readonly detail: string;
  readonly hint?: string;
}

export async function resolveProvider(options: ResolveProviderOptions = {}): Promise<ResolvedSandboxProvider> {
  const flags = parseFeatureFlags(options.features ?? process.env.FULCRUM_FEATURES ?? "");
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? commandSucceeds;

  if (flags.has("sandbox-docker") && flags.has("sandbox-podman")) {
    throw new SandboxProviderUnavailableError(
      "sandbox-docker and sandbox-podman are mutually exclusive; disable one FULCRUM_FEATURES flag.",
    );
  }

  if (flags.has("sandbox-docker")) {
    if (!(await commandExists("docker", ["info"]))) {
      throw new SandboxProviderUnavailableError("sandbox-docker requested but `docker info` failed.");
    }
    return { mode: "docker", provider: docker() };
  }

  if (flags.has("sandbox-podman")) {
    if (!(await commandExists("podman", ["info"]))) {
      throw new SandboxProviderUnavailableError("sandbox-podman requested but `podman info` failed.");
    }
    return { mode: "podman", provider: podman() };
  }

  if (flags.has("sandbox-vercel")) {
    requireEnv("sandbox-vercel", env, ["VERCEL_TOKEN"]);
    const { vercel } = await importOptionalSandbox<{ vercel: () => SandboxProvider }>(
      "@ai-hero/sandcastle/sandboxes/vercel",
    );
    return { mode: "vercel", provider: vercel() };
  }

  if (flags.has("sandbox-daytona")) {
    requireEnv("sandbox-daytona", env, ["DAYTONA_API_KEY", "DAYTONA_SERVER_URL"]);
    const { daytona } = await importOptionalSandbox<{ daytona: () => SandboxProvider }>(
      "@ai-hero/sandcastle/sandboxes/daytona",
    );
    return { mode: "daytona", provider: daytona() };
  }

  if (flags.has("sandbox-modal")) {
    requireEnv("sandbox-modal", env, ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]);
    return { mode: "modal", provider: cloudProviderPlaceholder("modal") };
  }

  if (flags.has("sandbox-e2b")) {
    requireEnv("sandbox-e2b", env, ["E2B_API_KEY"]);
    return { mode: "e2b", provider: cloudProviderPlaceholder("e2b") };
  }

  return { mode: "host", provider: noSandbox() };
}

export async function sandboxProviderDoctorChecks(
  options: ResolveProviderOptions = {},
): Promise<SandboxProviderDoctorCheck[]> {
  const features = options.features ?? process.env.FULCRUM_FEATURES ?? "";
  const flags = parseFeatureFlags(features);
  const env = options.env ?? process.env;
  const commandExists = options.commandExists ?? commandSucceeds;
  const checks: SandboxProviderDoctorCheck[] = [];

  const dockerOn = flags.has("sandbox-docker");
  const podmanOn = flags.has("sandbox-podman");
  if (dockerOn && podmanOn) {
    const detail = "sandbox-docker and sandbox-podman are mutually exclusive.";
    checks.push(providerCheck("docker", "sandbox-docker", "error", detail, "Disable one sandbox feature flag."));
    checks.push(providerCheck("podman", "sandbox-podman", "error", detail, "Disable one sandbox feature flag."));
  } else {
    checks.push(await daemonProviderCheck("docker", "sandbox-docker", dockerOn, commandExists));
    checks.push(await daemonProviderCheck("podman", "sandbox-podman", podmanOn, commandExists));
  }

  checks.push(envProviderCheck("vercel", "sandbox-vercel", flags, env, ["VERCEL_TOKEN"]));
  checks.push(envProviderCheck("daytona", "sandbox-daytona", flags, env, ["DAYTONA_API_KEY", "DAYTONA_SERVER_URL"]));
  checks.push(envProviderCheck("modal", "sandbox-modal", flags, env, ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]));
  checks.push(envProviderCheck("e2b", "sandbox-e2b", flags, env, ["E2B_API_KEY"]));

  return checks;
}

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
      const { provider: sandbox, mode: sandboxMode } = await resolveProvider({
        features: deps.features,
        env: deps.env,
        commandExists: deps.commandExists,
      });
      if (sandboxMode === "host") {
        logger.warn(TRUST_BOUNDARY_WARNING);
      }
      const agent = deps.agentProvider ?? agentProviderFromProfile(req.agentProfile);
      const maxIterations = req.opts?.maxIterations ?? req.agentProfile.maxIterations;
      const maxTokens = maxTokensPerRun();
      const envBag = deps.env ?? process.env;
      const wsRoot = deps.workspaceRoot ?? worktree.worktreePath;
      const runId = req.runId ?? crypto.randomUUID();
      const transcriptWriter = new TranscriptWriter(
        wsRoot,
        runId,
        maxTranscriptSize(envBag as Record<string, string | undefined>),
      );
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

        // Write each line of transcript output to JSONL
        for (const line of transcript.split(/\r?\n/)) {
          if (line.length > 0) {
            await transcriptWriter.write("stdout", line);
          }
        }

        if (tokenUsed > maxTokens) {
          exitReason = "token_cap";
          break;
        }

        if (hasStandaloneFinalCompleteLine(transcript)) {
          exitReason = "complete";
          break;
        }
      }

      // Close transcript + capture diff
      const transcriptResult = await transcriptWriter.close();
      const gitDiffFn = deps.gitDiff ?? defaultGitDiff;
      const diffResult = await captureWorkspaceDiff(
        wsRoot,
        runId,
        () => gitDiffFn(worktree.worktreePath),
      );

      // After-run artifact harvest
      const artifactGlob = deps.artifactGlob ?? DEFAULT_ARTIFACT_GLOB;
      const matchedFiles = await matchArtifactGlob(worktree.worktreePath, artifactGlob);
      let harvestedArtifacts: AgentRunResult["artifacts"] = [];
      if (matchedFiles.length > 0 && deps.harvestDeps) {
        const extractedDir = await extractArtifacts(matchedFiles, wsRoot, runId);
        const harvestResult = await harvestArtifacts({
          runId,
          extractedDir,
          orgSlug: deps.orgSlug ?? "default",
          projectSlug: deps.projectSlug,
          deps: deps.harvestDeps,
        });
        harvestedArtifacts = harvestResult.artifacts.map((a) => ({
          id: a.id,
          path: a.path,
          kind: a.mime,
        }));
      }

      const durationMs = Math.max(0, now() - startedAt);
      const result: AgentRunResult = {
        transcript: outputs.join(""),
        exitCode,
        filesChanged: [],
        artifacts: harvestedArtifacts,
        durationMs,
        iterationCount: outputs.length,
        exitReason,
        tokenUsed,
        transcriptPath: transcriptResult.transcriptPath,
        workspaceDiffPath: diffResult.diffPath,
        transcriptTruncated: transcriptResult.truncated,
      };
      if (req.runId) {
        await deps.agentRunRepository?.updateSandcastleRun?.(req.runId, {
          sandboxMode: persistedSandboxMode(sandboxMode),
          exitCode: result.exitCode,
          durationMs,
          iterationCount: result.iterationCount,
          exitReason: result.exitReason,
          tokenUsed,
          transcriptPath: result.transcriptPath,
          workspaceDiffPath: result.workspaceDiffPath,
          transcriptTruncated: result.transcriptTruncated,
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

function parseFeatureFlags(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((feature) => feature.trim().split(":")[0]?.toLowerCase())
      .filter((feature): feature is string => Boolean(feature)),
  );
}

function requireEnv(
  flag: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  names: readonly string[],
): void {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new SandboxProviderUnavailableError(`${flag} requires ${missing.join(", ")}.`);
  }
}

async function commandSucceeds(command: string, args: readonly string[]): Promise<boolean> {
  try {
    const proc = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "ignore" });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function importOptionalSandbox<T>(specifier: string): Promise<T> {
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<T>;
  return runtimeImport(specifier);
}

function cloudProviderPlaceholder(name: "modal" | "e2b"): IsolatedSandboxProvider {
  return {
    tag: "isolated",
    name,
    env: {},
    create: async () => {
      throw new SandboxProviderUnavailableError(
        `sandbox-${name} provider is gated but @ai-hero/sandcastle 0.5.6 does not expose a ${name} sandbox driver.`,
      );
    },
  };
}

function persistedSandboxMode(mode: SandboxMode): "host" | "docker" | "podman" {
  if (mode === "docker" || mode === "podman") return mode;
  return "host";
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

async function defaultGitDiff(worktreePath: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "diff", "HEAD"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "ignore",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return stdout;
  } catch {
    return "";
  }
}

function providerCheck(
  provider: SandboxMode,
  flag: string,
  status: SandboxProviderDoctorCheck["status"],
  detail: string,
  hint?: string,
): SandboxProviderDoctorCheck {
  return { provider, flag, status, detail, ...(hint ? { hint } : {}) };
}

async function daemonProviderCheck(
  provider: "docker" | "podman",
  flag: string,
  enabled: boolean,
  commandExists: (command: string, args: readonly string[]) => Promise<boolean>,
): Promise<SandboxProviderDoctorCheck> {
  if (!enabled) {
    return providerCheck(provider, flag, "ok", `${flag} disabled; noSandbox host mode remains active.`);
  }
  if (await commandExists(provider, ["info"])) {
    return providerCheck(provider, flag, "ok", `${provider} daemon reachable.`);
  }
  return providerCheck(
    provider,
    flag,
    "error",
    `${flag} enabled but \`${provider} info\` failed.`,
    `Start ${provider} or remove ${flag} from FULCRUM_FEATURES.`,
  );
}

function envProviderCheck(
  provider: Exclude<SandboxMode, "host" | "docker" | "podman">,
  flag: string,
  flags: ReadonlySet<string>,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  names: readonly string[],
): SandboxProviderDoctorCheck {
  if (!flags.has(flag)) {
    return providerCheck(provider, flag, "ok", `${flag} disabled; noSandbox host mode remains active.`);
  }
  const missing = names.filter((name) => !env[name]);
  if (missing.length === 0) {
    return providerCheck(provider, flag, "ok", `${flag} prerequisites present.`);
  }
  return providerCheck(
    provider,
    flag,
    "error",
    `${flag} enabled but missing ${missing.join(", ")}.`,
    `Set ${missing.join(", ")} or remove ${flag} from FULCRUM_FEATURES.`,
  );
}
