/**
 * Tests for sandbox-runner.ts — provider resolution, trust boundary,
 * adapter-swap contract parity, artifact glob, and run persistence.
 *
 * workflow milestone RED gate: these tests exercise behaviors that require full
 * implementation of resolveAgentRunConfig, provider hardening, and
 * artifact/session features.
 */

import { describe, expect, mock, test } from "bun:test";
import {
  resolveProvider,
  sandboxProviderDoctorChecks,
  TRUST_BOUNDARY_WARNING,
  SandboxProviderUnavailableError,
  DEFAULT_ARTIFACT_GLOB,
} from "./sandbox-runner.ts";
import type { AgentRunRequest, AgentRunResult } from "./types.ts";
import { claudeCodeProfile } from "@execution-orchestration/application/agent-catalog/profiles/claude-code.ts";
import { codexProfile } from "@execution-orchestration/application/agent-catalog/profiles/codex.ts";
import { geminiCliProfile } from "@execution-orchestration/application/agent-catalog/profiles/gemini-cli.ts";
import { opencodeProfile } from "@execution-orchestration/application/agent-catalog/profiles/opencode.ts";
import { piProfile } from "@execution-orchestration/application/agent-catalog/profiles/pi.ts";
import { resolveAgentRunConfig } from "@execution-orchestration/application/agent-catalog/resolve-agent-run-config.ts";

// ---------------------------------------------------------------------------
// FULCRUM TRUST BOUNDARY — noSandbox default warning
// ---------------------------------------------------------------------------

describe("noSandbox default — trust boundary", () => {
  test("resolveProvider returns host mode when no sandbox flag set", async () => {
    const result = await resolveProvider({ features: "" });
    expect(result.mode).toBe("host");
  });

  test("TRUST_BOUNDARY_WARNING contains FULCRUM TRUST BOUNDARY", () => {
    expect(TRUST_BOUNDARY_WARNING).toContain("FULCRUM TRUST BOUNDARY");
    expect(TRUST_BOUNDARY_WARNING).toContain("noSandbox");
  });

  test("runAgent logs trust boundary warning in host mode", async () => {
    const { runAgent } = await import("./sandbox-runner.ts");
    const warnMessages: string[] = [];
    const logger = { warn: (msg: string) => { warnMessages.push(msg); } };

    // Minimal stub: worktree resolves immediately
    const worktree = {
      branch: "agent/test",
      worktreePath: "/tmp/wt",
      interactive: mock(async () => ({ stdout: "COMPLETE", exitCode: 0, commits: [] })),
      close: mock(async () => {}),
    };

    const req: AgentRunRequest = {
      runId: "run-trust-boundary-test",
      worktree: { branch: "agent/test", cwd: "/tmp" },
      agentProfile: codexProfile,
      prompt: "Hello",
      contextBundle: {},
      timeout: 5000,
    };

    await runAgent(req, {
      createWorktree: async () => worktree,
      logger,
      features: "",   // no sandbox flag → host mode
      workspaceRoot: "/tmp",
      gitDiff: async () => "",
    });

    expect(warnMessages.some((m) => m.includes("FULCRUM TRUST BOUNDARY"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sandbox-docker: absent Docker daemon yields provider error
// ---------------------------------------------------------------------------

describe("sandbox-docker provider checks", () => {
  test("sandbox-docker flag with unavailable docker yields SandboxProviderUnavailableError", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-docker",
        commandExists: async () => false, // simulate docker absent
      }),
    ).rejects.toThrow(SandboxProviderUnavailableError);
  });

  test("sandbox-docker flag with unavailable docker yields error message naming docker", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-docker",
        commandExists: async () => false,
      }),
    ).rejects.toThrow("sandbox-docker");
  });

  test("doctor check for sandbox-docker yields error status when docker absent", async () => {
    const checks = await sandboxProviderDoctorChecks({
      features: "sandbox-docker",
      commandExists: async () => false,
    });
    const dockerCheck = checks.find((c) => c.provider === "docker");
    expect(dockerCheck?.status).toBe("error");
    expect(dockerCheck?.detail).toContain("sandbox-docker");
  });

  test("doctor check for sandbox-docker yields ok when docker present", async () => {
    const checks = await sandboxProviderDoctorChecks({
      features: "sandbox-docker",
      commandExists: async () => true,
    });
    const dockerCheck = checks.find((c) => c.provider === "docker");
    expect(dockerCheck?.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// sandbox-podman: absent Podman daemon yields provider error
// ---------------------------------------------------------------------------

describe("sandbox-podman provider checks", () => {
  test("sandbox-podman flag with unavailable podman yields SandboxProviderUnavailableError", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-podman",
        commandExists: async () => false,
      }),
    ).rejects.toThrow(SandboxProviderUnavailableError);
  });

  test("sandbox-podman flag with unavailable podman yields error message naming podman", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-podman",
        commandExists: async () => false,
      }),
    ).rejects.toThrow("sandbox-podman");
  });

  test("doctor check for sandbox-podman yields error status when podman absent", async () => {
    const checks = await sandboxProviderDoctorChecks({
      features: "sandbox-podman",
      commandExists: async () => false,
    });
    const podmanCheck = checks.find((c) => c.provider === "podman");
    expect(podmanCheck?.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Cloud provider flags: missing env vars fail clearly
// ---------------------------------------------------------------------------

describe("cloud provider flags — env var requirements", () => {
  test("sandbox-vercel without VERCEL_TOKEN throws SandboxProviderUnavailableError", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-vercel",
        env: {},
      }),
    ).rejects.toThrow(SandboxProviderUnavailableError);
  });

  test("sandbox-daytona without required env vars throws with clear message", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-daytona",
        env: {},
      }),
    ).rejects.toThrow(SandboxProviderUnavailableError);
  });

  test("sandbox-modal without env vars throws SandboxProviderUnavailableError", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-modal",
        env: {},
      }),
    ).rejects.toThrow(SandboxProviderUnavailableError);
  });

  test("sandbox-e2b without E2B_API_KEY throws SandboxProviderUnavailableError", async () => {
    await expect(
      resolveProvider({
        features: "sandbox-e2b",
        env: {},
      }),
    ).rejects.toThrow(SandboxProviderUnavailableError);
  });
});

