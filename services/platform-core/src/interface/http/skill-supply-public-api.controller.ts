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
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import {
  SkillLockStore,
  SkillSupplyNotFoundError,
  type SkillSupplyConflictRow,
  type SkillSupplyRow,
  type SkillSupplySyncResult,
} from "@platform-core/infrastructure/skill-supply/skill-lock-store.ts";

import { SkillSupplyListQueryDto, SkillSupplyInstallDto, SkillSupplyUpgradeDto, SkillSupplySyncDto, SkillSupplyResolveConflictDto, SkillSupplyOverrideConflictDto, SkillSupplyOverrideLockDto } from "./dto/skill-supply.dto.ts";
export { SkillSupplyListQueryDto, SkillSupplyInstallDto, SkillSupplyUpgradeDto, SkillSupplySyncDto, SkillSupplyResolveConflictDto, SkillSupplyOverrideConflictDto, SkillSupplyOverrideLockDto };

export interface SkillSupplySyncResponse extends SkillSupplySyncResult {
  ok: true;
  trace_id: string;
}

export class SkillSupplyPublicApiService {
  constructor(private readonly store: SkillLockStore) {}

  async list(_query: SkillSupplyListQueryDto = {}): Promise<SkillSupplyRow[]> {
    return await this.store.list();
  }

  async registryList(_query: SkillSupplyListQueryDto = {}): Promise<SkillSupplyRow[]> {
    return await this.store.registryList();
  }

  async install(input: SkillSupplyInstallDto): Promise<SkillSupplyRow> {
    return await this.mapMissing(() => this.store.install(input));
  }

  async upgrade(input: SkillSupplyUpgradeDto): Promise<SkillSupplyRow[]> {
    return await this.mapMissing(() => this.store.upgrade(input));
  }

  async uninstall(slug: string): Promise<{ ok: true; slug: string }> {
    return await this.mapMissing(() => this.store.uninstall({ slug }));
  }

  async sync(input: SkillSupplySyncDto = {}): Promise<SkillSupplySyncResponse> {
    const result = await this.store.sync({ fetchUpstream: input.fetchUpstream ?? false });
    return {
      ok: true,
      trace_id: createSkillSupplyTraceId("sync"),
      ...result,
    };
  }

  async resolveConflict(input: SkillSupplyResolveConflictDto): Promise<SkillSupplyRow> {
    return await this.mapMissing(() => this.store.resolveConflict(input));
  }

  async listConflicts(): Promise<SkillSupplyConflictRow[]> {
    return await this.store.listConflicts();
  }

  async overrideConflict(input: SkillSupplyOverrideConflictDto): Promise<{ ok: true }> {
    return await this.mapMissing(() => this.store.overrideConflict(input));
  }

  async overrideLock(input: SkillSupplyOverrideLockDto): Promise<{ ok: true }> {
    return await this.store.overrideLock(input);
  }

  private async mapMissing<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SkillSupplyNotFoundError) {
        throw new NotFoundException({ error: error.message });
      }
      throw error;
    }
  }
}

export class SkillSupplyPublicApiController {
  constructor(private readonly service: SkillSupplyPublicApiService) {}

  async list(query: SkillSupplyListQueryDto = {}): Promise<SkillSupplyRow[]> {
    return await this.service.list(query);
  }

  async registryList(query: SkillSupplyListQueryDto = {}): Promise<SkillSupplyRow[]> {
    return await this.service.registryList(query);
  }

  async install(body: SkillSupplyInstallDto): Promise<SkillSupplyRow> {
    return await this.service.install(body);
  }

  async upgrade(body: SkillSupplyUpgradeDto): Promise<SkillSupplyRow[]> {
    return await this.service.upgrade(body);
  }

  async uninstall(slug: string): Promise<{ ok: true; slug: string }> {
    return await this.service.uninstall(slug);
  }

  async sync(body: SkillSupplySyncDto = {}): Promise<SkillSupplySyncResponse> {
    return await this.service.sync(body);
  }

  async resolveConflict(body: SkillSupplyResolveConflictDto): Promise<SkillSupplyRow> {
    return await this.service.resolveConflict(body);
  }

  async listConflicts(): Promise<SkillSupplyConflictRow[]> {
    return await this.service.listConflicts();
  }

