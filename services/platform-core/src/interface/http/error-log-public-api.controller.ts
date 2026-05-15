import "reflect-metadata";

import { Controller, Delete, ForbiddenException, Get, Inject, InternalServerErrorException, Module, NotFoundException, Param, Query } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBooleanString, IsDateString, IsOptional, IsString, Min, MinLength } from "class-validator";
import { Type } from "class-transformer";
import { DataSource } from "typeorm";

import {
  FULCRUM_IDENTITY_ACCESS_ENTITIES,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  FULCRUM_ERROR_LOG_ENTITIES,
} from "@platform-core/infrastructure/database/error-log.entities.ts";
import {
  ErrorLogPermissionError,
  ErrorLogStore,
  type ErrorLogPublicPage,
  type ErrorLogPublicRow,
} from "@platform-core/infrastructure/database/error-log-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

export const ERROR_LOG_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.errorLogPublicApi.options");

export interface ErrorLogPublicApiOptions {
  featuresEnv?: string;
}

export class ErrorLogListQueryDto {
  orgId!: string;
  userId!: string;
  limit?: number;
  offset?: number;
  since?: string;
  includeTotal?: boolean | string;
}

export class ErrorLogScopeQueryDto {
  orgId!: string;
  userId!: string;
}

export class ErrorLogClearQueryDto extends ErrorLogScopeQueryDto {
  before?: string;
}

export class ErrorLogParamsDto {
  id!: string;
}

export class ErrorLogPublicApiService {
  constructor(
    private readonly options: ErrorLogPublicApiOptions | null = null,
    private readonly store: ErrorLogStore | null = null,
  ) {}

  async list(input: ErrorLogListQueryDto): Promise<ErrorLogPublicRow[] | ErrorLogPublicPage> {
    const query = {
      orgId: input.orgId,
      userId: input.userId,
      limit: input.limit,
      offset: input.offset,
      since: input.since ? new Date(input.since) : undefined,
    };
    if (wantsTotal(input.includeTotal)) {
      return await this.mapStoreErrors(() => this.requireStore().listPage(query));
    }
    return await this.mapStoreErrors(() => this.requireStore().list(query));
  }

  async get(params: ErrorLogParamsDto, input: ErrorLogScopeQueryDto): Promise<ErrorLogPublicRow> {
    return await this.mapStoreErrors(() => this.requireResult(this.requireStore().get({ ...input, id: params.id })));
  }

  async clear(input: ErrorLogClearQueryDto): Promise<{ ok: true; deleted: number }> {
    const deleted = await this.mapStoreErrors(() =>
      this.requireStore().clear({
        orgId: input.orgId,
        userId: input.userId,
        before: input.before ? new Date(input.before) : undefined,
      })
    );
    return { ok: true, deleted };
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Error log target not found." });
    return result;
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ErrorLogPermissionError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  private requireStore(): ErrorLogStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Error log public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class ErrorLogPublicApiController {
  constructor(private readonly errorLogs: ErrorLogPublicApiService) {}

  async list(query: ErrorLogListQueryDto): Promise<ErrorLogPublicRow[] | ErrorLogPublicPage> {
    return await this.errorLogs.list(query);
  }

  async get(params: ErrorLogParamsDto, query: ErrorLogScopeQueryDto): Promise<ErrorLogPublicRow> {
    return await this.errorLogs.get(params, query);
  }

  async clear(query: ErrorLogClearQueryDto): Promise<{ ok: true; deleted: number }> {
    return await this.errorLogs.clear(query);
  }
}

function wantsTotal(value: boolean | string | undefined): boolean {
  return value === true || value === "true" || value === "1";
}

export class ErrorLogPublicApiModule {
  static register(options: ErrorLogPublicApiOptions): NestDynamicModule {
    return {
      module: ErrorLogPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_ERROR_LOG_ENTITIES,
      ])],
      controllers: [ErrorLogPublicApiController],
      providers: [
        { provide: ERROR_LOG_PUBLIC_API_OPTIONS, useValue: options },
        ErrorLogStore,
        ErrorLogPublicApiService,
      ],
      exports: [ErrorLogPublicApiService],
    };
  }
}