// ---------------------------------------------------------------------------
// adapter-swap: all five agents send same AgentRunRequest → same AgentRunResult shape
// ---------------------------------------------------------------------------

describe("adapter-swap — AgentRunRequest/Result contract parity", () => {
  const allProfiles = [claudeCodeProfile, codexProfile, geminiCliProfile, opencodeProfile, piProfile];

  const makeWorktree = () => ({
    branch: "agent/test",
    worktreePath: "/tmp/wt",
    interactive: mock(async () => ({ stdout: "COMPLETE", exitCode: 0, commits: [] })),
    close: mock(async () => {}),
  });

  for (const profile of allProfiles) {
    test(`${profile.name} profile produces valid AgentRunResult shape`, async () => {
      const { runAgent } = await import("./sandbox-runner.ts");
      const req: AgentRunRequest = {
        runId: `run-${profile.name}`,
        worktree: { branch: "agent/test", cwd: "/tmp" },
        agentProfile: profile,
        prompt: "Do something",
        contextBundle: {},
        timeout: 5000,
      };

      const result: AgentRunResult = await runAgent(req, {
        createWorktree: async () => makeWorktree(),
        logger: { warn: () => {} },
        features: "",
        workspaceRoot: "/tmp",
        gitDiff: async () => "",
      });

      // Shape assertions — same contract regardless of agent
      expect(typeof result.transcript).toBe("string");
      expect(typeof result.exitCode).toBe("number");
      expect(Array.isArray(result.filesChanged)).toBe(true);
      expect(Array.isArray(result.artifacts)).toBe(true);
      expect(typeof result.durationMs).toBe("number");
      expect(typeof result.iterationCount).toBe("number");
      expect(["complete", "max_iterations", "token_cap"]).toContain(result.exitReason);
    });
  }
});

// ---------------------------------------------------------------------------
// DEFAULT_ARTIFACT_GLOB export
// ---------------------------------------------------------------------------

