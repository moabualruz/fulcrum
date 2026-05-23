import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { InferenceClient } from "@platform-core/application/inference/client.ts";
import { probeConfiguredBackends, type BackendHealth } from "@platform-core/application/inference/backend-probes.ts";
import {
  BACKEND_IDS,
  type BackendId,
} from "@platform-core/application/inference/backends/types.ts";
import {
  DEFAULT_FEATURE_BACKEND_MAP,
  type ClassifyResult,
  type EmbedResult,
  type FeatureBackendMap,
  type GenerateOptions,
  type GenerateResult,
  type HealthResult,
  type InferenceBackendInfo,
  type InferenceFeatureKey,
  type InferenceModel,
  type ModelPullProgress,
  ModelPullProgressSchema,
  type TokenizeResult,
} from "@platform-core/application/inference/protocol.ts";
import { getRoutingConfig, setRoutingConfig } from "@platform-core/application/inference/routing-config.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

import { InferenceTextRequestDto, InferenceEmbedRequestDto, InferenceGenerateRequestDto, InferenceClassifyRequestDto, InferenceModelParamsDto, InferenceModelPullRequestDto, InferenceConfigSetRequestDto, InferenceProviderSetRequestDto } from "./dto/inference.dto.ts";
export { InferenceTextRequestDto, InferenceEmbedRequestDto, InferenceGenerateRequestDto, InferenceClassifyRequestDto, InferenceModelParamsDto, InferenceModelPullRequestDto, InferenceConfigSetRequestDto, InferenceProviderSetRequestDto };

const MAX_TEXT_ITEMS = 64;
const MAX_TEXT_CHARS = 20_000;
const MAX_LABELS = 100;
const MAX_MODEL_ID_CHARS = 200;

export const INFERENCE_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.inferencePublicApi.options");

export interface InferenceApplicationPort {
  health(): Promise<HealthResult>;
  embed(texts: string[], options?: { model?: string }): Promise<EmbedResult>;
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  classify(text: string, labels: string[]): Promise<ClassifyResult>;
  tokenize(text: string, model?: string): Promise<TokenizeResult>;
  listModels(): Promise<InferenceModel[]>;
  pullModel(modelId: string, options?: { force?: boolean }): AsyncIterable<ModelPullProgress>;
  rmModel(modelId: string): Promise<{ ok: boolean }>;
  listBackends(): Promise<InferenceBackendInfo[]>;
}

export interface InferenceProviderSetResult {
  ok: boolean;
  url: string;
  credentialRef: {
    kind: "env";
    name: "FULCRUM_INFERENCE_API_KEY";
    redacted: true;
  };
}

export interface InferencePublicApiOptions {
  application?: InferenceApplicationPort;
  featuresEnv?: string;
  probeBackends?: () => Promise<BackendHealth[]>;
}

export class InferencePublicApiService {
  constructor(
    private readonly options: InferencePublicApiOptions | null = null,
    private readonly client: InferenceApplicationPort | null = null,
  ) {}

  async health(): Promise<HealthResult> {
    return await this.requireApplication().health();
  }

  async embed(input: InferenceEmbedRequestDto): Promise<EmbedResult> {
    return await this.requireApplication().embed(input.texts, optionalModel(input));
  }

  async generate(input: InferenceGenerateRequestDto): Promise<GenerateResult> {
    return await this.requireApplication().generate(input.prompt, clean({
      model: input.model,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
    }) as GenerateOptions);
  }

  async classify(input: InferenceClassifyRequestDto): Promise<ClassifyResult> {
    return await this.requireApplication().classify(input.text, input.labels);
  }

  async tokenize(input: InferenceTextRequestDto): Promise<TokenizeResult> {
    return await this.requireApplication().tokenize(input.text, input.model);
  }

  async listModels(): Promise<InferenceModel[]> {
    return await this.requireApplication().listModels();
  }

  async pullModel(params: InferenceModelParamsDto, body: InferenceModelPullRequestDto): Promise<ModelPullProgress[]> {
    const events: ModelPullProgress[] = [];
    for await (const event of this.requireApplication().pullModel(params.modelId, { force: body.force ?? false })) {
      events.push(ModelPullProgressSchema.parse(event));
    }
    return events;
  }

  async removeModel(params: InferenceModelParamsDto): Promise<{ ok: boolean }> {
    return await this.requireApplication().rmModel(params.modelId);
  }

