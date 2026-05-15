import "reflect-metadata";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  normalizeThemeTokenKey,
  validateThemeTokenValue,
  type ThemeProfileSettings,
  type ThemeScope,
} from "@platform-core/application/theme-settings.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { FULCRUM_THEME_SETTING_ENTITIES } from "@platform-core/infrastructure/database/theme-settings.entities.ts";
import { ThemeSettingsStore } from "@platform-core/infrastructure/database/theme-settings-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

export const THEME_SETTINGS_API_OPTIONS = Symbol.for("fulcrum.themeSettingsApi.options");

export interface ThemeSettingsApiOptions {
  featuresEnv?: string;
}

export class ThemeSettingsQueryDto implements ThemeScope {
  orgId!: string;
  userId!: string;
}

export class ThemeTokenParamsDto {
  key!: string;
}

export class ThemeTokenUpsertDto extends ThemeSettingsQueryDto {
  value!: string;
}

export class ThemeProfileUpdateDto extends ThemeSettingsQueryDto implements Partial<ThemeProfileSettings> {
  accentHue?: number;
  accentSaturation?: number;
  accentLightness?: number;
  radius?: number;
  fontFamily?: ThemeProfileSettings["fontFamily"];
  colorScheme?: ThemeProfileSettings["colorScheme"];
  compactMode?: boolean;
  animationSpeed?: ThemeProfileSettings["animationSpeed"];
  preset?: ThemeProfileSettings["preset"];
}

type ThemeSettingsPort = Pick<
  ThemeSettingsStore,
  "getProfile" | "getToken" | "listTokens" | "setToken" | "updateProfile"
>;

export class ThemeSettingsApiService {
  constructor(
    private readonly options: ThemeSettingsApiOptions | null = null,
    private readonly store: ThemeSettingsPort | null = null,
  ) {}

  async getProfile(scope: ThemeScope): Promise<ThemeProfileSettings> {
    return await this.requireStore().getProfile(scope);
  }

  async updateProfile(input: ThemeProfileUpdateDto): Promise<ThemeProfileSettings> {
    const { orgId, userId, ...settings } = input;
    return await this.requireStore().updateProfile({ orgId, userId }, clean(settings));
  }

  async listTokens(scope: ThemeScope) {
    return await this.requireStore().listTokens(scope);
  }

  async getToken(scope: ThemeScope, keyInput: string) {
    return await this.requireStore().getToken(scope, normalizeTokenKey(keyInput));
  }

  async setToken(scope: ThemeScope, keyInput: string, value: string) {
    const key = normalizeTokenKey(keyInput);
    return await this.requireStore().setToken(scope, key, validateTokenValue(key, value));
  }