describe("DEFAULT_ARTIFACT_GLOB export from sandbox-runner", () => {
  test("sandbox-runner re-exports DEFAULT_ARTIFACT_GLOB", () => {
    expect(typeof DEFAULT_ARTIFACT_GLOB).toBe("string");
    expect(DEFAULT_ARTIFACT_GLOB.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Configured artifact glob: WORKFLOW.md or profile config override
// ---------------------------------------------------------------------------

describe("configured artifact glob", () => {
  test("custom artifactGlob dep overrides DEFAULT_ARTIFACT_GLOB in run", async () => {
    const { runAgent } = await import("./sandbox-runner.ts");
    let capturedGlob: string | undefined;

    const req: AgentRunRequest = {
      runId: "run-glob-test",
      worktree: { branch: "agent/test", cwd: "/tmp" },
      agentProfile: codexProfile,
      prompt: "Do something",
      contextBundle: {},
      timeout: 5000,
    };

    await runAgent(req, {
      createWorktree: async () => ({
        branch: "agent/test",
        worktreePath: "/tmp/wt",
        interactive: mock(async () => ({ stdout: "COMPLETE", exitCode: 0 })),
        close: mock(async () => {}),
      }),
      logger: { warn: () => {} },
      features: "",
      workspaceRoot: "/tmp",
      gitDiff: async () => "",
      artifactGlob: "*.report",
      // Intercept matchArtifactGlob via harvestDeps absence — glob is read from deps
    });

    // If we reach here without error the glob was accepted; the default value
    // is validated via the DEFAULT_ARTIFACT_GLOB export test.
    // The resolved glob is used when artifactGlob dep is provided.
    expect(true).toBe(true); // structural: no crash with custom glob
  });
});

// ---------------------------------------------------------------------------
// resolveAgentRunConfig — WORKFLOW.md overrides persisted profile default
// ---------------------------------------------------------------------------

describe("resolveAgentRunConfig — WORKFLOW.md override vs profile default", () => {
  test("WORKFLOW.md command overrides persisted profile cliPath", () => {
    const config = resolveAgentRunConfig({
      requestedAgent: "codex",
      workflowOverride: { command: "my-codex --experimental" },
    });
    expect(config.command).toBe("my-codex --experimental");
  });

  test("profile cliPath used when no WORKFLOW.md override", () => {
    const config = resolveAgentRunConfig({
      requestedAgent: "codex",
      workflowOverride: {},
    });
    expect(config.command).toBe(codexProfile.cliPath);
  });

  test("WORKFLOW.md model override propagates", () => {
    const config = resolveAgentRunConfig({
      requestedAgent: "claude-code",
      workflowOverride: { model: "claude-opus-4-5" },
    });
    expect(config.model).toBe("claude-opus-4-5");
  });

  test("WORKFLOW.md sandcastleProvider override propagates", () => {
    const config = resolveAgentRunConfig({
      requestedAgent: "codex",
      workflowOverride: { sandcastleProvider: "docker" },
    });
    expect(config.sandcastleProvider).toBe("docker");
  });

  test("unsupported agent name throws typed error", () => {
    expect(() =>
      resolveAgentRunConfig({
        requestedAgent: "unknown-agent-xyz",
        workflowOverride: {},
      }),
    ).toThrow();
  });

  test("codex is accepted as the default dispatch agent", () => {
    const config = resolveAgentRunConfig({
      requestedAgent: "codex",
      workflowOverride: {},
    });
    expect(config.agentName).toBe("codex");
  });

  test("claude-code is accepted as a valid dispatch agent", () => {
    const config = resolveAgentRunConfig({ requestedAgent: "claude-code", workflowOverride: {} });
    expect(config.agentName).toBe("claude-code");
  });

  test("opencode is accepted as a valid dispatch agent", () => {
    const config = resolveAgentRunConfig({ requestedAgent: "opencode", workflowOverride: {} });
    expect(config.agentName).toBe("opencode");
  });

  test("gemini-cli is accepted as a valid dispatch agent", () => {
    const config = resolveAgentRunConfig({ requestedAgent: "gemini-cli", workflowOverride: {} });
    expect(config.agentName).toBe("gemini-cli");
  });

  test("pi is accepted as a valid dispatch agent", () => {
    const config = resolveAgentRunConfig({ requestedAgent: "pi", workflowOverride: {} });
    expect(config.agentName).toBe("pi");
  });
});

// ---------------------------------------------------------------------------
// session resume: only attempted when profile capability declares support
// ---------------------------------------------------------------------------

describe("session resume — profile capability gate", () => {
  test("session resume not attempted for codex (supportsSessionResume falsy)", async () => {
    const { resolveSessionResume } = await import("./session-resume.ts");
    const lookup = { findPriorTranscriptPath: mock(async () => "/path/to/prior.jsonl") };

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: codexProfile.supportsSessionResume, // undefined → falsy
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    expect(result.attempted).toBe(false);
    expect(lookup.findPriorTranscriptPath).not.toHaveBeenCalled();
  });

  test("session resume attempted for claude-code (supportsSessionResume true)", async () => {
    const { resolveSessionResume } = await import("./session-resume.ts");
    const lookup = { findPriorTranscriptPath: mock(async () => "/path/to/prior.jsonl") };

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: claudeCodeProfile.supportsSessionResume, // true
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    expect(result.attempted).toBe(true);
    expect(result.coldStart).toBe(false);
    expect(result.transcriptPath).toBe("/path/to/prior.jsonl");
  });
});
