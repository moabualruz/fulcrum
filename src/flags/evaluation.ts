import { createHash } from "node:crypto";

export interface FeatureFlagEvaluationConfig {
  enabled: boolean;
  rolloutPercent: number;
  orgOverrides?: Record<string, boolean>;
}

export interface EvaluateFeatureFlagInput {
  flag: string;
  orgId: string;
  userId: string;
  config?: FeatureFlagEvaluationConfig | null;
  fallback?: boolean;
}

export function bucketFor(userId: string, flag: string): number {
  const hex = createHash("sha256").update(`${userId}${flag}`).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) % 100;
}

export function normalizeRolloutPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.trunc(percent)));
}

export function evaluateFeatureFlag(input: EvaluateFeatureFlagInput): boolean {
  const fallback = input.fallback ?? false;
  if (!input.config) return fallback;

  if (!input.config.enabled) return false;

  const orgOverride = input.config.orgOverrides?.[input.orgId];
  if (typeof orgOverride === "boolean") return orgOverride;

  const rolloutPercent = normalizeRolloutPercent(input.config.rolloutPercent);
  if (rolloutPercent <= 0) return false;
  if (rolloutPercent >= 100) return true;

  return bucketFor(input.userId, input.flag) < rolloutPercent;
}