  private requireStore(): ThemeSettingsPort {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Theme settings TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class ThemeSettingsApiController {
  constructor(private readonly themeSettings: ThemeSettingsApiService) {}

  async getProfile(query: ThemeSettingsQueryDto): Promise<ThemeProfileSettings> {
    return await this.themeSettings.getProfile(query);
  }

  async updateProfile(body: ThemeProfileUpdateDto): Promise<ThemeProfileSettings> {
    return await this.themeSettings.updateProfile(body);
  }

  async listTokens(query: ThemeSettingsQueryDto) {
    return await this.themeSettings.listTokens(query);
  }

  async getToken(params: ThemeTokenParamsDto, query: ThemeSettingsQueryDto) {
    return await this.themeSettings.getToken(query, params.key);
  }

  async setToken(params: ThemeTokenParamsDto, body: ThemeTokenUpsertDto) {
    return await this.themeSettings.setToken({ orgId: body.orgId, userId: body.userId }, params.key, body.value);
  }
}

export class ThemeSettingsApiModule {
  static register(options: ThemeSettingsApiOptions): NestDynamicModule {
    return {
      module: ThemeSettingsApiModule,
      imports: [TypeOrmModule.forFeature(FULCRUM_THEME_SETTING_ENTITIES)],
      controllers: [ThemeSettingsApiController],
      providers: [
        { provide: THEME_SETTINGS_API_OPTIONS, useValue: options },
        ThemeSettingsStore,
        ThemeSettingsApiService,
      ],
      exports: [ThemeSettingsApiService],
    };
  }
}

function clean(input: Partial<ThemeProfileSettings>): Partial<ThemeProfileSettings> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<ThemeProfileSettings>;
}

function normalizeTokenKey(keyInput: string): string {
  try {
    return normalizeThemeTokenKey(keyInput);
  } catch (error) {
    if (error instanceof AppValidationError) throw new BadRequestException(error.message);
    throw error;
  }
}

function validateTokenValue(key: string, value: string): string {
  try {
    return validateThemeTokenValue(normalizeThemeTokenKey(key), value);
  } catch (error) {
    if (error instanceof AppValidationError) throw new BadRequestException(error.message);
    throw error;
  }
}

Inject(THEME_SETTINGS_API_OPTIONS)(ThemeSettingsApiService, undefined, 0);
Inject(ThemeSettingsStore)(ThemeSettingsApiService, undefined, 1);
Inject(DataSource)(ThemeSettingsStore, undefined, 0);
Inject(ThemeSettingsApiService)(ThemeSettingsApiController, undefined, 0);

for (const dto of [ThemeSettingsQueryDto, ThemeTokenUpsertDto] as const) {
  for (const property of ["orgId", "userId"] as const) {
    IsString()(dto.prototype, property);
    MinLength(1)(dto.prototype, property);
  }
}

IsString()(ThemeTokenParamsDto.prototype, "key");
MinLength(1)(ThemeTokenParamsDto.prototype, "key");
IsString()(ThemeTokenUpsertDto.prototype, "value");
MinLength(1)(ThemeTokenUpsertDto.prototype, "value");

for (const property of ["accentHue", "accentSaturation", "accentLightness"] as const) {
  IsOptional()(ThemeProfileUpdateDto.prototype, property);
  IsNumber()(ThemeProfileUpdateDto.prototype, property);
  Min(0)(ThemeProfileUpdateDto.prototype, property);
  Max(property === "accentHue" ? 360 : 100)(ThemeProfileUpdateDto.prototype, property);
}
IsOptional()(ThemeProfileUpdateDto.prototype, "radius");
IsNumber()(ThemeProfileUpdateDto.prototype, "radius");
Min(0)(ThemeProfileUpdateDto.prototype, "radius");
Max(1.5)(ThemeProfileUpdateDto.prototype, "radius");
IsOptional()(ThemeProfileUpdateDto.prototype, "fontFamily");
IsIn(["inter", "system", "mono"])(ThemeProfileUpdateDto.prototype, "fontFamily");
IsOptional()(ThemeProfileUpdateDto.prototype, "colorScheme");
IsIn(["light", "dark", "auto"])(ThemeProfileUpdateDto.prototype, "colorScheme");
IsOptional()(ThemeProfileUpdateDto.prototype, "compactMode");
IsBoolean()(ThemeProfileUpdateDto.prototype, "compactMode");
IsOptional()(ThemeProfileUpdateDto.prototype, "animationSpeed");
IsIn(["normal", "reduced", "off"])(ThemeProfileUpdateDto.prototype, "animationSpeed");
IsOptional()(ThemeProfileUpdateDto.prototype, "preset");
IsIn(["default", "ocean", "forest", "sunset", "monochrome"])(ThemeProfileUpdateDto.prototype, "preset");

const getProfileDescriptor = Object.getOwnPropertyDescriptor(ThemeSettingsApiController.prototype, "getProfile");
const updateProfileDescriptor = Object.getOwnPropertyDescriptor(ThemeSettingsApiController.prototype, "updateProfile");
const listTokensDescriptor = Object.getOwnPropertyDescriptor(ThemeSettingsApiController.prototype, "listTokens");
const getTokenDescriptor = Object.getOwnPropertyDescriptor(ThemeSettingsApiController.prototype, "getToken");
const setTokenDescriptor = Object.getOwnPropertyDescriptor(ThemeSettingsApiController.prototype, "setToken");

if (!getProfileDescriptor || !updateProfileDescriptor || !listTokensDescriptor || !getTokenDescriptor || !setTokenDescriptor) {
  throw new Error("ThemeSettingsApiController route descriptors are missing");
}

Controller("api/v1/settings/theme")(ThemeSettingsApiController);
ApiTags("theme-settings")(ThemeSettingsApiController);

Get()(ThemeSettingsApiController.prototype, "getProfile", getProfileDescriptor);
Query()(ThemeSettingsApiController.prototype, "getProfile", 0);
ApiOperation({ summary: "Get theme profile preferences" })(
  ThemeSettingsApiController.prototype,
  "getProfile",
  getProfileDescriptor,
);
ApiOkResponse({ description: "Theme profile preferences" })(
  ThemeSettingsApiController.prototype,
  "getProfile",
  getProfileDescriptor,
);

Patch()(ThemeSettingsApiController.prototype, "updateProfile", updateProfileDescriptor);
Body()(ThemeSettingsApiController.prototype, "updateProfile", 0);
ApiOperation({ summary: "Update theme profile preferences" })(
  ThemeSettingsApiController.prototype,
  "updateProfile",
  updateProfileDescriptor,
);
ApiBody({ type: ThemeProfileUpdateDto })(ThemeSettingsApiController.prototype, "updateProfile", updateProfileDescriptor);
ApiOkResponse({ description: "Updated theme profile preferences" })(
  ThemeSettingsApiController.prototype,
  "updateProfile",
  updateProfileDescriptor,
);

Get("tokens")(ThemeSettingsApiController.prototype, "listTokens", listTokensDescriptor);
Query()(ThemeSettingsApiController.prototype, "listTokens", 0);
ApiOperation({ summary: "List theme token settings" })(
  ThemeSettingsApiController.prototype,
  "listTokens",
  listTokensDescriptor,
);
ApiOkResponse({ description: "Theme token settings" })(
  ThemeSettingsApiController.prototype,
  "listTokens",
  listTokensDescriptor,
);

Get("tokens/:key")(ThemeSettingsApiController.prototype, "getToken", getTokenDescriptor);
Param()(ThemeSettingsApiController.prototype, "getToken", 0);
Query()(ThemeSettingsApiController.prototype, "getToken", 1);
ApiOperation({ summary: "Get a theme token setting" })(
  ThemeSettingsApiController.prototype,
  "getToken",
  getTokenDescriptor,
);
ApiParam({ name: "key", required: true })(ThemeSettingsApiController.prototype, "getToken", getTokenDescriptor);
ApiOkResponse({ description: "Theme token setting" })(
  ThemeSettingsApiController.prototype,
  "getToken",
  getTokenDescriptor,
);

Put("tokens/:key")(ThemeSettingsApiController.prototype, "setToken", setTokenDescriptor);
Param()(ThemeSettingsApiController.prototype, "setToken", 0);
Body()(ThemeSettingsApiController.prototype, "setToken", 1);
ApiOperation({ summary: "Set a theme token setting" })(
  ThemeSettingsApiController.prototype,
  "setToken",
  setTokenDescriptor,
);
ApiParam({ name: "key", required: true })(ThemeSettingsApiController.prototype, "setToken", setTokenDescriptor);
ApiBody({ type: ThemeTokenUpsertDto })(ThemeSettingsApiController.prototype, "setToken", setTokenDescriptor);
ApiOkResponse({ description: "Updated theme token setting" })(
  ThemeSettingsApiController.prototype,
  "setToken",
  setTokenDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(FULCRUM_THEME_SETTING_ENTITIES)],
  controllers: [ThemeSettingsApiController],
  providers: [
    { provide: THEME_SETTINGS_API_OPTIONS, useValue: null },
    ThemeSettingsStore,
    ThemeSettingsApiService,
  ],
  exports: [ThemeSettingsApiService],
})(ThemeSettingsApiModule);
