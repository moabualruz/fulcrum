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
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { FULCRUM_IDENTITY_ACCESS_ENTITIES } from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  DataPortabilityConflictError,
  DataPortabilityPermissionError,
  DataPortabilityStore,
  DataPortabilityValidationError,
} from "@integration-hub/infrastructure/database/data-portability-store.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";

import { DataPortabilityScopeDto, BackupRestoreDto, DataExportCreateDto, DataImportPreflightQueryDto, DataImportRunDto } from "./dto/data-portability.dto.ts";
export { DataPortabilityScopeDto, BackupRestoreDto, DataExportCreateDto, DataImportPreflightQueryDto, DataImportRunDto };

export const DATA_PORTABILITY_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.dataPortabilityPublicApi.options");

export interface DataPortabilityPublicApiOptions {
  featuresEnv?: string;
}

export class DataPortabilityPublicApiService {
  constructor(
    private readonly options: DataPortabilityPublicApiOptions | null = null,
    private readonly store: DataPortabilityStore | null = null,
  ) {}

  async createBackup(input: DataPortabilityScopeDto) {
    return await this.mapStoreErrors(() => this.requireStore().createBackup(input));
  }

  async restoreBackup(input: BackupRestoreDto) {
    return await this.mapStoreErrors(() => this.requireStore().restoreBackup(input));
  }

  async createExport(input: DataExportCreateDto) {
    return await this.mapStoreErrors(() => this.requireStore().createExport(input));
  }

  async preflightImport(input: DataImportPreflightQueryDto) {
    return await this.mapStoreErrors(() => this.requireStore().preflightImport(input));
  }

  async runImport(input: DataImportRunDto) {
    return await this.mapStoreErrors(() => this.requireStore().runImport(input));
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DataPortabilityPermissionError) throw new ForbiddenException(error.message);
      if (error instanceof DataPortabilityValidationError) throw new BadRequestException(error.message);
      if (error instanceof DataPortabilityConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }

  private requireStore(): DataPortabilityStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Data portability public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class DataPortabilityPublicApiController {
  constructor(private readonly portability: DataPortabilityPublicApiService) {}

  async createBackup(body: DataPortabilityScopeDto) {
    return await this.portability.createBackup(body);
  }

  async restoreBackup(body: BackupRestoreDto) {
    return await this.portability.restoreBackup(body);
  }

  async createExport(body: DataExportCreateDto) {
    return await this.portability.createExport(body);
  }

  async preflightImport(query: DataImportPreflightQueryDto) {
    return await this.portability.preflightImport(query);
  }

  async runImport(body: DataImportRunDto) {
    return await this.portability.runImport(body);
  }
}

export class DataPortabilityPublicApiModule {
  static register(options: DataPortabilityPublicApiOptions): NestDynamicModule {
    return {
      module: DataPortabilityPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_IDENTITY_ACCESS_ENTITIES])],
      controllers: [DataPortabilityPublicApiController],
      providers: [
        { provide: DATA_PORTABILITY_PUBLIC_API_OPTIONS, useValue: options },
        DataPortabilityStore,
        DataPortabilityPublicApiService,
      ],
      exports: [DataPortabilityPublicApiService],
    };
  }
}

Inject(DATA_PORTABILITY_PUBLIC_API_OPTIONS)(DataPortabilityPublicApiService, undefined, 0);
Inject(DataPortabilityStore)(DataPortabilityPublicApiService, undefined, 1);
Inject(DataSource)(DataPortabilityStore, undefined, 0);
Inject(DataPortabilityPublicApiService)(DataPortabilityPublicApiController, undefined, 0);

for (const target of [
  DataPortabilityScopeDto,
  BackupRestoreDto,
  DataExportCreateDto,
  DataImportPreflightQueryDto,
  DataImportRunDto,
] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
}
IsString()(BackupRestoreDto.prototype, "dump");
MinLength(1)(BackupRestoreDto.prototype, "dump");
IsOptional()(DataExportCreateDto.prototype, "outputPath");
IsString()(DataExportCreateDto.prototype, "outputPath");
IsOptional()(DataExportCreateDto.prototype, "pretty");
IsBoolean()(DataExportCreateDto.prototype, "pretty");
IsString()(DataImportPreflightQueryDto.prototype, "path");
MinLength(1)(DataImportPreflightQueryDto.prototype, "path");
IsString()(DataImportRunDto.prototype, "importId");
MinLength(1)(DataImportRunDto.prototype, "importId");
IsOptional()(DataImportRunDto.prototype, "dryRun");
IsBoolean()(DataImportRunDto.prototype, "dryRun");
IsOptional()(DataImportRunDto.prototype, "onConflict");
IsIn(["skip", "update", "error"])(DataImportRunDto.prototype, "onConflict");

const routeDescriptors = {
  createBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "createBackup"),
  restoreBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "restoreBackup"),
  createExport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "createExport"),
  preflightImport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "preflightImport"),
  runImport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "runImport"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("DataPortabilityPublicApiController route descriptors are missing");
}

Controller("api/v1/data-portability")(DataPortabilityPublicApiController);
ApiTags("data-portability")(DataPortabilityPublicApiController);
ApiForbiddenResponse({ description: "Caller is not allowed to export or import data" })(DataPortabilityPublicApiController);

applyPostRoute("createBackup", "backup", DataPortabilityScopeDto, "Create data backup");
applyPostRoute("restoreBackup", "backup/restore", BackupRestoreDto, "Restore data backup");
applyPostRoute("createExport", "export", DataExportCreateDto, "Create data export");
applyGetRoute("preflightImport", "import/preflight", DataImportPreflightQueryDto, "Preflight data import");
applyPostRoute("runImport", "import/run", DataImportRunDto, "Run data import");

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_IDENTITY_ACCESS_ENTITIES])],
  controllers: [DataPortabilityPublicApiController],
  providers: [
    { provide: DATA_PORTABILITY_PUBLIC_API_OPTIONS, useValue: null },
    DataPortabilityStore,
    DataPortabilityPublicApiService,
  ],
  exports: [DataPortabilityPublicApiService],
})(DataPortabilityPublicApiModule);

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(DataPortabilityPublicApiController.prototype, method, descriptor);
  Body()(DataPortabilityPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(DataPortabilityPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(DataPortabilityPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(DataPortabilityPublicApiController.prototype, method, descriptor);
}

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(DataPortabilityPublicApiController.prototype, method, descriptor);
  Query()(DataPortabilityPublicApiController.prototype, method, 0);
  ApiQuery({ type: queryType })(DataPortabilityPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(DataPortabilityPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(DataPortabilityPublicApiController.prototype, method, descriptor);
}
