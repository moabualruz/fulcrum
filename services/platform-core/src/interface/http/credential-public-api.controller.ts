import "reflect-metadata";

import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, InternalServerErrorException, Module, NotFoundException, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { FULCRUM_IDENTITY_ACCESS_ENTITIES } from "@identity-access/infrastructure/database/organization.entities.ts";
import { type KeyringConfig } from "@platform-core/application/secrets/keyring.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import {
  FULCRUM_CREDENTIAL_ENTITIES,
} from "@platform-core/infrastructure/database/credential.entities.ts";
import {
  CredentialPermissionError,
  CredentialStore,
  type CredentialPublicRow,
  credentialAuditReference,
  type CredentialAuditReference,
} from "@platform-core/infrastructure/database/credential-store.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import {
  addSettingsSecret,
  deleteSettingsSecret,
  rotateSettingsSecret,
  toggleSettingsSecretArchive,
} from "@platform-core/application/settings/commands.ts";
import { listSettingsSecrets } from "@platform-core/application/settings/queries.ts";

import { CredentialListQueryDto, CredentialMutationResponseDto, CredentialNameParamsDto, CredentialReadQueryDto, CredentialSetDto, CredentialRotateDto, CredentialTargetDto } from "./dto/credential.dto.ts";
export { CredentialListQueryDto, CredentialMutationResponseDto, CredentialNameParamsDto, CredentialReadQueryDto, CredentialSetDto, CredentialRotateDto, CredentialTargetDto };

export const CREDENTIAL_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.credentialPublicApi.options");

export interface CredentialPublicApiOptions {
  featuresEnv?: string;
  keyring?: KeyringConfig;
}

export class CredentialPublicApiService {
  constructor(
    private readonly options: CredentialPublicApiOptions | null = null,
    private readonly store: CredentialStore | null = null,
    private readonly dataSource: DataSource | null = null,
  ) {}

  async listCredentials(input: CredentialListQueryDto): Promise<CredentialPublicRow[]> {
    return await this.mapStoreErrors(() => this.requireStore().list(input));
  }

  async getCredential(params: CredentialNameParamsDto, input: CredentialReadQueryDto): Promise<CredentialPublicRow> {
    return await this.mapStoreErrors(() => this.requireResult(this.requireStore().getPublic({
      ...input,
      name: params.name,
    })));
  }

  async getCredentialReference(params: CredentialNameParamsDto, input: CredentialReadQueryDto): Promise<CredentialAuditReference> {
    return credentialAuditReference(await this.getCredential(params, input));
  }

  async setCredential(input: CredentialSetDto): Promise<{ id: string; name: string }> {
    return await this.mapStoreErrors(() => this.requireStore().set({ ...input, keyring: this.keyring() }));
  }

  async rotateCredential(params: CredentialNameParamsDto, input: CredentialRotateDto): Promise<CredentialMutationResponseDto> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().rotate({
      ...input,
      name: params.name,
      keyring: this.keyring(),
    })));
    return mutationResponse(params.name, "rotate");
  }

  async archiveCredential(params: CredentialNameParamsDto, input: CredentialTargetDto): Promise<CredentialMutationResponseDto> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().archive({ ...input, name: params.name })));
    return mutationResponse(params.name, "archive");
  }

  async removeCredential(params: CredentialNameParamsDto, input: CredentialTargetDto): Promise<{ ok: true }> {
    await this.mapStoreErrors(() => this.requireBoolean(this.requireStore().remove({ ...input, name: params.name })));
    return { ok: true };
  }

  async listSettingsSecrets(input: CredentialSettingsScopeDto) {
    this.requireStore();
    return await this.mapAppErrors(() => listSettingsSecrets(this.requireDataSource().manager, settingsContext(input)));
  }

  async addSettingsSecret(input: CredentialSettingsSetDto): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      addSettingsSecret(this.requireDataSource().manager, settingsContext(input), {
        name: input.name,
        value: input.value,
        provider: input.provider ?? "",
      })
    );
  }

  async rotateSettingsSecret(params: CredentialSettingsIdParamsDto, input: CredentialSettingsRotateDto): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      rotateSettingsSecret(this.requireDataSource().manager, settingsContext(input), { id: params.id, value: input.value })
    );
  }

  async toggleSettingsSecretArchive(params: CredentialSettingsIdParamsDto, input: CredentialSettingsScopeDto): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      toggleSettingsSecretArchive(this.requireDataSource().manager, settingsContext(input), { id: params.id })
    );
  }

  async deleteSettingsSecret(params: CredentialSettingsIdParamsDto, input: CredentialSettingsScopeDto): Promise<{ success: true }> {
    this.requireStore();
    return await this.mapAppErrors(() =>
      deleteSettingsSecret(this.requireDataSource().manager, settingsContext(input), { id: params.id })
    );
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Credential target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Credential target not found." });
  }

  private async mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CredentialPermissionError) throw new ForbiddenException(error.message);
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

  private keyring(): KeyringConfig {
    return this.options?.keyring ?? {};
  }

  private requireStore(): CredentialStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Credential public API TypeORM store is not configured.");
    }
    return this.store;
  }

  private requireDataSource(): DataSource {
    if (!this.dataSource) {
      throw new InternalServerErrorException("Credential settings public API data source is not configured.");
    }
    return this.dataSource;
  }
}