  async listBackends(): Promise<InferenceBackendInfo[]> {
    if (this.options?.application) return await this.options.application.listBackends();
    const configured = process.env["FULCRUM_INFERENCE_BACKEND"] ?? "embedded";
    const featuresEnv = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    const localBackendEnabled =
      isFeatureEnabled("embeddings", featuresEnv) ||
      isFeatureEnabled("router-llm", featuresEnv);
    const external = isFeatureEnabled("external-llm-provider", featuresEnv);

    return [
      { id: "embedded", available: true, active: configured === "embedded", reason: null },
      {
        id: "ollama",
        available: localBackendEnabled,
        active: configured === "ollama",
        reason: localBackendEnabled ? null : "flag disabled",
      },
      {
        id: "lm-studio",
        available: localBackendEnabled,
        active: configured === "lm-studio",
        reason: localBackendEnabled ? null : "flag disabled",
      },
      {
        id: "openai-compatible",
        available: external,
        active: configured === "openai-compatible",
        reason: external ? null : "flag disabled",
      },
    ];
  }

  async probeBackends(): Promise<BackendHealth[]> {
    this.requireEnabled();
    return await (this.options?.probeBackends ?? probeConfiguredBackends)();
  }

  getConfig(): FeatureBackendMap {
    this.requireEnabled();
    return { ...DEFAULT_FEATURE_BACKEND_MAP, ...getRoutingConfig() };
  }

  setConfig(input: InferenceConfigSetRequestDto): { ok: boolean; config: FeatureBackendMap } {
    this.requireEnabled();
    setRoutingConfig(input.feature, input.backend);
    return { ok: true, config: this.getConfig() };
  }

  setProvider(input: InferenceProviderSetRequestDto): InferenceProviderSetResult {
    this.requireEnabled();
    process.env["FULCRUM_INFERENCE_URL"] = input.url;
    process.env["FULCRUM_INFERENCE_API_KEY"] = input.key;
    return {
      ok: true,
      url: input.url,
      credentialRef: {
        kind: "env",
        name: "FULCRUM_INFERENCE_API_KEY",
        redacted: true,
      },
    };
  }

  async testProvider(): Promise<{ ok: boolean; latency_ms?: number; error?: string }> {
    this.requireEnabled();
    const { OpenAICompatibleBackend } = await import("@platform-core/application/inference/backends/openai-compatible.ts");
    const backend = new OpenAICompatibleBackend({
      flagEnabled: isFeatureEnabled("external-llm-provider", this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES),
    });
    return await backend.testConnection();
  }

  private requireApplication(): InferenceApplicationPort {
    this.requireEnabled();
    const application = this.options?.application ?? this.client;
    if (!application) return new InferenceClient();
    return application;
  }

  private requireEnabled(): void {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
  }
}

export class InferencePublicApiController {
  constructor(private readonly inference: InferencePublicApiService) {}

  async health(): Promise<HealthResult> {
    return await this.inference.health();
  }

  async embed(body: InferenceEmbedRequestDto): Promise<EmbedResult> {
    return await this.inference.embed(body);
  }

  async generate(body: InferenceGenerateRequestDto): Promise<GenerateResult> {
    return await this.inference.generate(body);
  }

  async classify(body: InferenceClassifyRequestDto): Promise<ClassifyResult> {
    return await this.inference.classify(body);
  }

  async tokenize(body: InferenceTextRequestDto): Promise<TokenizeResult> {
    return await this.inference.tokenize(body);
  }

  async listModels(): Promise<InferenceModel[]> {
    return await this.inference.listModels();
  }

  async pullModel(params: InferenceModelParamsDto, body: InferenceModelPullRequestDto): Promise<ModelPullProgress[]> {
    return await this.inference.pullModel(params, body);
  }

  async removeModel(params: InferenceModelParamsDto): Promise<{ ok: boolean }> {
    return await this.inference.removeModel(params);
  }

  async listBackends(): Promise<InferenceBackendInfo[]> {
    return await this.inference.listBackends();
  }

  async probeBackends(): Promise<BackendHealth[]> {
    return await this.inference.probeBackends();
  }

  async getConfig(): Promise<FeatureBackendMap> {
    return this.inference.getConfig();
  }

  async setConfig(body: InferenceConfigSetRequestDto): Promise<{ ok: boolean; config: FeatureBackendMap }> {
    return this.inference.setConfig(body);
  }

  async setProvider(body: InferenceProviderSetRequestDto): Promise<InferenceProviderSetResult> {
    return this.inference.setProvider(body);
  }

  async testProvider(): Promise<{ ok: boolean; latency_ms?: number; error?: string }> {
    return await this.inference.testProvider();
  }
}

