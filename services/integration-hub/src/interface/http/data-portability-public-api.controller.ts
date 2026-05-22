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
import { AppError } from "@platform-core/domain/errors.ts";
import {
  createSettingsBackup,
  importSettingsData,
  preflightSettingsBackup,
  preflightSettingsDataImport,
  restoreSettingsBackup,
} from "@platform-core/application/settings/commands.ts";
import {
  createSettingsDataExport,
  listBackupSummaries,
  summarizeImportManifest,
  SETTINGS_ENTITY_KINDS,
  type SettingsEntityKind,
} from "@platform-core/application/settings/queries.ts";
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
    private readonly dataSource: DataSource | null = null,
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

  async createSettingsExport(input: SettingsDataExportDto) {
    this.requireStore();
    const kinds = Array.isArray(input.kinds)
      ? input.kinds.filter((kind): kind is SettingsEntityKind => (SETTINGS_ENTITY_KINDS as readonly string[]).includes(kind))
      : undefined;
    return await this.mapAppErrors(() =>
      createSettingsDataExport(this.requireDataSource().manager, settingsContext(input), { kinds })
    );
  }

  async preflightSettingsImport(input: SettingsDataImportDto) {
    this.requireStore();
    return preflightSettingsDataImport(input.data);
  }

  async runSettingsImport(input: SettingsDataImportDto) {
    this.requireStore();
    return await this.mapAppErrors(() => importSettingsData(this.requireDataSource().manager, settingsContext(input), input.data));
  }

  async listSettingsBackups(input: DataPortabilityScopeDto) {
    this.requireStore();
    return await this.mapAppErrors(() => listBackupSummaries(this.requireDataSource().manager, settingsContext(input)));
  }

  async createSettingsBackup(input: DataPortabilityScopeDto) {
    this.requireStore();
    return await this.mapAppErrors(() => createSettingsBackup(this.requireDataSource().manager, settingsContext(input)));
  }

  async preflightSettingsBackup(input: SettingsBackupRestoreDto) {
    this.requireStore();
    return preflightSettingsBackup(input.backupJson);
  }

  async restoreSettingsBackup(input: SettingsBackupRestoreDto) {
    this.requireStore();
    const { manifest } = summarizeImportManifest(input.backupJson);
    return await this.mapAppErrors(() =>
      restoreSettingsBackup(this.requireDataSource().manager, settingsContext(input), { manifest })
    );
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

  private async mapAppErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AppError) throw appHttpError(error);
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

  private requireDataSource(): DataSource {
    if (!this.dataSource) {
      throw new InternalServerErrorException("Data portability settings public API data source is not configured.");
    }
    return this.dataSource;
  }
}

export class SettingsDataExportDto extends DataPortabilityScopeDto {
  kinds?: string[];
}

export class SettingsDataImportDto extends DataPortabilityScopeDto {
  data!: unknown;
}

export class SettingsBackupRestoreDto extends DataPortabilityScopeDto {
  backupJson!: unknown;
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

  async createSettingsExport(body: SettingsDataExportDto) {
    return await this.portability.createSettingsExport(body);
  }

  async preflightSettingsImport(body: SettingsDataImportDto) {
    return await this.portability.preflightSettingsImport(body);
  }

  async runSettingsImport(body: SettingsDataImportDto) {
    return await this.portability.runSettingsImport(body);
  }

  async listSettingsBackups(query: DataPortabilityScopeDto) {
    return await this.portability.listSettingsBackups(query);
  }

  async createSettingsBackup(body: DataPortabilityScopeDto) {
    return await this.portability.createSettingsBackup(body);
  }

  async preflightSettingsBackup(body: SettingsBackupRestoreDto) {
    return await this.portability.preflightSettingsBackup(body);
  }

  async restoreSettingsBackup(body: SettingsBackupRestoreDto) {
    return await this.portability.restoreSettingsBackup(body);
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
Inject(DataSource)(DataPortabilityPublicApiService, undefined, 2);
Inject(DataSource)(DataPortabilityStore, undefined, 0);
Inject(DataPortabilityPublicApiService)(DataPortabilityPublicApiController, undefined, 0);

for (const target of [
  DataPortabilityScopeDto,
  BackupRestoreDto,
  DataExportCreateDto,
  DataImportPreflightQueryDto,
  DataImportRunDto,
  SettingsDataExportDto,
  SettingsDataImportDto,
  SettingsBackupRestoreDto,
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
IsOptional()(SettingsDataExportDto.prototype, "kinds");

const routeDescriptors = {
  createBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "createBackup"),
  restoreBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "restoreBackup"),
  createExport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "createExport"),
  preflightImport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "preflightImport"),
  runImport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "runImport"),
  createSettingsExport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "createSettingsExport"),
  preflightSettingsImport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "preflightSettingsImport"),
  runSettingsImport: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "runSettingsImport"),
  listSettingsBackups: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "listSettingsBackups"),
  createSettingsBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "createSettingsBackup"),
  preflightSettingsBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "preflightSettingsBackup"),
  restoreSettingsBackup: Object.getOwnPropertyDescriptor(DataPortabilityPublicApiController.prototype, "restoreSettingsBackup"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("DataPortabilityPublicApiController route descriptors are missing");
}

Controller("api/v1/data-portability")(DataPortabilityPublicApiController);
ApiTags("data-portability")(DataPortabilityPublicApiController);
ApiForbiddenResponse({ description: "Caller is not allowed to export or import data" })(DataPortabilityPublicApiController);

applyPostRoute("createSettingsExport", "settings/export", SettingsDataExportDto, "Create settings data export");
applyPostRoute("preflightSettingsImport", "settings/import/preflight", SettingsDataImportDto, "Preflight settings data import");
applyPostRoute("runSettingsImport", "settings/import/run", SettingsDataImportDto, "Run settings data import");
applyGetRoute("listSettingsBackups", "settings/backups", DataPortabilityScopeDto, "List settings backups");
applyPostRoute("createSettingsBackup", "settings/backups", DataPortabilityScopeDto, "Create settings backup");
applyPostRoute("preflightSettingsBackup", "settings/backups/preflight", SettingsBackupRestoreDto, "Preflight settings backup restore");
applyPostRoute("restoreSettingsBackup", "settings/backups/restore", SettingsBackupRestoreDto, "Restore settings backup");
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

function settingsContext(input: DataPortabilityScopeDto) {
  return { orgId: input.orgId, userId: input.userId ?? null, projectId: null };
}

function appHttpError(error: AppError) {
  if (error.kind === "validation") return new BadRequestException(error.message);
  if (error.kind === "forbidden") return new ForbiddenException(error.message);
  if (error.kind === "not_found") return new NotFoundException(error.message);
  if (error.kind === "conflict") return new ConflictException(error.message);
  return new InternalServerErrorException(error.message);
}
