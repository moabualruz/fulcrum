import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  Param,
  Put,
  Query,
  type DynamicModule as NestDynamicModule,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { TenantSettingStore } from "@platform-core/infrastructure/database/tenant-setting-store.ts";

import { SettingsScopeQueryDto, SettingsKeyParamsDto, SettingsValueDto } from "./dto/settings.dto.ts";
export { SettingsScopeQueryDto, SettingsKeyParamsDto, SettingsValueDto };

export const SETTINGS_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.settingsPublicApi.options");

export interface SettingsPublicApiOptions {
  featuresEnv?: string;
}

type SettingsPort = Pick<TenantSettingStore, "list" | "get" | "set">;

export class SettingsPublicApiService {
  constructor(
    private readonly options: SettingsPublicApiOptions | null = null,
    private readonly store: SettingsPort | null = null,
  ) {}

  async list(scope: SettingsScopeQueryDto) {
    return await this.requireStore().list(scope);
  }

  async get(scope: SettingsScopeQueryDto, key: string) {
    return await this.requireStore().get(scope, key);
  }

  async set(key: string, body: SettingsValueDto) {
    return await this.requireStore().set({ orgId: body.orgId, key, value: body.value });
  }

  private requireStore(): SettingsPort {
    void this.options;
    if (!this.store) {
      throw new InternalServerErrorException("Settings TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class SettingsPublicApiController {
  constructor(private readonly settings: SettingsPublicApiService) {}

  async listSettings(query: SettingsScopeQueryDto) {
    return await this.settings.list(query);
  }

  async getSetting(params: SettingsKeyParamsDto, query: SettingsScopeQueryDto) {
    return await this.settings.get(query, params.key);
  }

  async setSetting(params: SettingsKeyParamsDto, body: SettingsValueDto) {
    return await this.settings.set(params.key, body);
  }
}

export class SettingsPublicApiModule {
  static register(options: SettingsPublicApiOptions): NestDynamicModule {
    return {
      module: SettingsPublicApiModule,
      global: true,
      controllers: [SettingsPublicApiController],
      providers: [
        { provide: SETTINGS_PUBLIC_API_OPTIONS, useValue: options },
        TenantSettingStore,
        SettingsPublicApiService,
      ],
      exports: [SettingsPublicApiService],
    };
  }
}

Inject(SETTINGS_PUBLIC_API_OPTIONS)(SettingsPublicApiService, undefined, 0);
Inject(TenantSettingStore)(SettingsPublicApiService, undefined, 1);
Inject(DataSource)(TenantSettingStore, undefined, 0);
Inject(SettingsPublicApiService)(SettingsPublicApiController, undefined, 0);

for (const dto of [SettingsScopeQueryDto, SettingsValueDto] as const) {
  IsString()(dto.prototype, "orgId");
  MinLength(1)(dto.prototype, "orgId");
  IsOptional()(dto.prototype, "userId");
  IsString()(dto.prototype, "userId");
}
IsString()(SettingsKeyParamsDto.prototype, "key");
MinLength(1)(SettingsKeyParamsDto.prototype, "key");

const listDescriptor = Object.getOwnPropertyDescriptor(SettingsPublicApiController.prototype, "listSettings");
const getDescriptor = Object.getOwnPropertyDescriptor(SettingsPublicApiController.prototype, "getSetting");
const setDescriptor = Object.getOwnPropertyDescriptor(SettingsPublicApiController.prototype, "setSetting");

if (!listDescriptor || !getDescriptor || !setDescriptor) {
  throw new Error("SettingsPublicApiController route descriptors are missing");
}

Controller("api/v1/settings")(SettingsPublicApiController);
ApiTags("settings")(SettingsPublicApiController);

Get()(SettingsPublicApiController.prototype, "listSettings", listDescriptor);
Query()(SettingsPublicApiController.prototype, "listSettings", 0);
ApiOperation({ summary: "List tenant settings" })(
  SettingsPublicApiController.prototype,
  "listSettings",
  listDescriptor,
);
ApiOkResponse({ description: "Tenant settings" })(
  SettingsPublicApiController.prototype,
  "listSettings",
  listDescriptor,
);

Get(":key")(SettingsPublicApiController.prototype, "getSetting", getDescriptor);
Param()(SettingsPublicApiController.prototype, "getSetting", 0);
Query()(SettingsPublicApiController.prototype, "getSetting", 1);
ApiOperation({ summary: "Get tenant setting" })(
  SettingsPublicApiController.prototype,
  "getSetting",
  getDescriptor,
);
ApiParam({ name: "key", required: true })(SettingsPublicApiController.prototype, "getSetting", getDescriptor);
ApiOkResponse({ description: "Tenant setting" })(
  SettingsPublicApiController.prototype,
  "getSetting",
  getDescriptor,
);

Put(":key")(SettingsPublicApiController.prototype, "setSetting", setDescriptor);
Param()(SettingsPublicApiController.prototype, "setSetting", 0);
Body()(SettingsPublicApiController.prototype, "setSetting", 1);
ApiOperation({ summary: "Set tenant setting" })(
  SettingsPublicApiController.prototype,
  "setSetting",
  setDescriptor,
);
ApiParam({ name: "key", required: true })(SettingsPublicApiController.prototype, "setSetting", setDescriptor);
ApiBody({ type: SettingsValueDto })(SettingsPublicApiController.prototype, "setSetting", setDescriptor);
ApiOkResponse({ description: "Tenant setting" })(
  SettingsPublicApiController.prototype,
  "setSetting",
  setDescriptor,
);

Module({
  controllers: [SettingsPublicApiController],
  providers: [
    { provide: SETTINGS_PUBLIC_API_OPTIONS, useValue: {} },
    TenantSettingStore,
    SettingsPublicApiService,
  ],
  exports: [SettingsPublicApiService],
})(SettingsPublicApiModule);
