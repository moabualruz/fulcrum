import "reflect-metadata";

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { PLATFORM_FEATURE_FLAG_ENTITIES } from "@feature-flags/infrastructure/database/entities/feature-flag.entities.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import {
  setSettingsFeatureFlagCohortRules,
  setSettingsFeatureFlagRollout,
  toggleSettingsFeatureFlag,
} from "@platform-core/application/settings/commands.ts";
import { listSettingsFeatureFlags } from "@platform-core/application/settings/queries.ts";
import {
  FeatureFlagStore,
  type FeatureFlagPublicRow,
} from "@feature-flags/infrastructure/database/repositories/feature-flag-store.ts";

import { FeatureFlagListQueryDto, FeatureFlagEvaluateQueryDto, FeatureFlagSetDto, FeatureFlagOverrideDto, FeatureFlagRolloutDto } from "../dto/feature-flag.dto.ts";
export { FeatureFlagListQueryDto, FeatureFlagEvaluateQueryDto, FeatureFlagSetDto, FeatureFlagOverrideDto, FeatureFlagRolloutDto };

export const FEATURE_FLAG_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.featureFlagPublicApi.options");

export interface FeatureFlagPublicApiOptions {
  featuresEnv?: string;
}

export class FeatureFlagPublicApiService {
  constructor(
    private readonly options: FeatureFlagPublicApiOptions | null = null,
    private readonly store: FeatureFlagStore | null = null,
    private readonly dataSource: DataSource | null = null,
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

  async listSettingsFlags(input: FeatureFlagSettingsScopeDto) {
    this.requireStore();
    return await this.mapAppErrors(() => listSettingsFeatureFlags(this.requireDataSource().manager, settingsContext(input)));
  }

  async toggleSettingsFlag(params: FeatureFlagSettingsIdParamsDto, input: FeatureFlagSettingsScopeDto): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      toggleSettingsFeatureFlag(this.requireDataSource().manager, settingsContext(input), { id: params.id })
    );
  }

  async setSettingsFlagRollout(
    params: FeatureFlagSettingsIdParamsDto,
    input: FeatureFlagSettingsRolloutDto,
  ): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      setSettingsFeatureFlagRollout(this.requireDataSource().manager, settingsContext(input), {
        id: params.id,
        rolloutPercent: input.rolloutPercent,
      })
    );
  }

  async setSettingsFlagCohortRules(
    params: FeatureFlagSettingsIdParamsDto,
    input: FeatureFlagSettingsCohortRulesDto,
  ): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      setSettingsFeatureFlagCohortRules(this.requireDataSource().manager, settingsContext(input), {
        id: params.id,
        rules: input.rules ?? {},
      })
    );
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

  private async mapAppErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AppError) throw appHttpError(error);
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

  private requireDataSource(): DataSource {
    if (!this.dataSource) {
      throw new InternalServerErrorException("Feature flag settings public API data source is not configured.");
    }
    return this.dataSource;
  }
}

export class FeatureFlagSettingsScopeDto {
  orgId!: string;
  userId?: string | null;
}

export class FeatureFlagSettingsIdParamsDto {
  id!: string;
}

export class FeatureFlagSettingsRolloutDto extends FeatureFlagSettingsScopeDto {
  rolloutPercent!: number;
}

export class FeatureFlagSettingsCohortRulesDto extends FeatureFlagSettingsScopeDto {
  rules!: Record<string, unknown>;
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

  async listSettingsFlags(query: FeatureFlagSettingsScopeDto) {
    return await this.flags.listSettingsFlags(query);
  }

  async toggleSettingsFlag(params: FeatureFlagSettingsIdParamsDto, body: FeatureFlagSettingsScopeDto): Promise<{ success: true }> {
    return await this.flags.toggleSettingsFlag(params, body);
  }

  async setSettingsFlagRollout(
    params: FeatureFlagSettingsIdParamsDto,
    body: FeatureFlagSettingsRolloutDto,
  ): Promise<{ success: true }> {
    return await this.flags.setSettingsFlagRollout(params, body);
  }

  async setSettingsFlagCohortRules(
    params: FeatureFlagSettingsIdParamsDto,
    body: FeatureFlagSettingsCohortRulesDto,
  ): Promise<{ success: true }> {
    return await this.flags.setSettingsFlagCohortRules(params, body);
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
Inject(DataSource)(FeatureFlagPublicApiService, undefined, 2);
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

for (const target of [FeatureFlagSettingsScopeDto, FeatureFlagSettingsRolloutDto, FeatureFlagSettingsCohortRulesDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsOptional()(target.prototype, "userId");
  IsString()(target.prototype, "userId");
}
IsString()(FeatureFlagSettingsIdParamsDto.prototype, "id");
MinLength(1)(FeatureFlagSettingsIdParamsDto.prototype, "id");
IsInt()(FeatureFlagSettingsRolloutDto.prototype, "rolloutPercent");
Min(0)(FeatureFlagSettingsRolloutDto.prototype, "rolloutPercent");
Max(100)(FeatureFlagSettingsRolloutDto.prototype, "rolloutPercent");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "list"),
  evaluate: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "evaluate"),
  set: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "set"),
  setOverride: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "setOverride"),
  setRollout: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "setRollout"),
  listSettingsFlags: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "listSettingsFlags"),
  toggleSettingsFlag: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "toggleSettingsFlag"),
  setSettingsFlagRollout: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "setSettingsFlagRollout"),
  setSettingsFlagCohortRules: Object.getOwnPropertyDescriptor(FeatureFlagPublicApiController.prototype, "setSettingsFlagCohortRules"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("FeatureFlagPublicApiController route descriptors are missing");
}

Controller("api/v1/feature-flags")(FeatureFlagPublicApiController);
ApiTags("feature-flags")(FeatureFlagPublicApiController);
ApiForbiddenResponse({ description: "Feature flag operation is forbidden for the current context" })(
  FeatureFlagPublicApiController,
);

applyGetRoute("listSettingsFlags", "settings", FeatureFlagSettingsScopeDto, "List settings feature flags");
applyPatchIdRoute("toggleSettingsFlag", "settings/:id/toggle", FeatureFlagSettingsScopeDto, "Toggle settings feature flag");
applyPatchIdRoute("setSettingsFlagRollout", "settings/:id/rollout", FeatureFlagSettingsRolloutDto, "Set settings feature flag rollout");
applyPatchIdRoute("setSettingsFlagCohortRules", "settings/:id/cohort-rules", FeatureFlagSettingsCohortRulesDto, "Set settings feature flag cohort rules");
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

function applyPatchIdRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Patch(path)(FeatureFlagPublicApiController.prototype, method, descriptor);
  Param()(FeatureFlagPublicApiController.prototype, method, 0);
  Body()(FeatureFlagPublicApiController.prototype, method, 1);
  ApiBody({ type: bodyType })(FeatureFlagPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(FeatureFlagPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(FeatureFlagPublicApiController.prototype, method, descriptor);
}

function settingsContext(input: FeatureFlagSettingsScopeDto) {
  return { orgId: input.orgId, userId: input.userId ?? null, projectId: null };
}

function appHttpError(error: AppError) {
  if (error.kind === "validation") return new BadRequestException(error.message);
  if (error.kind === "unauthorized") return new UnauthorizedException(error.message);
  if (error.kind === "forbidden") return new ForbiddenException(error.message);
  if (error.kind === "not_found") return new NotFoundException(error.message);
  if (error.kind === "conflict") return new ConflictException(error.message);
  return new InternalServerErrorException(error.message);
}