export class CredentialSettingsScopeDto {
  orgId!: string;
  userId?: string | null;
}

export class CredentialSettingsIdParamsDto {
  id!: string;
}

export class CredentialSettingsSetDto extends CredentialSettingsScopeDto {
  name!: string;
  value!: string;
  provider?: string;
}

export class CredentialSettingsRotateDto extends CredentialSettingsScopeDto {
  value!: string;
}

export class CredentialPublicApiController {
  constructor(private readonly credentials: CredentialPublicApiService) {}

  // Settings-secrets routes MUST be declared before `:name` routes so Nest
  // registers GET/POST/DELETE /settings-secrets ahead of GET/POST/DELETE /:name.
  // Otherwise Express matches `settings-secrets` against the `:name` param route.

  async listSettingsSecrets(query: CredentialSettingsScopeDto) {
    return await this.credentials.listSettingsSecrets(query);
  }

  async addSettingsSecret(body: CredentialSettingsSetDto): Promise<{ success: true }> {
    return await this.credentials.addSettingsSecret(body);
  }

  async rotateSettingsSecret(params: CredentialSettingsIdParamsDto, body: CredentialSettingsRotateDto): Promise<{ success: true }> {
    return await this.credentials.rotateSettingsSecret(params, body);
  }

  async toggleSettingsSecretArchive(params: CredentialSettingsIdParamsDto, body: CredentialSettingsScopeDto): Promise<{ success: true }> {
    return await this.credentials.toggleSettingsSecretArchive(params, body);
  }

  async deleteSettingsSecret(params: CredentialSettingsIdParamsDto, query: CredentialSettingsScopeDto): Promise<{ success: true }> {
    return await this.credentials.deleteSettingsSecret(params, query);
  }

  async listCredentials(query: CredentialListQueryDto): Promise<CredentialPublicRow[]> {
    return await this.credentials.listCredentials(query);
  }

  async setCredential(body: CredentialSetDto): Promise<{ id: string; name: string }> {
    return await this.credentials.setCredential(body);
  }

  async getCredential(params: CredentialNameParamsDto, query: CredentialReadQueryDto): Promise<CredentialPublicRow> {
    return await this.credentials.getCredential(params, query);
  }

  async rotateCredential(params: CredentialNameParamsDto, body: CredentialRotateDto): Promise<CredentialMutationResponseDto> {
    return await this.credentials.rotateCredential(params, body);
  }

  async archiveCredential(params: CredentialNameParamsDto, body: CredentialTargetDto): Promise<CredentialMutationResponseDto> {
    return await this.credentials.archiveCredential(params, body);
  }

  async removeCredential(params: CredentialNameParamsDto, query: CredentialTargetDto): Promise<{ ok: true }> {
    return await this.credentials.removeCredential(params, query);
  }
}