  async overrideConflict(body: SkillSupplyOverrideConflictDto): Promise<{ ok: true }> {
    return await this.service.overrideConflict(body);
  }

  async overrideLock(body: SkillSupplyOverrideLockDto): Promise<{ ok: true }> {
    return await this.service.overrideLock(body);
  }
}

export class SkillSupplyPublicApiModule {}

Inject(SkillLockStore)(SkillSupplyPublicApiService, undefined, 0);
Inject(SkillSupplyPublicApiService)(SkillSupplyPublicApiController, undefined, 0);

IsOptional()(SkillSupplyListQueryDto.prototype, "orgId");
IsString()(SkillSupplyListQueryDto.prototype, "orgId");

IsString()(SkillSupplyInstallDto.prototype, "path");
MinLength(1)(SkillSupplyInstallDto.prototype, "path");
IsOptional()(SkillSupplyInstallDto.prototype, "forceConflict");
IsBoolean()(SkillSupplyInstallDto.prototype, "forceConflict");
IsOptional()(SkillSupplyInstallDto.prototype, "conflictResolution");
IsIn(["alt-version", "skip", "upgrade-installed"])(SkillSupplyInstallDto.prototype, "conflictResolution");

IsString()(SkillSupplyUpgradeDto.prototype, "slug");
MinLength(1)(SkillSupplyUpgradeDto.prototype, "slug");

IsOptional()(SkillSupplySyncDto.prototype, "fetchUpstream");
IsBoolean()(SkillSupplySyncDto.prototype, "fetchUpstream");

IsString()(SkillSupplyResolveConflictDto.prototype, "slug");
MinLength(1)(SkillSupplyResolveConflictDto.prototype, "slug");
IsIn(["local", "upstream", "editor", "force", "alt-version", "skip", "upgrade-installed"])(SkillSupplyResolveConflictDto.prototype, "resolution");
IsOptional()(SkillSupplyResolveConflictDto.prototype, "altVersion");
IsString()(SkillSupplyResolveConflictDto.prototype, "altVersion");

IsString()(SkillSupplyOverrideConflictDto.prototype, "conflictId");
MinLength(1)(SkillSupplyOverrideConflictDto.prototype, "conflictId");
IsIn(["local", "upstream"])(SkillSupplyOverrideConflictDto.prototype, "resolution");
IsOptional()(SkillSupplyOverrideConflictDto.prototype, "auditNote");
IsString()(SkillSupplyOverrideConflictDto.prototype, "auditNote");

IsString()(SkillSupplyOverrideLockDto.prototype, "slug");
MinLength(1)(SkillSupplyOverrideLockDto.prototype, "slug");
IsString()(SkillSupplyOverrideLockDto.prototype, "expectedSha256");
MinLength(1)(SkillSupplyOverrideLockDto.prototype, "expectedSha256");
IsString()(SkillSupplyOverrideLockDto.prototype, "actualSha256");
MinLength(1)(SkillSupplyOverrideLockDto.prototype, "actualSha256");
IsOptional()(SkillSupplyOverrideLockDto.prototype, "auditNote");
IsString()(SkillSupplyOverrideLockDto.prototype, "auditNote");

const routeDescriptors = {
  list: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "list"),
  registryList: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "registryList"),
  install: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "install"),
  upgrade: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "upgrade"),
  uninstall: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "uninstall"),
  sync: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "sync"),
  resolveConflict: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "resolveConflict"),
  listConflicts: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "listConflicts"),
  overrideConflict: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "overrideConflict"),
  overrideLock: Object.getOwnPropertyDescriptor(SkillSupplyPublicApiController.prototype, "overrideLock"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("SkillSupplyPublicApiController route descriptors are missing");
}

Controller("api/v1/skills")(SkillSupplyPublicApiController);
ApiTags("skills")(SkillSupplyPublicApiController);