export class InferencePublicApiModule {
  static register(options: InferencePublicApiOptions): NestDynamicModule {
    return {
      module: InferencePublicApiModule,
      controllers: [InferencePublicApiController],
      providers: [
        { provide: INFERENCE_PUBLIC_API_OPTIONS, useValue: options },
        { provide: InferenceClient, useFactory: () => new InferenceClient() },
        InferencePublicApiService,
      ],
      exports: [InferencePublicApiService],
    };
  }
}

function optionalModel(input: { model?: string }): { model?: string } {
  return input.model ? { model: input.model } : {};
}

function clean(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  );
}

Inject(INFERENCE_PUBLIC_API_OPTIONS)(InferencePublicApiService, undefined, 0);
Inject(InferenceClient)(InferencePublicApiService, undefined, 1);
Inject(InferencePublicApiService)(InferencePublicApiController, undefined, 0);

IsArray()(InferenceEmbedRequestDto.prototype, "texts");
ArrayMinSize(1)(InferenceEmbedRequestDto.prototype, "texts");
ArrayMaxSize(MAX_TEXT_ITEMS)(InferenceEmbedRequestDto.prototype, "texts");
IsString({ each: true })(InferenceEmbedRequestDto.prototype, "texts");
MaxLength(MAX_TEXT_CHARS, { each: true })(InferenceEmbedRequestDto.prototype, "texts");
IsOptional()(InferenceEmbedRequestDto.prototype, "model");
IsString()(InferenceEmbedRequestDto.prototype, "model");
MaxLength(MAX_MODEL_ID_CHARS)(InferenceEmbedRequestDto.prototype, "model");

IsString()(InferenceTextRequestDto.prototype, "text");
MinLength(1)(InferenceTextRequestDto.prototype, "text");
MaxLength(MAX_TEXT_CHARS)(InferenceTextRequestDto.prototype, "text");
IsOptional()(InferenceTextRequestDto.prototype, "model");
IsString()(InferenceTextRequestDto.prototype, "model");
MaxLength(MAX_MODEL_ID_CHARS)(InferenceTextRequestDto.prototype, "model");

IsString()(InferenceGenerateRequestDto.prototype, "prompt");
MinLength(1)(InferenceGenerateRequestDto.prototype, "prompt");
MaxLength(MAX_TEXT_CHARS)(InferenceGenerateRequestDto.prototype, "prompt");
IsOptional()(InferenceGenerateRequestDto.prototype, "model");
IsString()(InferenceGenerateRequestDto.prototype, "model");
MaxLength(MAX_MODEL_ID_CHARS)(InferenceGenerateRequestDto.prototype, "model");
IsOptional()(InferenceGenerateRequestDto.prototype, "maxTokens");
IsNumber()(InferenceGenerateRequestDto.prototype, "maxTokens");
Min(1)(InferenceGenerateRequestDto.prototype, "maxTokens");
IsOptional()(InferenceGenerateRequestDto.prototype, "temperature");
IsNumber()(InferenceGenerateRequestDto.prototype, "temperature");
Min(0)(InferenceGenerateRequestDto.prototype, "temperature");
Max(2)(InferenceGenerateRequestDto.prototype, "temperature");

IsString()(InferenceClassifyRequestDto.prototype, "text");
MinLength(1)(InferenceClassifyRequestDto.prototype, "text");
MaxLength(MAX_TEXT_CHARS)(InferenceClassifyRequestDto.prototype, "text");
IsArray()(InferenceClassifyRequestDto.prototype, "labels");
ArrayMinSize(1)(InferenceClassifyRequestDto.prototype, "labels");
ArrayMaxSize(MAX_LABELS)(InferenceClassifyRequestDto.prototype, "labels");
IsString({ each: true })(InferenceClassifyRequestDto.prototype, "labels");
MaxLength(200, { each: true })(InferenceClassifyRequestDto.prototype, "labels");

IsString()(InferenceModelParamsDto.prototype, "modelId");
MinLength(1)(InferenceModelParamsDto.prototype, "modelId");
MaxLength(MAX_MODEL_ID_CHARS)(InferenceModelParamsDto.prototype, "modelId");
IsOptional()(InferenceModelPullRequestDto.prototype, "force");
IsBoolean()(InferenceModelPullRequestDto.prototype, "force");

IsString()(InferenceConfigSetRequestDto.prototype, "feature");
IsIn(["embeddings", "router-llm", "memory-llm-extract", "classify", "tokenize"])(InferenceConfigSetRequestDto.prototype, "feature");
IsString()(InferenceConfigSetRequestDto.prototype, "backend");
IsIn(BACKEND_IDS)(InferenceConfigSetRequestDto.prototype, "backend");

IsUrl({ require_tld: false })(InferenceProviderSetRequestDto.prototype, "url");
MinLength(1)(InferenceProviderSetRequestDto.prototype, "url");
IsString()(InferenceProviderSetRequestDto.prototype, "key");
MinLength(1)(InferenceProviderSetRequestDto.prototype, "key");

