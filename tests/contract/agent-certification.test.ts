import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AgentCertificationService } from "@fulcrum/core";

describe("agent certification contract", () => {
  it("requires two real passing CLI agents and degrades unavailable agents with next actions", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-agent-cert-"));
    const first = fakeAgent(root, "agent-one");
    const second = fakeAgent(root, "agent-two");
    const service = new AgentCertificationService([
      profile("agent_one", first),
      profile("agent_two", second),
      profile("agent_missing", path.join(root, "missing-agent"))
    ]);

    const report = await service.certify({
      cwd: root,
      acceptanceEvidence: [
        { agentId: "agent_one", status: "passed", evidenceRef: "agent-one.json", runId: "run_agent_one" },
        { agentId: "agent_two", status: "passed", evidenceRef: "agent-two.json", runId: "run_agent_two" },
        { agentId: "agent_missing", status: "guided", evidenceRef: "missing.json" }
      ]
    });

    expect(report.pass).toBe(true);
    expect(report.realAgentCount).toBe(2);
    expect(report.certifications.find((item) => item.agentId === "agent_one")?.status).toBe("certified");
    expect(report.certifications.find((item) => item.agentId === "agent_one")?.acceptanceRunIds).toEqual([
      "run_agent_one"
    ]);
    expect(report.certifications.find((item) => item.agentId === "agent_missing")?.status).toBe("degraded");
    expect(report.nextActions).toContain("Install missing test agent.");
  });
});

function fakeAgent(root: string, name: string): string {
  const command = path.join(root, name);
  writeFileSync(command, "#!/usr/bin/env sh\nprintf '%s 1.0\\n' \"$0\"\n");
  chmodSync(command, 0o755);
  return command;
}

function profile(agentId: string, command: string) {
  return {
    agentId,
    command,
    versionArgs: ["--version"],
    roles: ["validation"],
    promptMechanisms: ["stdin"],
    supportsMcp: true,
    supportsHooks: true,
    localOnlyBehavior: "Local workspace only.",
    installHints: ["Install missing test agent."]
  };
}
