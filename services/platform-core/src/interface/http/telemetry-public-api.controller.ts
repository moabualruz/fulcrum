import "reflect-metadata";

import { Body, Controller, Delete, ForbiddenException, Get, Inject, InternalServerErrorException, Module, NotFoundException, Post, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  FULCRUM_TELEMETRY_ENTITIES,
} from "@platform-core/infrastructure/database/telemetry.entities.ts";
import {
  TelemetryPermissionError,
  TelemetryPublicStore,
  type TelemetryStatusRow,
} from "@platform-core/infrastructure/database/telemetry-store.ts";

import { TelemetryScopeQueryDto, TelemetryScopeBodyDto } from "./dto/telemetry.dto.ts";
export { TelemetryScopeQueryDto, TelemetryScopeBodyDto };

export const TELEMETRY_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.telemetryPublicApi.options");

export interface TelemetryPublicApiOptions {
  featuresEnv?: string;
}

export class TelemetryPublicApiService {
  constructor(
    private readonly options: TelemetryPublicApiOptions | null = null,
    private readonly store: TelemetryPublicStore | null = null,
  ) {}

  async status(input: TelemetryScopeQueryDto): Promise<TelemetryStatusRow> {
    return await this.mapStoreErrors(() => this.requireStore().status(input));
  }

  async optIn(input: TelemetryScopeBodyDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireStore().setOptedIn({ ...input, value: true }));
    return { ok: true };
  }

  async optOut(input: TelemetryScopeBodyDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireStore().setOptedIn({ ...input, value: false }));
    return { ok: true };
  }

  async purge(input: TelemetryScopeQueryDto): Promise<{ ok: true; deleted: number }> {
    const deleted = await this.mapStoreErrors(() => this.requireStore().purge(input));
    return { ok: true, deleted };
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TelemetryPermissionError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  private requireStore(): TelemetryPublicStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Telemetry public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class TelemetryPublicApiController {
  constructor(private readonly telemetry: TelemetryPublicApiService) {}

  async status(query: TelemetryScopeQueryDto): Promise<TelemetryStatusRow> {
    return await this.telemetry.status(query);
  }

  async optIn(body: TelemetryScopeBodyDto): Promise<{ ok: true }> {
    return await this.telemetry.optIn(body);
  }

  async optOut(body: TelemetryScopeBodyDto): Promise<{ ok: true }> {
    return await this.telemetry.optOut(body);
  }

  async purge(query: TelemetryScopeQueryDto): Promise<{ ok: true; deleted: number }> {
    return await this.telemetry.purge(query);
  }
}

export class TelemetryPublicApiModule {
  static register(options: TelemetryPublicApiOptions): NestDynamicModule {
    return {
      module: TelemetryPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_TELEMETRY_ENTITIES,
      ])],
      controllers: [TelemetryPublicApiController],
      providers: [
        { provide: TELEMETRY_PUBLIC_API_OPTIONS, useValue: options },
        TelemetryPublicStore,
        TelemetryPublicApiService,
      ],
      exports: [TelemetryPublicApiService],
    };
  }
}

Inject(TELEMETRY_PUBLIC_API_OPTIONS)(TelemetryPublicApiService, undefined, 0);
Inject(TelemetryPublicStore)(TelemetryPublicApiService, undefined, 1);
Inject(DataSource)(TelemetryPublicStore, undefined, 0);
Inject(TelemetryPublicApiService)(TelemetryPublicApiController, undefined, 0);

for (const target of [TelemetryScopeQueryDto, TelemetryScopeBodyDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}

const routeDescriptors = {
  status: Object.getOwnPropertyDescriptor(TelemetryPublicApiController.prototype, "status"),
  optIn: Object.getOwnPropertyDescriptor(TelemetryPublicApiController.prototype, "optIn"),
  optOut: Object.getOwnPropertyDescriptor(TelemetryPublicApiController.prototype, "optOut"),
  purge: Object.getOwnPropertyDescriptor(TelemetryPublicApiController.prototype, "purge"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("TelemetryPublicApiController route descriptors are missing");
}

const statusDescriptor = routeDescriptors.status!;
const optInDescriptor = routeDescriptors.optIn!;
const optOutDescriptor = routeDescriptors.optOut!;
const purgeDescriptor = routeDescriptors.purge!;

Controller("api/v1/telemetry")(TelemetryPublicApiController);
ApiTags("telemetry")(TelemetryPublicApiController);

Get("status")(TelemetryPublicApiController.prototype, "status", statusDescriptor);
Query()(TelemetryPublicApiController.prototype, "status", 0);
ApiQuery({ type: TelemetryScopeQueryDto })(TelemetryPublicApiController.prototype, "status", statusDescriptor);
ApiOperation({ summary: "Get telemetry status" })(TelemetryPublicApiController.prototype, "status", statusDescriptor);
ApiOkResponse({ description: "Telemetry status" })(TelemetryPublicApiController.prototype, "status", statusDescriptor);

Post("opt-in")(TelemetryPublicApiController.prototype, "optIn", optInDescriptor);
Body()(TelemetryPublicApiController.prototype, "optIn", 0);
ApiBody({ type: TelemetryScopeBodyDto })(TelemetryPublicApiController.prototype, "optIn", optInDescriptor);
ApiOperation({ summary: "Opt in to telemetry" })(TelemetryPublicApiController.prototype, "optIn", optInDescriptor);
ApiOkResponse({ description: "Telemetry enabled" })(TelemetryPublicApiController.prototype, "optIn", optInDescriptor);

Post("opt-out")(TelemetryPublicApiController.prototype, "optOut", optOutDescriptor);
Body()(TelemetryPublicApiController.prototype, "optOut", 0);
ApiBody({ type: TelemetryScopeBodyDto })(TelemetryPublicApiController.prototype, "optOut", optOutDescriptor);
ApiOperation({ summary: "Opt out of telemetry" })(TelemetryPublicApiController.prototype, "optOut", optOutDescriptor);
ApiOkResponse({ description: "Telemetry disabled" })(TelemetryPublicApiController.prototype, "optOut", optOutDescriptor);

Delete("events")(TelemetryPublicApiController.prototype, "purge", purgeDescriptor);
Query()(TelemetryPublicApiController.prototype, "purge", 0);
ApiQuery({ type: TelemetryScopeQueryDto })(TelemetryPublicApiController.prototype, "purge", purgeDescriptor);
ApiOperation({ summary: "Purge telemetry events" })(TelemetryPublicApiController.prototype, "purge", purgeDescriptor);
ApiOkResponse({ description: "Telemetry events purged" })(TelemetryPublicApiController.prototype, "purge", purgeDescriptor);

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
    ...FULCRUM_TELEMETRY_ENTITIES,
  ])],
  controllers: [TelemetryPublicApiController],
  providers: [
    { provide: TELEMETRY_PUBLIC_API_OPTIONS, useValue: null },
    TelemetryPublicStore,
    TelemetryPublicApiService,
  ],
  exports: [TelemetryPublicApiService],
})(TelemetryPublicApiModule);
