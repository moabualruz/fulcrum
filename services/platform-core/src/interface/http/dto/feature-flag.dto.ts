export class FeatureFlagListQueryDto {
  orgId?: string;
  userId?: string;
}

export class FeatureFlagEvaluateQueryDto {
  flag!: string;
  orgId!: string;
  userId!: string;
}

export class FeatureFlagSetDto {
  flag!: string;
  orgId!: string;
  userId?: string;
  enabled!: boolean;
}

export class FeatureFlagOverrideDto {
  flag!: string;
  orgId!: string;
  enabled!: boolean;
}

export class FeatureFlagRolloutDto {
  flag!: string;
  orgId!: string;
  rolloutPercent!: number;
}