const descriptors = {
  health: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "health"),
  embed: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "embed"),
  generate: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "generate"),
  classify: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "classify"),
  tokenize: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "tokenize"),
  listModels: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "listModels"),
  pullModel: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "pullModel"),
  removeModel: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "removeModel"),
  listBackends: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "listBackends"),
  probeBackends: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "probeBackends"),
  getConfig: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "getConfig"),
  setConfig: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "setConfig"),
  setProvider: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "setProvider"),
  testProvider: Object.getOwnPropertyDescriptor(InferencePublicApiController.prototype, "testProvider"),
};

if (Object.values(descriptors).some((descriptor) => descriptor === undefined)) {
  throw new Error("InferencePublicApiController route descriptors are missing");
}

Controller("api/v1/inference")(InferencePublicApiController);
ApiTags("inference")(InferencePublicApiController);

Get("health")(InferencePublicApiController.prototype, "health", descriptors.health!);
ApiOperation({ summary: "Get inference runtime health" })(InferencePublicApiController.prototype, "health", descriptors.health!);
ApiOkResponse({ description: "Inference runtime health" })(InferencePublicApiController.prototype, "health", descriptors.health!);

Post("embed")(InferencePublicApiController.prototype, "embed", descriptors.embed!);
Body()(InferencePublicApiController.prototype, "embed", 0);
ApiBody({ type: InferenceEmbedRequestDto })(InferencePublicApiController.prototype, "embed", descriptors.embed!);

Post("generate")(InferencePublicApiController.prototype, "generate", descriptors.generate!);
Body()(InferencePublicApiController.prototype, "generate", 0);
ApiBody({ type: InferenceGenerateRequestDto })(InferencePublicApiController.prototype, "generate", descriptors.generate!);

Post("classify")(InferencePublicApiController.prototype, "classify", descriptors.classify!);
Body()(InferencePublicApiController.prototype, "classify", 0);
ApiBody({ type: InferenceClassifyRequestDto })(InferencePublicApiController.prototype, "classify", descriptors.classify!);

Post("tokenize")(InferencePublicApiController.prototype, "tokenize", descriptors.tokenize!);
Body()(InferencePublicApiController.prototype, "tokenize", 0);
ApiBody({ type: InferenceTextRequestDto })(InferencePublicApiController.prototype, "tokenize", descriptors.tokenize!);

Get("models")(InferencePublicApiController.prototype, "listModels", descriptors.listModels!);
Post("models/:modelId/pull")(InferencePublicApiController.prototype, "pullModel", descriptors.pullModel!);
Param()(InferencePublicApiController.prototype, "pullModel", 0);
Body()(InferencePublicApiController.prototype, "pullModel", 1);
ApiParam({ name: "modelId" })(InferencePublicApiController.prototype, "pullModel", descriptors.pullModel!);
Delete("models/:modelId")(InferencePublicApiController.prototype, "removeModel", descriptors.removeModel!);
Param()(InferencePublicApiController.prototype, "removeModel", 0);
ApiParam({ name: "modelId" })(InferencePublicApiController.prototype, "removeModel", descriptors.removeModel!);

Get("backends")(InferencePublicApiController.prototype, "listBackends", descriptors.listBackends!);
Get("backends/probe")(InferencePublicApiController.prototype, "probeBackends", descriptors.probeBackends!);

Get("config")(InferencePublicApiController.prototype, "getConfig", descriptors.getConfig!);
Patch("config")(InferencePublicApiController.prototype, "setConfig", descriptors.setConfig!);
Body()(InferencePublicApiController.prototype, "setConfig", 0);
ApiBody({ type: InferenceConfigSetRequestDto })(InferencePublicApiController.prototype, "setConfig", descriptors.setConfig!);

Patch("provider")(InferencePublicApiController.prototype, "setProvider", descriptors.setProvider!);
Body()(InferencePublicApiController.prototype, "setProvider", 0);
ApiBody({ type: InferenceProviderSetRequestDto })(InferencePublicApiController.prototype, "setProvider", descriptors.setProvider!);
Post("provider/test")(InferencePublicApiController.prototype, "testProvider", descriptors.testProvider!);

Module({
  controllers: [InferencePublicApiController],
  providers: [
    { provide: INFERENCE_PUBLIC_API_OPTIONS, useValue: null },
    { provide: InferenceClient, useFactory: () => new InferenceClient() },
    InferencePublicApiService,
  ],
  exports: [InferencePublicApiService],
})(InferencePublicApiModule);
