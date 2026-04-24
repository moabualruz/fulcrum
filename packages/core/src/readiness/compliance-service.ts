import { writeFileSync } from "node:fs";
import path from "node:path";
import type { ComplianceRequirement } from "@fulcrum/shared";
import {
  DEFAULT_COMPLIANCE_SOURCES,
  extractComplianceRequirements,
  type ExtractComplianceInput
} from "./compliance-extractor.js";

export type ComplianceStatus = ComplianceRequirement["status"];

export interface ComplianceEvidenceIndex {
  implementationRefs?: Record<string, string[]>;
  testRefs?: Record<string, string[]>;
  evidenceRefs?: Record<string, string[]>;
  statusOverrides?: Record<string, ComplianceStatus>;
  nextActions?: Record<string, string>;
}

export interface ComplianceAuditInput extends ExtractComplianceInput {
  evidence?: ComplianceEvidenceIndex;
}

export interface ComplianceAuditSummary {
  implemented: number;
  partial: number;
  missing: number;
  deferred: number;
  superseded: number;
  mockOnly: number;
  previewOnly: number;
  documentationOnly: number;
}

export interface ComplianceAuditResult {
  schemaVersion: "1.0";
  generatedAt: string;
  sourceOrder: string[];
  summary: ComplianceAuditSummary;
  requirements: ComplianceRequirement[];
  blockingRequirementIds: string[];
  pass: boolean;
}

export interface ComplianceRepositoryPort {
  saveComplianceRequirement(requirement: ComplianceRequirement): ComplianceRequirement;
  getComplianceRequirement(requirementId: string): ComplianceRequirement | undefined;
  listComplianceRequirements(): ComplianceRequirement[];
}

const blockingStatuses = new Set<ComplianceStatus>([
  "missing",
  "partial",
  "mock_only",
  "preview_only",
  "documentation_only"
]);

export class ComplianceService {
  constructor(private readonly repository?: ComplianceRepositoryPort) {}

  audit(input: ComplianceAuditInput = {}): ComplianceAuditResult {
    const sourceOrder = input.sources?.length ? input.sources.map((source) => path.basename(source)) : DEFAULT_COMPLIANCE_SOURCES;
    const extracted = extractComplianceRequirements(input);
    const classified = applySourceOrder(extracted).map((requirement) =>
      classifyRequirement(requirement, input.evidence)
    );

    for (const requirement of classified) {
      this.repository?.saveComplianceRequirement(requirement);
    }

    return buildAuditResult(classified, sourceOrder);
  }

  list(): ComplianceRequirement[] {
    return this.repository?.listComplianceRequirements() ?? [];
  }

  show(requirementId: string): ComplianceRequirement | undefined {
    return this.repository?.getComplianceRequirement(requirementId);
  }

  export(input: { format: "json" | "markdown"; output: string; audit?: ComplianceAuditResult }) {
    const audit = input.audit ?? buildAuditResult(this.list(), DEFAULT_COMPLIANCE_SOURCES);
    const content = input.format === "json" ? JSON.stringify(audit, null, 2) : toMarkdown(audit);
    writeFileSync(input.output, content);
    return { output: input.output, format: input.format, requirementCount: audit.requirements.length };
  }
}

export function complianceGateFailures(requirements: ComplianceRequirement[]): ComplianceRequirement[] {
  return requirements.filter(
    (requirement) => !["deferred", "superseded"].includes(requirement.status) && blockingStatuses.has(requirement.status)
  );
}

function classifyRequirement(
  requirement: ComplianceRequirement,
  evidence: ComplianceEvidenceIndex = {}
): ComplianceRequirement {
  if (requirement.status === "superseded") return requirement;
  const implementationRefs = evidence.implementationRefs?.[requirement.requirementId] ?? [];
  const testRefs = evidence.testRefs?.[requirement.requirementId] ?? [];
  const evidenceRefs = evidence.evidenceRefs?.[requirement.requirementId] ?? [];
  const combinedRefs = [...implementationRefs, ...testRefs, ...evidenceRefs].join(" ").toLowerCase();
  const explicitStatus = evidence.statusOverrides?.[requirement.requirementId];
  const status =
    explicitStatus ??
    (combinedRefs.includes("mock")
      ? "mock_only"
      : combinedRefs.includes("preview")
        ? "preview_only"
        : implementationRefs.every((ref) => ref.includes("docs/")) && implementationRefs.length > 0
          ? "documentation_only"
          : implementationRefs.length > 0 && testRefs.length > 0
            ? "implemented"
            : implementationRefs.length > 0 || testRefs.length > 0
              ? "partial"
              : "missing");

  return {
    ...requirement,
    status,
    implementationRefs,
    testRefs,
    evidenceRefs,
    nextAction:
      evidence.nextActions?.[requirement.requirementId] ??
      nextActionForStatus(status, requirement.requirementId)
  };
}

