import { execa } from "execa";
import {
  AgentCertificationSchema,
  makeId,
  SCHEMA_VERSION,
  type AgentCertification
} from "@fulcrum/shared";

export interface AgentCertificationProfile {
  agentId: string;
  command: string;
  versionArgs: string[];
  roles: string[];
  promptMechanisms: string[];
  supportsMcp: boolean;
  supportsHooks: boolean;
  localOnlyBehavior: string;
  installHints: string[];
}

export interface AgentAcceptanceEvidence {
  agentId: string;
  status: "passed" | "failed" | "guided";
  evidenceRef: string;
  runId?: string;
}

export interface AgentCertificationReport {
  requiredRealAgentCount: number;
  realAgentCount: number;
  pass: boolean;
  certifications: AgentCertification[];
  evidenceRefs: string[];
  nextActions: string[];
}

export class AgentCertificationService {
  constructor(private readonly profiles: AgentCertificationProfile[]) {}

  async certify(input: {
    cwd: string;
    acceptanceEvidence?: AgentAcceptanceEvidence[];
    requiredRealAgentCount?: number;
  }): Promise<AgentCertificationReport> {
    const requiredRealAgentCount = input.requiredRealAgentCount ?? 2;
    const availability = await Promise.all(
      this.profiles.map(async (profile) => ({
        profile,
        version: await this.detectVersion(profile, input.cwd)
      }))
    );
    const now = new Date().toISOString();
    const certifications = availability.map(({ profile, version }) => {
      const evidence = input.acceptanceEvidence?.filter((item) => item.agentId === profile.agentId) ?? [];
      const passed = evidence.some((item) => item.status === "passed");
      const guided = !version || evidence.some((item) => item.status === "guided");
      return AgentCertificationSchema.parse({
        agentId: profile.agentId,
        command: profile.command,
        version,
        authStatus: version ? "unknown" : "missing",
        enabled: Boolean(version),
        roles: profile.roles,
        promptMechanisms: profile.promptMechanisms,
        mcpStatus: profile.supportsMcp ? "supported" : "unsupported",
        hookStatus: profile.supportsHooks ? "supported" : "unsupported",
        localOnlyBehavior: profile.localOnlyBehavior,
        acceptanceRunIds: evidence.flatMap((item) => (item.runId ? [item.runId] : [])),
        evidenceRefs: evidence.map((item) => item.evidenceRef),
        status: passed ? "certified" : guided ? "degraded" : "blocked",
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      });
    });
    const realAgentCount = certifications.filter((certification) => certification.status === "certified").length;
    return {
      requiredRealAgentCount,
      realAgentCount,
      pass: realAgentCount >= requiredRealAgentCount,
      certifications,
      evidenceRefs: certifications.flatMap((certification) => certification.evidenceRefs),
      nextActions: certifications
        .filter((certification) => certification.status !== "certified")
        .map((certification) => {
          const profile = this.profiles.find((item) => item.agentId === certification.agentId);
          return profile?.installHints[0] ?? `Configure ${certification.command} and rerun release agent acceptance.`;
        })
    };
  }

  recordEvidenceAsRunArtifact(input: { runId: string; agentId: string; evidenceRef: string }): string {
    return makeId("art", `${input.runId}-${input.agentId}-${input.evidenceRef}`);
  }

  private async detectVersion(profile: AgentCertificationProfile, cwd: string): Promise<string | undefined> {
    try {
      const result = await execa(profile.command, profile.versionArgs, { cwd, timeout: 5_000, reject: false });
      const output = `${result.stdout}\n${result.stderr}`.trim();
      return output || (result.exitCode === 0 ? "detected" : undefined);
    } catch {
      return undefined;
    }
  }
}
