export type FeatureFlagScope = "global" | "org" | "user";

export interface FeatureFlagEvaluation {
  flag: string;
  scope: FeatureFlagScope;
  enabled: boolean;
  rolloutPercent: number;
}