function applySourceOrder(requirements: ComplianceRequirement[]): ComplianceRequirement[] {
  const runtimeRequirements = requirements.filter((requirement) =>
    /typescript|go(?:-first)?|node|bun|copilot/i.test(requirement.text)
  );
  const amendment02 = runtimeRequirements.find(
    (requirement) =>
      requirement.sourceFile === "SRS-ammend-02.md" && /typescript-first|typescript/i.test(requirement.text)
  );
  const copilotStandalone = requirements.find(
    (requirement) =>
      requirement.sourceFile === "SRS-ammend-01.md" && /standalone `?copilot`?/i.test(requirement.text)
  );

  return requirements.map((requirement) => {
    if (
      amendment02 &&
      requirement.requirementId !== amendment02.requirementId &&
      isRuntimeDirectionConflict(requirement)
    ) {
      return supersede(requirement, amendment02.requirementId, "SRS-ammend-02 TypeScript-first direction wins runtime conflicts.");
    }
    if (
      copilotStandalone &&
      requirement.requirementId !== copilotStandalone.requirementId &&
      /gh copilot/i.test(requirement.text)
    ) {
      return supersede(requirement, copilotStandalone.requirementId, "SRS-ammend-01 standalone copilot CLI target wins Copilot invocation conflicts.");
    }
    return requirement;
  });
}

function isRuntimeDirectionConflict(requirement: ComplianceRequirement): boolean {
  const text = requirement.text.toLowerCase();
  if (!text.includes("go")) return false;

  return (
    /write fulcrum core in go/.test(text) ||
    /fulcrum core should be implemented in go/.test(text) ||
    /fulcrum core should be go/.test(text) ||
    /go-first/.test(text) ||
    /not use typescript as the fulcrum core/.test(text)
  );
}

function supersede(
  requirement: ComplianceRequirement,
  supersededBy: string,
  reason: string
): ComplianceRequirement {
  return {
    ...requirement,
    status: "superseded",
    supersededBy,
    nextAction: reason
  };
}

function buildAuditResult(
  requirements: ComplianceRequirement[],
  sourceOrder: string[]
): ComplianceAuditResult {
  const summary = summarize(requirements);
  const blockingRequirementIds = complianceGateFailures(requirements).map(
    (requirement) => requirement.requirementId
  );
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    sourceOrder,
    summary,
    requirements,
    blockingRequirementIds,
    pass: blockingRequirementIds.length === 0
  };
}

function summarize(requirements: ComplianceRequirement[]): ComplianceAuditSummary {
  const summary: ComplianceAuditSummary = {
    implemented: 0,
    partial: 0,
    missing: 0,
    deferred: 0,
    superseded: 0,
    mockOnly: 0,
    previewOnly: 0,
    documentationOnly: 0
  };
  for (const requirement of requirements) {
    if (requirement.status === "mock_only") summary.mockOnly += 1;
    else if (requirement.status === "preview_only") summary.previewOnly += 1;
    else if (requirement.status === "documentation_only") summary.documentationOnly += 1;
    else summary[requirement.status] += 1;
  }
  return summary;
}

function nextActionForStatus(status: ComplianceStatus, requirementId: string): string {
  if (status === "implemented") return "Keep implementation, tests, and release evidence current.";
  if (status === "superseded") return "No implementation needed; retain conflict evidence.";
  if (status === "deferred") return "Keep approved deferral rationale linked to release evidence.";
  return `Add complete implementation and non-mock tests for ${requirementId}.`;
}

function toMarkdown(audit: ComplianceAuditResult): string {
  const rows = audit.requirements.map(
    (requirement) =>
      `| ${requirement.requirementId} | ${requirement.sourceFile}:${requirement.sourceLine} | ${requirement.status} | ${requirement.nextAction.replaceAll("|", "\\|")} |`
  );
  return [
    "# Product/SRS Compliance Matrix",
    "",
    `Generated: ${audit.generatedAt}`,
    `Pass: ${audit.pass ? "yes" : "no"}`,
    "",
    "| Requirement | Source | Status | Next action |",
    "| --- | --- | --- | --- |",
    ...rows,
    ""
  ].join("\n");
}