export class CredentialPublicApiModule {
  static register(options: CredentialPublicApiOptions): NestDynamicModule {
    return {
      module: CredentialPublicApiModule,
      imports: [TypeOrmModule.forFeature([
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
        ...FULCRUM_CREDENTIAL_ENTITIES,
      ])],
      controllers: [CredentialPublicApiController],
      providers: [
        { provide: CREDENTIAL_PUBLIC_API_OPTIONS, useValue: options },
        CredentialStore,
        CredentialPublicApiService,
      ],
      exports: [CredentialPublicApiService],
    };
  }
}

Inject(CREDENTIAL_PUBLIC_API_OPTIONS)(CredentialPublicApiService, undefined, 0);
Inject(CredentialStore)(CredentialPublicApiService, undefined, 1);
Inject(DataSource)(CredentialPublicApiService, undefined, 2);
Inject(DataSource)(CredentialStore, undefined, 0);
Inject(CredentialPublicApiService)(CredentialPublicApiController, undefined, 0);

for (const target of [CredentialListQueryDto, CredentialReadQueryDto, CredentialSetDto, CredentialRotateDto, CredentialTargetDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsString()(target.prototype, "userId");
  MinLength(1)(target.prototype, "userId");
  IsOptional()(target.prototype, "targetUserId");
  IsString()(target.prototype, "targetUserId");
}
IsOptional()(CredentialListQueryDto.prototype, "includeArchived");
IsBoolean()(CredentialListQueryDto.prototype, "includeArchived");
IsString()(CredentialNameParamsDto.prototype, "name");
MinLength(1)(CredentialNameParamsDto.prototype, "name");
IsString()(CredentialSetDto.prototype, "name");
MinLength(1)(CredentialSetDto.prototype, "name");
IsString()(CredentialSetDto.prototype, "value");
MinLength(1)(CredentialSetDto.prototype, "value");
IsString()(CredentialRotateDto.prototype, "newValue");
MinLength(1)(CredentialRotateDto.prototype, "newValue");
IsBoolean()(CredentialMutationResponseDto.prototype, "ok");
IsString()(CredentialMutationResponseDto.prototype, "trace_id");
for (const target of [CredentialSettingsScopeDto, CredentialSettingsSetDto, CredentialSettingsRotateDto] as const) {
  IsString()(target.prototype, "orgId");
  MinLength(1)(target.prototype, "orgId");
  IsOptional()(target.prototype, "userId");
  IsString()(target.prototype, "userId");
}
IsString()(CredentialSettingsIdParamsDto.prototype, "id");
MinLength(1)(CredentialSettingsIdParamsDto.prototype, "id");
IsString()(CredentialSettingsSetDto.prototype, "name");
MinLength(1)(CredentialSettingsSetDto.prototype, "name");
IsString()(CredentialSettingsSetDto.prototype, "value");
MinLength(1)(CredentialSettingsSetDto.prototype, "value");
IsOptional()(CredentialSettingsSetDto.prototype, "provider");
IsString()(CredentialSettingsSetDto.prototype, "provider");
IsString()(CredentialSettingsRotateDto.prototype, "value");
MinLength(1)(CredentialSettingsRotateDto.prototype, "value");

const routeDescriptors = {
  listCredentials: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "listCredentials"),
  setCredential: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "setCredential"),
  getCredential: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "getCredential"),
  rotateCredential: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "rotateCredential"),
  archiveCredential: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "archiveCredential"),
  removeCredential: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "removeCredential"),
  listSettingsSecrets: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "listSettingsSecrets"),
  addSettingsSecret: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "addSettingsSecret"),
  rotateSettingsSecret: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "rotateSettingsSecret"),
  toggleSettingsSecretArchive: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "toggleSettingsSecretArchive"),
  deleteSettingsSecret: Object.getOwnPropertyDescriptor(CredentialPublicApiController.prototype, "deleteSettingsSecret"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("CredentialPublicApiController route descriptors are missing");
}

Controller("api/v1/credentials")(CredentialPublicApiController);
ApiTags("credentials")(CredentialPublicApiController);
ApiForbiddenResponse({ description: "Caller is not allowed to access credential metadata" })(CredentialPublicApiController);

