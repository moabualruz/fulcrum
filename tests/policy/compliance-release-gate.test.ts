import { describe, expect, it } from "vitest";
import { ComplianceService } from "@fulcrum/core";

describe("compliance release gate", () => {
  it("blocks mock-only and preview-only evidence from counting as complete", () => {
    const rootDir = process.cwd();
    const audit = new ComplianceService().audit({
      rootDir,
      sources: ["specs/005-product-readiness-gap-closure/spec.md"],
      evidence: {
        implementationRefs: {
          "FR-001": ["packages/core/src/readiness/compliance-service.ts"],
          "FR-002": ["apps/cli/src/commands/compliance.ts"]
        },
        testRefs: {
          "FR-001": ["tests/policy/mock-only-compliance.test.ts"],
          "FR-002": ["tests/policy/preview-only-compliance.test.ts"]
        }
      }
    });

    const statuses = Object.fromEntries(
      audit.requirements.map((requirement) => [requirement.requirementId, requirement.status])
    );

    expect(statuses["FR-001"]).toBe("mock_only");
    expect(statuses["FR-002"]).toBe("preview_only");
    expect(audit.blockingRequirementIds).toEqual(expect.arrayContaining(["FR-001", "FR-002"]));
    expect(audit.pass).toBe(false);
  });
});
