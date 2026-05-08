import { describe, expect, test } from "bun:test";

import { resolveEffectiveAgentAuthority } from "./trust.ts";

describe("agent authority policy", () => {
  test("uses the most restrictive trust mode across profile, workflow, project, and run inputs", () => {
    expect(resolveEffectiveAgentAuthority({
      agentProfile: { trustMode: "trusted" },
      workflowDefault: { trustMode: "assisted" },
      projectPolicy: { trustMode: "full-auto" },
    })).toMatchObject({
      trustMode: "assisted",
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
});
