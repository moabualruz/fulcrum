import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { makeId, type ReleaseEvidencePack } from "@fulcrum/shared";
import {
  complianceGateFailures,
  ComplianceService,
  type ComplianceAuditResult
} from "./compliance-service.js";
import { ReleaseEvidenceWriter } from "./evidence-writer.js";

export const REQUIRED_RELEASE_SECTIONS = [
  "compliance matrix",
  "install/package/start",
  "setup/doctor",
  "SQLite canonical state restart",
  "CLI/API/cockpit/TUI/MCP parity",
  "real-agent acceptance",
  "adapter certification",
  "policy/privacy/no-network",
  "quality gates",
  "worktree safety",
  "graph/cache invalidation",
  "backup/restore/export/rebuild",
  "documentation and operator guide"
] as const;

export type ReleaseSectionId = (typeof REQUIRED_RELEASE_SECTIONS)[number];

export interface ReleaseValidationCommand {
  command: string;
  args?: string[];
  cwd?: string;
  required?: boolean;
}

export interface ReleaseValidationInput {
  rootDir?: string;
  evidenceDir: string;
  localOnly?: boolean;
  audit?: ComplianceAuditResult;
  sectionEvidence?: Partial<Record<ReleaseSectionId, string[]>>;
  commands?: ReleaseValidationCommand[];
  runCommands?: boolean;
}

export interface ReleaseValidationCheck {
  checkId: string;
  status: "passed" | "failed";
  sourceRequirements: string[];
  artifacts: string[];
  nextAction: string;
}

export interface ReleaseValidationResult {
  schemaVersion: "1.0";
  releaseRunId: string;
  pass: boolean;
  evidenceRoot: string;
  checks: ReleaseValidationCheck[];
  redactionStatus: ReleaseEvidencePack["redactionStatus"];
  evidenceManifest: string;
  pack: ReleaseEvidencePack;
}

export class ReleaseValidator {
  constructor(
    private readonly compliance = new ComplianceService(),
    private readonly writer = new ReleaseEvidenceWriter()
  ) {}

  async validate(input: ReleaseValidationInput): Promise<ReleaseValidationResult> {
    const rootDir = path.resolve(input.rootDir ?? process.cwd());
    const evidenceRoot = path.resolve(input.evidenceDir);
    const startedAt = new Date().toISOString();
    const releaseRunId = makeId("release", startedAt);
    const audit = input.audit ?? this.compliance.audit({ rootDir });
    const complianceArtifact = this.writer.writeArtifact(
      evidenceRoot,
      "compliance-matrix.json",
      audit
    );
    const sectionChecks = REQUIRED_RELEASE_SECTIONS.map((section) =>
      this.writeSectionEvidence(section, input.sectionEvidence?.[section] ?? [], evidenceRoot)
    );
    const commandResults = input.runCommands
      ? await runValidationCommands(input.commands ?? [], rootDir)
      : [];

    const checks = [
      complianceCheck(audit, complianceArtifact.artifactPath),
      ...sectionChecks.map((section) => section.check),
      ...commandResults.map(commandCheck)
    ];
    const failures = checks.filter((check) => check.status === "failed");
    const pack: ReleaseEvidencePack = {
      releaseRunId,
      startedAt,
      completedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        rootDir,
        localOnly: Boolean(input.localOnly)
      },
      commands: commandResults,
      artifacts: checks.flatMap((check) =>
        check.artifacts.map((artifact) => ({ checkId: check.checkId, path: artifact }))
      ),
      logs: commandResults.flatMap((result) => result.logs),
      complianceSummary: { ...audit.summary, blockingRequirementIds: audit.blockingRequirementIds },
      pass: failures.length === 0,
      failures: failures.map((failure) => failure.checkId),
      nextActions: [...new Set(failures.map((failure) => failure.nextAction))],
      redactionStatus: "not_redacted",
      schemaVersion: "1.0"
    };
    const written = this.writer.write(evidenceRoot, pack);

    return {
      schemaVersion: "1.0",
      releaseRunId,
      pass: written.pack.pass,
      evidenceRoot,
      checks,
      redactionStatus: written.redactionStatus,
      evidenceManifest: written.manifestPath,
      pack: written.pack
    };
  }

  private writeSectionEvidence(
    section: ReleaseSectionId,
    artifacts: string[],
    evidenceRoot: string
  ): { check: ReleaseValidationCheck } {
    const evaluation = evaluateSection(section, artifacts, evidenceRoot);
    const reportPath = path.posix.join("sections", `${fileSlug(section)}.json`);
    this.writer.writeArtifact(evidenceRoot, reportPath, {
      schemaVersion: "1.0",
      section,
      checkId: evaluation.checkId,
      status: evaluation.status,
      sourceRequirements: evaluation.sourceRequirements,
      evidenceRefs: artifacts,
      missingArtifacts: evaluation.missing,
      unexecutedArtifacts: evaluation.unexecuted,
      invalidStatusArtifacts: evaluation.badStatus,
      nextAction: evaluation.nextAction
    });

    return {
      check: {
        checkId: evaluation.checkId,
        status: evaluation.status,
        sourceRequirements: evaluation.sourceRequirements,
        artifacts: [reportPath, ...artifacts],
        nextAction: evaluation.nextAction
      }
    };
  }
}

