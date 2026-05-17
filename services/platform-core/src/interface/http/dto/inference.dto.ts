import type { BackendId } from "@platform-core/application/inference/backends/types.ts";
import type { InferenceFeatureKey } from "@platform-core/application/inference/protocol.ts";

export class InferenceTextRequestDto {
  text!: string;
  model?: string;
}

export class InferenceEmbedRequestDto {
  texts!: string[];
  model?: string;
}

export class InferenceGenerateRequestDto {
  prompt!: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class InferenceClassifyRequestDto {
  text!: string;
  labels!: string[];
}

export class InferenceModelParamsDto {
  modelId!: string;
}

export class InferenceModelPullRequestDto {
  force?: boolean;
}

export class InferenceConfigSetRequestDto {
  feature!: InferenceFeatureKey;
  backend!: BackendId;
}

export class InferenceProviderSetRequestDto {
  url!: string;
  key!: string;
}