applyGetRoute("list", "", SkillSupplyListQueryDto, "List installed skills");
applyGetRoute("registryList", "registry", SkillSupplyListQueryDto, "List registered skills");
applyGetRoute("listConflicts", "conflicts", null, "List skill lock conflicts");
applyPostRoute("install", "", SkillSupplyInstallDto, "Install skill");
applyPostRoute("upgrade", "upgrade", SkillSupplyUpgradeDto, "Upgrade skills");
applyPostRoute("sync", "sync", SkillSupplySyncDto, "Sync skills");
applySyncRecoveryMetadata();
applyPostRoute("resolveConflict", "conflicts/resolve", SkillSupplyResolveConflictDto, "Resolve skill conflict");
applyPostRoute("overrideConflict", "conflicts/override", SkillSupplyOverrideConflictDto, "Override skill conflict");
applyPatchRoute("overrideLock", "lock", SkillSupplyOverrideLockDto, "Override skill lock");

const uninstallDescriptor = routeDescriptors.uninstall!;
Delete(":slug")(SkillSupplyPublicApiController.prototype, "uninstall", uninstallDescriptor);
Param("slug")(SkillSupplyPublicApiController.prototype, "uninstall", 0);
ApiParam({ name: "slug" })(SkillSupplyPublicApiController.prototype, "uninstall", uninstallDescriptor);
ApiOperation({ summary: "Uninstall skill" })(SkillSupplyPublicApiController.prototype, "uninstall", uninstallDescriptor);
ApiOkResponse({ description: "Uninstall skill" })(SkillSupplyPublicApiController.prototype, "uninstall", uninstallDescriptor);

Module({
  controllers: [SkillSupplyPublicApiController],
  providers: [SkillLockStore, SkillSupplyPublicApiService],
  exports: [SkillSupplyPublicApiService],
})(SkillSupplyPublicApiModule);

function applyGetRoute(
  method: "list" | "registryList" | "listConflicts",
  path: string,
  queryType: (new () => unknown) | null,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Get(path)(SkillSupplyPublicApiController.prototype, method, descriptor);
  if (queryType) {
    Query()(SkillSupplyPublicApiController.prototype, method, 0);
    ApiQuery({ type: queryType })(SkillSupplyPublicApiController.prototype, method, descriptor);
  }
  ApiOperation({ summary })(SkillSupplyPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(SkillSupplyPublicApiController.prototype, method, descriptor);
}

function applyPostRoute(
  method: "install" | "upgrade" | "sync" | "resolveConflict" | "overrideConflict",
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(SkillSupplyPublicApiController.prototype, method, descriptor);
  Body()(SkillSupplyPublicApiController.prototype, method, 0);
  ApiBody({ type: bodyType })(SkillSupplyPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(SkillSupplyPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(SkillSupplyPublicApiController.prototype, method, descriptor);
}

function applyPatchRoute(
  method: "overrideLock",
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Patch(path)(SkillSupplyPublicApiController.prototype, method, descriptor);
  Body()(SkillSupplyPublicApiController.prototype, method, 0);
  ApiBody({ type: bodyType })(SkillSupplyPublicApiController.prototype, method, descriptor);
  ApiOperation({ summary })(SkillSupplyPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(SkillSupplyPublicApiController.prototype, method, descriptor);
}

function applySyncRecoveryMetadata(): void {
  const descriptor = routeDescriptors.sync!;
  ApiOkResponse({
    description: "Skill sync result with trace_id",
    schema: {
      type: "object",
      required: ["ok", "trace_id"],
      properties: {
        ok: { type: "boolean" },
        trace_id: { type: "string" },
        merged: { type: "array", items: { type: "string" } },
        conflicts: { type: "array", items: { type: "string" } },
        errors: { type: "array", items: { type: "string" } },
      },
    },
  })(SkillSupplyPublicApiController.prototype, "sync", descriptor);
  applySwaggerResponseMetadata(descriptor.value, "400", "Invalid request - Check request schema");
  applySwaggerResponseMetadata(descriptor.value, "401", "Unauthorized - Reauthenticate");
  applySwaggerResponseMetadata(descriptor.value, "403", "Forbidden - Check permissions");
  applySwaggerResponseMetadata(descriptor.value, "404", "Not found - Verify resource exists");
}

function applySwaggerResponseMetadata(method: (...args: unknown[]) => unknown, status: string, description: string): void {
  const metadataKey = "swagger/apiResponse";
  const responses = Reflect.getMetadata(metadataKey, method) ?? {};
  Reflect.defineMetadata(metadataKey, { ...responses, [status]: { description } }, method);
}

function createSkillSupplyTraceId(action: string): string {
  return `trace-skills-${action}-${crypto.randomUUID()}`;
}