Inject(ERROR_LOG_PUBLIC_API_OPTIONS)(ErrorLogPublicApiService, undefined, 0);
Inject(ErrorLogStore)(ErrorLogPublicApiService, undefined, 1);
Inject(DataSource)(ErrorLogStore, undefined, 0);
Inject(ErrorLogPublicApiService)(ErrorLogPublicApiController, undefined, 0);

for (const target of [ErrorLogListQueryDto, ErrorLogScopeQueryDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}
IsOptional()(ErrorLogListQueryDto.prototype, "limit");
Type(() => Number)(ErrorLogListQueryDto.prototype, "limit");
Min(1)(ErrorLogListQueryDto.prototype, "limit");
IsOptional()(ErrorLogListQueryDto.prototype, "offset");
Type(() => Number)(ErrorLogListQueryDto.prototype, "offset");
Min(0)(ErrorLogListQueryDto.prototype, "offset");
IsOptional()(ErrorLogListQueryDto.prototype, "since");
IsDateString()(ErrorLogListQueryDto.prototype, "since");
IsOptional()(ErrorLogListQueryDto.prototype, "includeTotal");
IsBooleanString()(ErrorLogListQueryDto.prototype, "includeTotal");
IsOptional()(ErrorLogClearQueryDto.prototype, "before");
IsDateString()(ErrorLogClearQueryDto.prototype, "before");
IsString()(ErrorLogParamsDto.prototype, "id");
MinLength(1)(ErrorLogParamsDto.prototype, "id");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(ErrorLogPublicApiController.prototype, "list"),
  get: Object.getOwnPropertyDescriptor(ErrorLogPublicApiController.prototype, "get"),
  clear: Object.getOwnPropertyDescriptor(ErrorLogPublicApiController.prototype, "clear"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("ErrorLogPublicApiController route descriptors are missing");
}

const listDescriptor = routeDescriptors.list!;
const getDescriptor = routeDescriptors.get!;
const clearDescriptor = routeDescriptors.clear!;

Controller("api/v1/error-logs")(ErrorLogPublicApiController);
ApiTags("error-logs")(ErrorLogPublicApiController);

Get("")(ErrorLogPublicApiController.prototype, "list", listDescriptor);
Query()(ErrorLogPublicApiController.prototype, "list", 0);
ApiQuery({ type: ErrorLogListQueryDto })(ErrorLogPublicApiController.prototype, "list", listDescriptor);
ApiOperation({ summary: "List error logs" })(ErrorLogPublicApiController.prototype, "list", listDescriptor);
ApiOkResponse({ description: "Error logs" })(ErrorLogPublicApiController.prototype, "list", listDescriptor);

Get(":id")(ErrorLogPublicApiController.prototype, "get", getDescriptor);
Param()(ErrorLogPublicApiController.prototype, "get", 0);
Query()(ErrorLogPublicApiController.prototype, "get", 1);
ApiParam({ name: "id" })(ErrorLogPublicApiController.prototype, "get", getDescriptor);
ApiQuery({ type: ErrorLogScopeQueryDto })(ErrorLogPublicApiController.prototype, "get", getDescriptor);
ApiOperation({ summary: "Get error log" })(ErrorLogPublicApiController.prototype, "get", getDescriptor);
ApiOkResponse({ description: "Error log" })(ErrorLogPublicApiController.prototype, "get", getDescriptor);

Delete("")(ErrorLogPublicApiController.prototype, "clear", clearDescriptor);
Query()(ErrorLogPublicApiController.prototype, "clear", 0);
ApiQuery({ type: ErrorLogScopeQueryDto })(ErrorLogPublicApiController.prototype, "clear", clearDescriptor);
ApiOperation({ summary: "Clear error logs" })(ErrorLogPublicApiController.prototype, "clear", clearDescriptor);
ApiOkResponse({ description: "Error logs cleared" })(ErrorLogPublicApiController.prototype, "clear", clearDescriptor);

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
    ...FULCRUM_ERROR_LOG_ENTITIES,
  ])],
  controllers: [ErrorLogPublicApiController],
  providers: [
    { provide: ERROR_LOG_PUBLIC_API_OPTIONS, useValue: null },
    ErrorLogStore,
    ErrorLogPublicApiService,
  ],
  exports: [ErrorLogPublicApiService],
})(ErrorLogPublicApiModule);