function complianceCheck(
  audit: ComplianceAuditResult,
  artifactPath: string
): ReleaseValidationCheck {
  const failures = complianceGateFailures(audit.requirements);
  return {
    checkId: "compliance.matrix",
    status: failures.length === 0 ? "passed" : "failed",
    sourceRequirements: failures.map((requirement) => requirement.requirementId),
    artifacts: [artifactPath],
    nextAction:
      failures.length === 0
        ? "Keep Product/SRS compliance evidence current."
        : "Complete missing, partial, mock-only, preview-only, or documentation-only requirements."
  };
}

function evaluateSection(
  section: ReleaseSectionId,
  artifacts: string[],
  evidenceRoot: string
): {
  checkId: string;
  status: "passed" | "failed";
  sourceRequirements: string[];
  missing: string[];
  unexecuted: string[];
  badStatus: string[];
  nextAction: string;
} {
  const resolved = artifacts.map((artifact) =>
    path.isAbsolute(artifact) ? artifact : path.join(evidenceRoot, artifact)
  );
  const missing = resolved.filter((artifact) => !existsSync(artifact));
  const unexecuted = resolved.filter((artifact) => artifactLooksUnexecuted(artifact));
  const badStatus = resolved.filter((artifact) => artifactHasDisallowedStatus(artifact));
  const failed =
    artifacts.length === 0 || missing.length > 0 || unexecuted.length > 0 || badStatus.length > 0;
  const sourceRequirements = failed ? ["FR-017", "FR-018"] : ["FR-017"];
  return {
    checkId: `release.section.${slug(section)}`,
    status: failed ? "failed" : "passed",
    sourceRequirements,
    missing: missing.map((artifact) => normalizeArtifactPath(artifact, evidenceRoot)),
    unexecuted: unexecuted.map((artifact) => normalizeArtifactPath(artifact, evidenceRoot)),
    badStatus: badStatus.map((artifact) => normalizeArtifactPath(artifact, evidenceRoot)),
    nextAction: failed
      ? `Provide executed, redacted evidence for ${section}.`
      : `Evidence present for ${section}.`
  };
}

function artifactLooksUnexecuted(artifact: string): boolean {
  if (!existsSync(artifact)) return false;
  const text = readFileSync(artifact, "utf8").toLowerCase();
  return /\bunexecuted\b|\bnot run\b|\bplaceholder\b/.test(text);
}

function artifactHasDisallowedStatus(artifact: string): boolean {
  if (!existsSync(artifact)) return false;
  const text = readFileSync(artifact, "utf8").toLowerCase();
  return /\bmissing\b|\bpartial\b|\bmock_only\b|\bpreview_only\b|\bdocumentation_only\b|\bmock-only\b|\bpreview-only\b|\bdocumentation-only\b/.test(
    text
  );
}

async function runValidationCommands(commands: ReleaseValidationCommand[], rootDir: string) {
  const results = [];
  for (const command of commands) {
    const startedAt = new Date().toISOString();
    try {
      const result = await execa(command.command, command.args ?? [], {
        cwd: command.cwd ?? rootDir,
        reject: false,
        all: true
      });
      results.push({
        command: [command.command, ...(command.args ?? [])].join(" "),
        cwd: command.cwd ?? rootDir,
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode: result.exitCode,
        status: result.exitCode === 0 ? "passed" : command.required === false ? "guided" : "failed",
        logs: [],
        output: result.all ?? ""
      });
    } catch (error) {
      results.push({
        command: [command.command, ...(command.args ?? [])].join(" "),
        cwd: command.cwd ?? rootDir,
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode: 1,
        status: command.required === false ? "guided" : "failed",
        logs: [],
        output: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

function commandCheck(result: { command: string; status: string }): ReleaseValidationCheck {
  return {
    checkId: `release.command.${slug(result.command)}`,
    status: result.status === "failed" ? "failed" : "passed",
    sourceRequirements: result.status === "failed" ? ["FR-018"] : ["FR-017"],
    artifacts: [],
    nextAction:
      result.status === "failed"
        ? `Fix failing release validation command: ${result.command}.`
        : `Command passed: ${result.command}.`
  };
}

function fileSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeArtifactPath(artifact: string, evidenceRoot: string): string {
  const relative = path.relative(evidenceRoot, artifact);
  return relative.startsWith("..") ? artifact : relative || ".";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}
