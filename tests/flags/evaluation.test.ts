import { describe, expect, it } from "bun:test";

import {
  bucketFor,
  evaluateFeatureFlag,
  type FeatureFlagEvaluationConfig,
} from "../../src/flags/evaluation.ts";

const baseConfig: FeatureFlagEvaluationConfig = {
  enabled: true,
  rolloutPercent: 0,
  orgOverrides: {},
};

describe("feature flag evaluation", () => {
  it("returns fallback default when base flag is missing", () => {
    expect(
      evaluateFeatureFlag({
        flag: "router-llm",
        orgId: "org-1",
        userId: "user-1",
        fallback: true,
      }),
    ).toBe(true);
  });

  it("base enabled=false always returns false regardless of rollout percent", () => {
    expect(
      evaluateFeatureFlag({
        flag: "router-llm",
        orgId: "org-1",
        userId: "user-1",
        config: { ...baseConfig, enabled: false, rolloutPercent: 100 },
      }),
    ).toBe(false);
  });

  it("org override enable beats rollout percent 0", () => {
    expect(
      evaluateFeatureFlag({
        flag: "router-llm",
        orgId: "org-1",
        userId: "user-1",
        config: {
          ...baseConfig,
          rolloutPercent: 0,
          orgOverrides: { "org-1": true },
        },
      }),
    ).toBe(true);
  });

  it("org override disable beats rollout percent 100", () => {
    expect(
      evaluateFeatureFlag({
        flag: "router-llm",
        orgId: "org-1",
        userId: "user-1",
        config: {
          ...baseConfig,
          rolloutPercent: 100,
          orgOverrides: { "org-1": false },
        },
      }),
    ).toBe(false);
  });

  it("rollout percent 0 disables and 100 enables when no override exists", () => {
    expect(
      evaluateFeatureFlag({
        flag: "router-llm",
        orgId: "org-1",
        userId: "user-1",
        config: { ...baseConfig, rolloutPercent: 0 },
      }),
    ).toBe(false);
    expect(
      evaluateFeatureFlag({
        flag: "router-llm",
        orgId: "org-1",
        userId: "user-1",
        config: { ...baseConfig, rolloutPercent: 100 },
      }),
    ).toBe(true);
  });

  it("rollout percent uses stable sha256 bucket of userId + flag", () => {
    const enabledUsers = Array.from({ length: 100 }, (_, index) => `user-${index}`)
      .filter((userId) => bucketFor(userId, "router-llm") < 50);

    expect(enabledUsers.length).toBeGreaterThanOrEqual(35);
    expect(enabledUsers.length).toBeLessThanOrEqual(65);

    for (const userId of enabledUsers.slice(0, 5)) {
      expect(
        evaluateFeatureFlag({
          flag: "router-llm",
          orgId: "org-1",
          userId,
          config: { ...baseConfig, rolloutPercent: 50 },
        }),
      ).toBe(true);
    }
  });
});
