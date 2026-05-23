import { describe, expect, test } from "bun:test";

import {
  evaluateToolAuthority,
  normalizeToolPermissionMode,
  projectPolicySourceFromModulePolicy,
  resolveEffectiveAgentAuthority,
} from "@work-management/application/project-policy/trust.ts";

describe("agent authority policy", () => {
  test("uses the most restrictive trust mode across profile, workflow, project, and run inputs", () => {
    expect(resolveEffectiveAgentAuthority({
      agentProfile: { trustMode: "trusted" },
      workflowDefault: { trustMode: "assisted" },
      projectPolicy: { trustMode: "full-auto" },
    })).toMatchObject({
      trustMode: "assisted",
      permissionMode: "review_each_tool",
      approvalRequired: false,
      reason: "most-restrictive-policy",
      sources: {
        agentProfile: "trusted",
        workflowDefault: "assisted",
        projectPolicy: "full-auto",
        runOverride: null,
      },
    });
  });

  test("requires explicit approval when a run override attempts to loosen authority", () => {
    expect(resolveEffectiveAgentAuthority({
      agentProfile: { trustMode: "manual" },
      workflowDefault: { trustMode: "assisted" },
      projectPolicy: { trustMode: "trusted" },
      runOverride: { trustMode: "full-auto" },
    })).toMatchObject({
      trustMode: "manual",
      approvalRequired: true,
      reason: "run-override-requested-looser-authority",
    });
  });

  test("maps project-facing tool permission modes onto authority policy", () => {
    expect(normalizeToolPermissionMode("review_each_tool")).toBe("review_each_tool");
    expect(normalizeToolPermissionMode("auto")).toBe("auto");
    expect(normalizeToolPermissionMode("danger")).toBe("danger");
    expect(projectPolicySourceFromModulePolicy({ toolPermissionMode: "auto" })).toEqual({ trustMode: "trusted" });
    expect(projectPolicySourceFromModulePolicy({ toolPermissionMode: "danger" })).toEqual({ trustMode: "full-auto" });
  });

  test("evaluates tool authority with review, auto, and danger modes", () => {
    expect(evaluateToolAuthority({ permissionMode: "review_each_tool", safe: true })).toMatchObject({
      allowed: false,
      approvalRequired: true,
      reason: "review-each-tool-requires-approval",
    });
    expect(evaluateToolAuthority({ permissionMode: "auto", safe: true })).toMatchObject({
      allowed: true,
      approvalRequired: false,
      reason: "auto-allows-safe-tool",
    });
    expect(evaluateToolAuthority({ permissionMode: "auto", safe: false })).toMatchObject({
      allowed: false,
      approvalRequired: true,
      reason: "auto-requires-approval-for-risky-tool",
    });
    expect(evaluateToolAuthority({ permissionMode: "danger", safe: false, destructive: true })).toMatchObject({
      allowed: true,
      approvalRequired: false,
      reason: "danger-mode-allows-operator-owned-tool",
    });
  });
});
