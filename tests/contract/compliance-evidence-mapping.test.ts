import { describe, expect, it } from "vitest";
import { buildRepositoryComplianceEvidence, type ComplianceAuditResult } from "@fulcrum/core";

function buildAudit(requirements: ComplianceAuditResult["requirements"]): ComplianceAuditResult {
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    sourceOrder: ["FULCRUM_PRODUCT.md"],
    summary: {
      implemented: 0,
      partial: 0,
      missing: requirements.length,
      deferred: 0,
      superseded: 0,
      mockOnly: 0,
      previewOnly: 0,
      documentationOnly: 0
    },
    requirements,
    blockingRequirementIds: requirements.map((requirement) => requirement.requirementId),
    pass: false
  };
}

describe("compliance evidence mapping", () => {
  it("maps release and compliance requirements to concrete refs", () => {
    const audit = buildAudit([
      {
        schemaVersion: "1.0",
        requirementId: "PRODUCT-039",
        sourceFile: "FULCRUM_PRODUCT.md",
        sourceLine: 349,
        text: "Fulcrum should not claim readiness without proof. Release validation should write evidence pack output.",
        priority: "release",
        status: "missing",
        implementationRefs: [],
        testRefs: [],
        evidenceRefs: [],
        nextAction: "Map requirement to implementation, tests, and release evidence."
      },
      {
        schemaVersion: "1.0",
        requirementId: "PRODUCT-040",
        sourceFile: "FULCRUM_PRODUCT.md",
        sourceLine: 349,
        text: "Compliance audit should apply source order and block preview-only evidence from counting as complete.",
        priority: "release",
        status: "missing",
        implementationRefs: [],
        testRefs: [],
        evidenceRefs: [],
        nextAction: "Map requirement to implementation, tests, and release evidence."
      }
    ]);

    const evidence = buildRepositoryComplianceEvidence(audit, process.cwd());

    expect(evidence.implementationRefs?.["PRODUCT-039"]).toEqual(
      expect.arrayContaining(["packages/core/src/readiness/release-validator.ts"])
    );
    expect(evidence.testRefs?.["PRODUCT-039"]).toEqual(
      expect.arrayContaining(["tests/contract/release-readiness-contract.test.ts"])
    );
    expect(evidence.implementationRefs?.["PRODUCT-040"]).toEqual(
      expect.arrayContaining(["packages/core/src/readiness/compliance-service.ts"])
    );
    expect(evidence.testRefs?.["PRODUCT-040"]).toEqual(
      expect.arrayContaining(["tests/policy/compliance-release-gate.test.ts"])
    );
  });

  it("does not mark unmatched narrative as implemented through blanket product refs", () => {
    const audit = buildAudit([
      {
        schemaVersion: "1.0",
        requirementId: "PRODUCT-999",
        sourceFile: "FULCRUM_PRODUCT.md",
        sourceLine: 999,
        text: "Fulcrum should compose improvised jazz choreography.",
        priority: "release",
        status: "missing",
        implementationRefs: [],
        testRefs: [],
        evidenceRefs: [],
        nextAction: "Map requirement to implementation, tests, and release evidence."
      }
    ]);

    const evidence = buildRepositoryComplianceEvidence(audit, process.cwd());

    expect(evidence.implementationRefs?.["PRODUCT-999"]).toBeUndefined();
    expect(evidence.testRefs?.["PRODUCT-999"]).toBeUndefined();
  });
});
