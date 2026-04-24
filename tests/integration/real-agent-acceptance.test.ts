import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { listAgentProfiles, runRealAgentPrompt, type AgentProfile } from "@fulcrum/agents";
import { runReleaseAgentAcceptance } from "../../apps/cli/src/commands/release.js";

describe("real agent acceptance", () => {
  it("runs real commands when available and captures deterministic prompt evidence", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-real-agent-"));
    const command = path.join(root, "agent");
    writeFileSync(command, "#!/usr/bin/env sh\ncat >/tmp/fulcrum-agent-prompt\nprintf 'accepted\\n'\n");
    chmodSync(command, 0o755);

    const result = await runRealAgentPrompt({
      profile: { ...baseProfile("agent_test", command), defaultPromptMechanism: "stdin" },
      prompt: "validate lifecycle",
      cwd: root,
      timeoutMs: 2_000
    });

    expect(result.status).toBe("passed");
    expect(readFileSync("/tmp/fulcrum-agent-prompt", "utf8")).toContain("validate lifecycle");
  });

  it("release agent acceptance rejects one-agent selection", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-real-agent-cli-"));
    await expect(
      runReleaseAgentAcceptance({
        cwd: root,
        evidenceDir: path.join(root, "evidence"),
        agentIds: ["agent_codex"]
      })
    ).rejects.toThrow(/at least two/);
  });

  it("captures lifecycle evidence, transcript artifacts, and agent evidence artifact ids for passing agents", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-real-agent-release-"));
    const binDir = path.join(root, "bin");
    const codex = path.join(binDir, "codex");
    const claude = path.join(binDir, "claude");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      codex,
      "#!/usr/bin/env sh\nif [ \"$1\" = \"--version\" ]; then\n  printf 'codex 1.0\\n'\n  exit 0\nfi\ncat >/dev/null\nprintf 'codex ok\\n'\n"
    );
    writeFileSync(
      claude,
      "#!/usr/bin/env sh\nif [ \"$1\" = \"--version\" ]; then\n  printf 'claude 1.0\\n'\n  exit 0\nfi\nprintf 'claude ok\\n'\n"
    );
    chmodSync(codex, 0o755);
    chmodSync(claude, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}:${originalPath ?? ""}`;
    try {
      const report = await runReleaseAgentAcceptance({
        cwd: root,
        evidenceDir: path.join(root, "evidence"),
        agentIds: ["agent_codex", "agent_claude"],
        timeoutMs: 2_000
      });

      expect(report.pass).toBe(true);
      expect(report.status).toBe("passed");
      expect(report.runs).toHaveLength(2);
      for (const run of report.runs) {
        expect(run.runId).toMatch(/^run_/);
        expect(run.contextPackId).toMatch(/^ctx_/);
        expect(run.worktreeId).toMatch(/^wt_/);
        expect(run.transcriptArtifactId).toMatch(/^art_/);
        expect(run.agentEvidenceArtifactId).toMatch(/^art_/);
        expect(run.artifactIds).toContain(run.transcriptArtifactId);
        expect(run.artifactIds).toContain(run.agentEvidenceArtifactId);
        expect(run.qualityGateIds[0]).toMatch(/^gate_/);
        expect(run.policyDecisionIds[0]).toMatch(/^pol_/);
      }
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("exposes standalone copilot and guided generic profile selection", () => {
    const profiles = listAgentProfiles();

    expect(profiles.find((item) => item.agentId === "agent_copilot")?.command).toBe("copilot");
    expect(profiles.find((item) => item.agentId === "agent_generic")?.promptMechanisms).toEqual([
      "stdin"
    ]);
  });
});

function baseProfile(agentId: string, command: string): AgentProfile {
  return {
    agentId,
    command,
    versionArgs: ["--version"],
    promptMechanisms: ["stdin"],
    defaultPromptMechanism: "stdin",
    roles: ["validation"],
    supportsMcp: false,
    supportsHooks: false,
    localOnlyBehavior: "Local test command.",
    installHints: ["Install test command."]
  };
}
