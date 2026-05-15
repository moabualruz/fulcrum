import "reflect-metadata";

import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Patch,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { PLATFORM_FEATURE_FLAG_ENTITIES } from "@platform-core/infrastructure/database/feature-flag.entities.ts";
import {
  FeatureFlagStore,
  type FeatureFlagPublicRow,
} from "@platform-core/infrastructure/database/feature-flag-store.ts";

import { FeatureFlagListQueryDto, FeatureFlagEvaluateQueryDto, FeatureFlagSetDto, FeatureFlagOverrideDto, FeatureFlagRolloutDto } from "./dto/feature-flag.dto.ts";
export { FeatureFlagListQueryDto, FeatureFlagEvaluateQueryDto, FeatureFlagSetDto, FeatureFlagOverrideDto, FeatureFlagRolloutDto };

export const FEATURE_FLAG_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.featureFlagPublicApi.options");

export interface FeatureFlagPublicApiOptions {
  featuresEnv?: string;
}

export class FeatureFlagPublicApiService {
  constructor(
    private readonly options: FeatureFlagPublicApiOptions | null = null,
    private readonly store: FeatureFlagStore | null = null,
  ) {}

  async list(query: FeatureFlagListQueryDto = {}): Promise<FeatureFlagPublicRow[]> {
    return await this.requireStore().list({ ...query, featuresEnv: this.options?.featuresEnv });
  }

  async evaluate(query: FeatureFlagEvaluateQueryDto): Promise<unknown> {
    try {
      return await this.requireStore().evaluate({ ...query, featuresEnv: this.options?.featuresEnv });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown feature flag:")) {
        throw new NotFoundException({ error: error.message });
      }
      throw error;
    }
  }

  async set(input: FeatureFlagSetDto): Promise<FeatureFlagPublicRow> {
    return await this.mapUnknown(() => this.requireStore().set(input));
  }

  async setOverride(input: FeatureFlagOverrideDto): Promise<FeatureFlagPublicRow> {
    return await this.mapUnknown(() => this.requireStore().setOverride(input));
  }

  async setRollout(input: FeatureFlagRolloutDto): Promise<FeatureFlagPublicRow> {
    return await this.mapUnknown(() => this.requireStore().setRollout(input));
  }

  private async mapUnknown<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown feature flag:")) {
        throw new NotFoundException({ error: error.message });
      }
      throw error;
    }
  }

  private requireStore(): FeatureFlagStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Feature flag public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class FeatureFlagPublicApiController {
  constructor(private readonly flags: FeatureFlagPublicApiService) {}

  async list(query: FeatureFlagListQueryDto = {}): Promise<FeatureFlagPublicRow[]> {
    return await this.flags.list(query);
  }

  async evaluate(query: FeatureFlagEvaluateQueryDto): Promise<unknown> {
    return await this.flags.evaluate(query);
  }

  async set(body: FeatureFlagSetDto): Promise<FeatureFlagPublicRow> {
    return await this.flags.set(body);
  }

  async setOverride(body: FeatureFlagOverrideDto): Promise<FeatureFlagPublicRow> {
    return await this.flags.setOverride(body);
  }

  async setRollout(body: FeatureFlagRolloutDto): Promise<FeatureFlagPublicRow> {
    return await this.flags.setRollout(body);
  }
}

export class FeatureFlagPublicApiModule {
  static register(options: FeatureFlagPublicApiOptions): NestDynamicModule {
    return {
      module: FeatureFlagPublicApiModule,
      imports: [TypeOrmModule.forFeature(PLATFORM_FEATURE_FLAG_ENTITIES)],
      controllers: [FeatureFlagPublicApiController],
      providers: [
        { provide: FEATURE_FLAG_PUBLIC_API_OPTIONS, useValue: options },
        FeatureFlagStore,
        FeatureFlagPublicApiService,
      ],
      exports: [FeatureFlagPublicApiService],
    };
  }
}

Inject(FEATURE_FLAG_PUBLIC_API_OPTIONS)(FeatureFlagPublicApiService, undefined, 0);
Inject(FeatureFlagStore)(FeatureFlagPublicApiService, undefined, 1);
Inject(DataSource)(FeatureFlagStore, undefined, 0);
Inject(FeatureFlagPublicApiService)(FeatureFlagPublicApiController, undefined, 0);

for (const target of [FeatureFlagListQueryDto, FeatureFlagSetDto, FeatureFlagOverrideDto, FeatureFlagRolloutDto] as const) {
  IsOptional()(target.prototype, "userId");
  IsString()(target.prototype, "userId");
}

for (const target of [FeatureFlagEvaluateQueryDto, FeatureFlagSetDto, FeatureFlagOverrideDto, FeatureFlagRolloutDto] as const) {
  IsString()(target.prototype, "flag");
  MinLength(1)(target.prototype, "flag");
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
}

IsOptional()(FeatureFlagListQueryDto.prototype, "orgId");
IsString()(FeatureFlagListQueryDto.prototype, "orgId");
IsOptional()(FeatureFlagListQueryDto.prototype, "userId");
IsString()(FeatureFlagListQueryDto.prototype, "userId");

IsString()(FeatureFlagEvaluateQueryDto.prototype, "userId");
MinLength(1)(FeatureFlagEvaluateQueryDto.prototype, "userId");
IsBoolean()(FeatureFlagSetDto.prototype, "enabled");
IsBoolean()(FeatureFlagOverrideDto.prototype, "enabled");
IsInt()(FeatureFlagRolloutDto.prototype, "rolloutPercent");
Min(0)(FeatureFlagRolloutDto.prototype, "rolloutPercent");
Max(100)(FeatureFlagRolloutDto.prototype, "rolloutPercent");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "list"),
  evaluate: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "evaluate"),
  set: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "set"),
  setOverride: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "setOverride"),
  setRollout: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "setRollout"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("FeatureFlagPublicApiController route descriptors are missing");
}

Controller("api/v1/feature-flags")(FeatureFlagPublicApiController);
ApiTags("feature-flags")(FeatureFlagPublicApiController);

applyGetRoute("list", "", FeatureFlagListQueryDto, "List feature flags");
applyGetRoute("evaluate", "evaluate", FeatureFlagEvaluateQueryDto, "Evaluate feature flag");
applyPatchRoute("set", "", FeatureFlagSetDto, "Set feature flag");
applyPatchRoute("setOverride", "override", FeatureFlagOverrideDto, "Set organization feature flag override");
applyPatchRoute("setRollout", "rollout", FeatureFlagRolloutDto, "Set feature flag rollout");

Module({
  imports: [TypeOrmModule.forFeature(PLATFORM_FEATURE_FLAG_ENTITIES)],
  controllers: [FeatureFlagPublicApiController],
  providers: [
    { provide: FEATURE_FLAG_PUBLIC_API_OPTIONS, useValue: null },
    FeatureFlagStore,
    FeatureFlagPublicApiService,
  ],
  exports: [FeatureFlagPublicApiService],
})(FeatureFlagPublicApiModule);

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(FeatureFlagPublicApiController.prototype, method, descriptor);
  Query()(FeatureFlagPublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(FeatureFlagPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(FeatureFlagPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(FeatureFlagPublicApiController.prototype, method, descriptor);
}

function applyPatchRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Patch(path)(FeatureFlagPublicApiController.prototype, method, descriptor);
  Body()(FeatureFlagPublicApiController.prototype, method, 0);
  ApiBody({ type: bodyType })(FeatureFlagPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(FeatureFlagPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(FeatureFlagPublicApiController.prototype, method, descriptor);
}
