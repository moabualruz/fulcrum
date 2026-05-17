export class FeatureExperimentCreateDto {
  name!: string;
  description?: string;
  variants!: string[];
  rolloutPercent?: number;
}

export class FeatureExperimentParamsDto {
  experimentId!: string;
}

export class FeatureExperimentMetricsQueryDto {
  conversionKind!: string;
}