applyGetRoute("listSettingsSecrets", "settings-secrets", CredentialSettingsScopeDto, "List settings secrets");
applyPostRoute("addSettingsSecret", "settings-secrets", CredentialSettingsSetDto, "Add settings secret");
applyPostIdRoute("rotateSettingsSecret", "settings-secrets/:id/rotate", CredentialSettingsRotateDto, "Rotate settings secret");
applyPostIdRoute("toggleSettingsSecretArchive", "settings-secrets/:id/archive", CredentialSettingsScopeDto, "Archive or unarchive settings secret");
applyDeleteIdRoute("deleteSettingsSecret", "settings-secrets/:id", CredentialSettingsScopeDto, "Delete settings secret");
applyGetRoute("listCredentials", "", CredentialListQueryDto, "List credentials");
applyPostRoute("setCredential", "", CredentialSetDto, "Set credential");
applyGetRoute("getCredential", ":name", CredentialReadQueryDto, "Get credential", true);
applyPostRoute("rotateCredential", ":name/rotate", CredentialRotateDto, "Rotate credential", true, CredentialMutationResponseDto);
applyPostRoute("archiveCredential", ":name/archive", CredentialTargetDto, "Archive credential", true, CredentialMutationResponseDto);
applyDeleteRoute("removeCredential", ":name", CredentialTargetDto, "Remove credential");

Module({
  imports: [TypeOrmModule.forFeature([
    ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
    ...FULCRUM_IDENTITY_ACCESS_ENTITIES,
    ...FULCRUM_CREDENTIAL_ENTITIES,
  ])],
  controllers: [CredentialPublicApiController],
  providers: [
    { provide: CREDENTIAL_PUBLIC_API_OPTIONS, useValue: null },
    CredentialStore,
    CredentialPublicApiService,
  ],
  exports: [CredentialPublicApiService],
})(CredentialPublicApiModule);

function applyGetRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
  hasName = false,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(CredentialPublicApiController.prototype, method, descriptor);
  if (hasName) {
    Param()(CredentialPublicApiController.prototype, method, 0);
    Query()(CredentialPublicApiController.prototype, method, 1);
    ApiParam({ name: "name" })(CredentialPublicApiController.prototype, method, descriptor);
  } else {
    Query()(CredentialPublicApiController.prototype, method, 0);
  }
  ApiQuery({ type: queryType })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CredentialPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
  hasName = false,
  responseType?: new () => unknown,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(CredentialPublicApiController.prototype, method, descriptor);
  if (hasName) {
    Param()(CredentialPublicApiController.prototype, method, 0);
    Body()(CredentialPublicApiController.prototype, method, 1);
    ApiParam({ name: "name" })(CredentialPublicApiController.prototype, method, descriptor);
  } else {
    Body()(CredentialPublicApiController.prototype, method, 0);
  }
  ApiOperation({ summary })(CredentialPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary, ...(responseType ? { type: responseType } : {}) })(CredentialPublicApiController.prototype, method, descriptor);
}

function applyDeleteRoute(method: keyof typeof routeDescriptors, path: string, queryType: new () => unknown, summary: string): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(CredentialPublicApiController.prototype, method, descriptor);
  Param()(CredentialPublicApiController.prototype, method, 0);
  Query()(CredentialPublicApiController.prototype, method, 1);
  ApiParam({ name: "name" })(CredentialPublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CredentialPublicApiController.prototype, method, descriptor);
}

function applyPostIdRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(CredentialPublicApiController.prototype, method, descriptor);
  Param()(CredentialPublicApiController.prototype, method, 0);
  Body()(CredentialPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CredentialPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CredentialPublicApiController.prototype, method, descriptor);
}

function applyDeleteIdRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  queryType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Delete(path)(CredentialPublicApiController.prototype, method, descriptor);
  Param()(CredentialPublicApiController.prototype, method, 0);
  Query()(CredentialPublicApiController.prototype, method, 1);
  ApiParam({ name: "id" })(CredentialPublicApiController.prototype, method, descriptor);
  ApiQuery({ type: queryType })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(CredentialPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(CredentialPublicApiController.prototype, method, descriptor);
}

function mutationResponse(name: string, action: "archive" | "rotate"): CredentialMutationResponseDto {
  return {
    ok: true,
    trace_id: `trace-credential-${action}-${encodeURIComponent(name)}`,
  };
}

function settingsContext(input: CredentialSettingsScopeDto) {
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
