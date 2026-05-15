import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { INTEGRATION_HUB_REPOSITORY_ENTITIES } from "@integration-hub/infrastructure/database/repository.entities.ts";
import { RepositoryPublicStore } from "@integration-hub/infrastructure/database/repository-public-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";

export const REPOSITORY_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.repositoryPublicApi.options");

export interface RepositoryPublicApplication {
  list(input: {
    orgId: string;
    includeArchived?: boolean;
  }): Promise<unknown>;
  register?(input: {
    orgId: string;
    projectId?: string | null;
    name: string;
    slug?: string;
    kind?: "local" | "remote";
    localPath?: string | null;
    remoteUrl?: string | null;
    defaultBranch?: string | null;
  }): Promise<unknown>;
  get?(input: { orgId: string; repoId: string }): Promise<unknown>;
  sync?(input: { orgId: string }): Promise<unknown>;
  syncRepo(input: { orgId: string; repoId: string }): Promise<unknown>;
  statusRepo(input: { orgId: string; repoId: string }): Promise<unknown>;
  unregister?(input: { orgId: string; repoId: string }): Promise<void>;
  listBranches?(input: { orgId: string; repoId?: string; limit?: number }): Promise<unknown>;
  getBranch?(input: { orgId: string; id: string }): Promise<unknown>;
  listCommits?(input: { orgId: string; repoId?: string; branch?: string; limit?: number }): Promise<unknown>;
  getCommit?(input: { orgId: string; id: string }): Promise<unknown>;
}

export interface RepositoryPublicApiOptions {
  application?: RepositoryPublicApplication;
  featuresEnv?: string;
  orgId?: string;
}

export class RepositoryListQueryDto {
  orgId!: string;
  includeArchived?: boolean | string;
}

export class RepositoryRequestContextDto {
  orgId!: string;
}

export class RepositoryReadModelListQueryDto extends RepositoryRequestContextDto {
  repoId?: string;
  branch?: string;
  limit?: string | number;
}

export class RepositoryIdParamsDto {
  id!: string;
}

export class RepositoryReadModelIdParamsDto {
  id!: string;
}

export class RepositoryCreateBodyDto {
  orgId!: string;
  projectId?: string | null;
  name!: string;
  slug?: string;
  kind?: "local" | "remote";
  localPath?: string | null;
  remoteUrl?: string | null;
  defaultBranch?: string | null;
}

export class RepositoryPublicApiService {
  constructor(
    private readonly options: RepositoryPublicApiOptions | null = null,
    private readonly store: RepositoryPublicStore | null = null,
  ) {}

  async listRepositories(query: RepositoryListQueryDto): Promise<unknown[]> {
    const orgId = this.resolveOrgId(query.orgId);
    const repos = await this.requireApplication().list({
      orgId,
      includeArchived: parseOptionalBoolean(query.includeArchived) ?? false,
    });
    return Array.isArray(repos) ? repos.map(toJsonDates) : [];
  }

  async registerRepository(body: RepositoryCreateBodyDto): Promise<unknown> {
    const application = this.requireMethod("register");
    return toJsonDates(await application({
      orgId: this.resolveOrgId(body.orgId),
      projectId: body.projectId,
      name: body.name,
      slug: body.slug,
      kind: body.kind,
      localPath: body.localPath,
      remoteUrl: body.remoteUrl,
      defaultBranch: body.defaultBranch,
    }));
  }

  async loadRepository(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("get");
    const result = await application({ orgId: this.resolveOrgId(query.orgId), repoId: params.id });
    if (!result) throw new NotFoundException({ error: "repo not found" });
    return toJsonDates(result);
  }

  async syncRepositories(query: RepositoryRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("sync");
    const result = toJsonDates(await application({ orgId: this.resolveOrgId(query.orgId) }));
    return Array.isArray(result) ? { data: result } : result;
  }

  async syncRepository(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    const result = await this.requireApplication().syncRepo({
      orgId: this.resolveOrgId(query.orgId),
      repoId: params.id,
    });
    if (!result) throw new NotFoundException({ error: "repo not found" });
    return toJsonDates(result);
  }

  async getRepositoryStatus(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    const orgId = this.resolveOrgId(query.orgId);
    const result = await this.requireApplication().statusRepo({ orgId, repoId: params.id });
    const status = toJsonDates(result) as { orgId?: string } | null;
    if (!status || status.orgId !== orgId) {
      throw new NotFoundException({ error: "repo not found" });
    }
    return status;
  }

  async unregisterRepository(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<void> {
    const application = this.requireMethod("unregister");
    await application({ orgId: this.resolveOrgId(query.orgId), repoId: params.id });
  }

  async listBranches(query: RepositoryReadModelListQueryDto): Promise<unknown[]> {
    const application = this.requireMethod("listBranches");
    const branches = await application({
      orgId: this.resolveOrgId(query.orgId),
      repoId: query.repoId,
      limit: parseOptionalInteger(query.limit),
    });
    return Array.isArray(branches) ? branches.map(toJsonDates) : [];
  }

  async getBranch(params: RepositoryReadModelIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("getBranch");
    const result = await application({ orgId: this.resolveOrgId(query.orgId), id: params.id });
    if (!result) throw new NotFoundException({ error: "repo branch not found" });
    return toJsonDates(result);
  }

  async listCommits(query: RepositoryReadModelListQueryDto): Promise<unknown[]> {
    const application = this.requireMethod("listCommits");
    const commits = await application({
      orgId: this.resolveOrgId(query.orgId),
      repoId: query.repoId,
      branch: query.branch,
      limit: parseOptionalInteger(query.limit),
    });
    return Array.isArray(commits) ? commits.map(toJsonDates) : [];
  }

  async getCommit(params: RepositoryReadModelIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    const application = this.requireMethod("getCommit");
    const result = await application({ orgId: this.resolveOrgId(query.orgId), id: params.id });
    if (!result) throw new NotFoundException({ error: "repo commit not found" });
    return toJsonDates(result);
  }

  private requireApplication(): RepositoryPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        list: (input) => this.store!.list(input),
        register: (input) => this.store!.register(input),
        get: (input) => this.store!.get(input),
        sync: (input) => this.store!.sync(input),
        syncRepo: (input) => this.store!.syncRepo(input),
        statusRepo: (input) => this.store!.statusRepo(input),
        unregister: (input) => this.store!.unregister(input),
        listBranches: (input) => this.store!.listBranches(input),
        getBranch: (input) => this.store!.getBranch(input),
        listCommits: (input) => this.store!.listCommits(input),
        getCommit: (input) => this.store!.getCommit(input),
      };
    }
    throw new InternalServerErrorException("Repository public API application facade is not configured.");
  }

  private requireMethod<Name extends keyof RepositoryPublicApplication>(
    name: Name,
  ): NonNullable<RepositoryPublicApplication[Name]> {
    const method = this.requireApplication()[name];
    if (!method) {
      throw new InternalServerErrorException(`Repository public API ${String(name)} facade is not configured.`);
    }
    return method as NonNullable<RepositoryPublicApplication[Name]>;
  }

  private resolveOrgId(orgId: string | undefined): string {
    const resolved = orgId ?? this.options?.orgId;
    if (!resolved) throw new InternalServerErrorException("Repository public API org scope is not configured.");
    return resolved;
  }
}

export class RepositoryPublicApiController {
  constructor(private readonly repositories: RepositoryPublicApiService) {}

  async listRepositories(query: RepositoryListQueryDto): Promise<unknown[]> {
    return await this.repositories.listRepositories(query);
  }

  async registerRepository(body: RepositoryCreateBodyDto): Promise<unknown> {
    return await this.repositories.registerRepository(body);
  }

  async loadRepository(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    return await this.repositories.loadRepository(params, query);
  }

  async syncRepositories(query: RepositoryRequestContextDto): Promise<unknown> {
    return await this.repositories.syncRepositories(query);
  }

  async syncRepository(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    return await this.repositories.syncRepository(params, query);
  }

  async getRepositoryStatus(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    return await this.repositories.getRepositoryStatus(params, query);
  }

  async unregisterRepository(params: RepositoryIdParamsDto, query: RepositoryRequestContextDto): Promise<void> {
    await this.repositories.unregisterRepository(params, query);
  }
}

export class RepositoryBranchPublicApiController {
  constructor(private readonly repositories: RepositoryPublicApiService) {}

  async listBranches(query: RepositoryReadModelListQueryDto): Promise<unknown[]> {
    return await this.repositories.listBranches(query);
  }

  async getBranch(params: RepositoryReadModelIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    return await this.repositories.getBranch(params, query);
  }
}

export class RepositoryCommitPublicApiController {
  constructor(private readonly repositories: RepositoryPublicApiService) {}

  async listCommits(query: RepositoryReadModelListQueryDto): Promise<unknown[]> {
    return await this.repositories.listCommits(query);
  }

  async getCommit(params: RepositoryReadModelIdParamsDto, query: RepositoryRequestContextDto): Promise<unknown> {
    return await this.repositories.getCommit(params, query);
  }
}

export class RepositoryPublicApiModule {
  static register(options: RepositoryPublicApiOptions): NestDynamicModule {
    return {
      module: RepositoryPublicApiModule,
      imports: [TypeOrmModule.forFeature(INTEGRATION_HUB_REPOSITORY_ENTITIES)],
      controllers: [
        RepositoryPublicApiController,
        RepositoryBranchPublicApiController,
        RepositoryCommitPublicApiController,
      ],
      providers: [
        { provide: REPOSITORY_PUBLIC_API_OPTIONS, useValue: options },
        RepositoryPublicStore,
        RepositoryPublicApiService,
      ],
      exports: [RepositoryPublicApiService],
    };
  }
}

function parseOptionalBoolean(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseOptionalInteger(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

Inject(REPOSITORY_PUBLIC_API_OPTIONS)(RepositoryPublicApiService, undefined, 0);
Inject(RepositoryPublicStore)(RepositoryPublicApiService, undefined, 1);
Inject(DataSource)(RepositoryPublicStore, undefined, 0);
Inject(RepositoryPublicApiService)(RepositoryPublicApiController, undefined, 0);
Inject(RepositoryPublicApiService)(RepositoryBranchPublicApiController, undefined, 0);
Inject(RepositoryPublicApiService)(RepositoryCommitPublicApiController, undefined, 0);

for (const dto of [
  RepositoryListQueryDto,
  RepositoryRequestContextDto,
  RepositoryReadModelListQueryDto,
  RepositoryCreateBodyDto,
] as const) {
  IsString()(dto.prototype, "orgId");
  MinLength(1)(dto.prototype, "orgId");
}

IsOptional()(RepositoryListQueryDto.prototype, "includeArchived");

IsUUID()(RepositoryIdParamsDto.prototype, "id");
IsString()(RepositoryReadModelIdParamsDto.prototype, "id");
MinLength(1)(RepositoryReadModelIdParamsDto.prototype, "id");

for (const property of ["repoId", "branch", "limit"] as const) {
  IsOptional()(RepositoryReadModelListQueryDto.prototype, property);
  IsString()(RepositoryReadModelListQueryDto.prototype, property);
  MinLength(1)(RepositoryReadModelListQueryDto.prototype, property);
}

IsString()(RepositoryCreateBodyDto.prototype, "name");
MinLength(1)(RepositoryCreateBodyDto.prototype, "name");

IsOptional()(RepositoryCreateBodyDto.prototype, "kind");
IsIn(["local", "remote"])(RepositoryCreateBodyDto.prototype, "kind");

for (const property of ["projectId", "slug", "localPath", "remoteUrl", "defaultBranch"] as const) {
  IsOptional()(RepositoryCreateBodyDto.prototype, property);
  IsString()(RepositoryCreateBodyDto.prototype, property);
  MinLength(1)(RepositoryCreateBodyDto.prototype, property);
}

const listRepositoriesDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "listRepositories",
);
const registerRepositoryDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "registerRepository",
);
const getRepositoryDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "loadRepository",
);
const syncRepositoriesDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "syncRepositories",
);
const syncRepositoryDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "syncRepository",
);
const getRepositoryStatusDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "getRepositoryStatus",
);
const unregisterRepositoryDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryPublicApiController.prototype,
  "unregisterRepository",
);
const listBranchesDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryBranchPublicApiController.prototype,
  "listBranches",
);
const getBranchDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryBranchPublicApiController.prototype,
  "getBranch",
);
const listCommitsDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryCommitPublicApiController.prototype,
  "listCommits",
);
const getCommitDescriptor = Object.getOwnPropertyDescriptor(
  RepositoryCommitPublicApiController.prototype,
  "getCommit",
);

if (
  !listRepositoriesDescriptor ||
  !registerRepositoryDescriptor ||
  !getRepositoryDescriptor ||
  !syncRepositoriesDescriptor ||
  !syncRepositoryDescriptor ||
  !getRepositoryStatusDescriptor ||
  !unregisterRepositoryDescriptor ||
  !listBranchesDescriptor ||
  !getBranchDescriptor ||
  !listCommitsDescriptor ||
  !getCommitDescriptor
) {
  throw new Error("RepositoryPublicApiController route descriptors are missing");
}

Controller("api/v1/repos")(RepositoryPublicApiController);
ApiTags("repos")(RepositoryPublicApiController);

Get()(RepositoryPublicApiController.prototype, "listRepositories", listRepositoriesDescriptor);
Query()(RepositoryPublicApiController.prototype, "listRepositories", 0);
ApiOperation({ summary: "List connected repositories" })(
  RepositoryPublicApiController.prototype,
  "listRepositories",
  listRepositoriesDescriptor,
);
ApiOkResponse({ description: "Repos" })(
  RepositoryPublicApiController.prototype,
  "listRepositories",
  listRepositoriesDescriptor,
);

Post()(RepositoryPublicApiController.prototype, "registerRepository", registerRepositoryDescriptor);
Body()(RepositoryPublicApiController.prototype, "registerRepository", 0);
ApiOperation({ summary: "Register a repository" })(
  RepositoryPublicApiController.prototype,
  "registerRepository",
  registerRepositoryDescriptor,
);
ApiCreatedResponse({ description: "Registered repository" })(
  RepositoryPublicApiController.prototype,
  "registerRepository",
  registerRepositoryDescriptor,
);

Get(":id")(RepositoryPublicApiController.prototype, "loadRepository", getRepositoryDescriptor);
Param()(RepositoryPublicApiController.prototype, "loadRepository", 0);
Query()(RepositoryPublicApiController.prototype, "loadRepository", 1);
ApiOperation({ summary: "Get repository" })(
  RepositoryPublicApiController.prototype,
  "loadRepository",
  getRepositoryDescriptor,
);
ApiParam({ name: "id", required: true })(
  RepositoryPublicApiController.prototype,
  "loadRepository",
  getRepositoryDescriptor,
);
ApiOkResponse({ description: "Repository" })(
  RepositoryPublicApiController.prototype,
  "loadRepository",
  getRepositoryDescriptor,
);

Post("sync")(RepositoryPublicApiController.prototype, "syncRepositories", syncRepositoriesDescriptor);
HttpCode(202)(RepositoryPublicApiController.prototype, "syncRepositories", syncRepositoriesDescriptor);
Query()(RepositoryPublicApiController.prototype, "syncRepositories", 0);
ApiOperation({ summary: "Queue repository sync for all active repositories" })(
  RepositoryPublicApiController.prototype,
  "syncRepositories",
  syncRepositoriesDescriptor,
);
ApiAcceptedResponse({ description: "Sync queued" })(
  RepositoryPublicApiController.prototype,
  "syncRepositories",
  syncRepositoriesDescriptor,
);

Post(":id/sync")(RepositoryPublicApiController.prototype, "syncRepository", syncRepositoryDescriptor);
HttpCode(202)(RepositoryPublicApiController.prototype, "syncRepository", syncRepositoryDescriptor);
Param()(RepositoryPublicApiController.prototype, "syncRepository", 0);
Query()(RepositoryPublicApiController.prototype, "syncRepository", 1);
ApiOperation({ summary: "Queue repository sync" })(
  RepositoryPublicApiController.prototype,
  "syncRepository",
  syncRepositoryDescriptor,
);
ApiParam({ name: "id", required: true })(
  RepositoryPublicApiController.prototype,
  "syncRepository",
  syncRepositoryDescriptor,
);
ApiAcceptedResponse({ description: "Sync queued" })(
  RepositoryPublicApiController.prototype,
  "syncRepository",
  syncRepositoryDescriptor,
);

Get(":id/status")(RepositoryPublicApiController.prototype, "getRepositoryStatus", getRepositoryStatusDescriptor);
Param()(RepositoryPublicApiController.prototype, "getRepositoryStatus", 0);
Query()(RepositoryPublicApiController.prototype, "getRepositoryStatus", 1);
ApiOperation({ summary: "Get repository sync status" })(
  RepositoryPublicApiController.prototype,
  "getRepositoryStatus",
  getRepositoryStatusDescriptor,
);
ApiParam({ name: "id", required: true })(
  RepositoryPublicApiController.prototype,
  "getRepositoryStatus",
  getRepositoryStatusDescriptor,
);
ApiOkResponse({ description: "Repository status" })(
  RepositoryPublicApiController.prototype,
  "getRepositoryStatus",
  getRepositoryStatusDescriptor,
);

Delete(":id")(RepositoryPublicApiController.prototype, "unregisterRepository", unregisterRepositoryDescriptor);
HttpCode(204)(RepositoryPublicApiController.prototype, "unregisterRepository", unregisterRepositoryDescriptor);
Param()(RepositoryPublicApiController.prototype, "unregisterRepository", 0);
Query()(RepositoryPublicApiController.prototype, "unregisterRepository", 1);
ApiOperation({ summary: "Unregister a repository" })(
  RepositoryPublicApiController.prototype,
  "unregisterRepository",
  unregisterRepositoryDescriptor,
);
ApiParam({ name: "id", required: true })(
  RepositoryPublicApiController.prototype,
  "unregisterRepository",
  unregisterRepositoryDescriptor,
);
ApiNoContentResponse({ description: "Unregistered" })(
  RepositoryPublicApiController.prototype,
  "unregisterRepository",
  unregisterRepositoryDescriptor,
);

Controller("api/v1/repo-branches")(RepositoryBranchPublicApiController);
ApiTags("repo-branches")(RepositoryBranchPublicApiController);

Get()(RepositoryBranchPublicApiController.prototype, "listBranches", listBranchesDescriptor);
Query()(RepositoryBranchPublicApiController.prototype, "listBranches", 0);
ApiOperation({ summary: "List repository branches" })(
  RepositoryBranchPublicApiController.prototype,
  "listBranches",
  listBranchesDescriptor,
);
ApiOkResponse({ description: "Repository branches" })(
  RepositoryBranchPublicApiController.prototype,
  "listBranches",
  listBranchesDescriptor,
);

Get(":id")(RepositoryBranchPublicApiController.prototype, "getBranch", getBranchDescriptor);
Param()(RepositoryBranchPublicApiController.prototype, "getBranch", 0);
Query()(RepositoryBranchPublicApiController.prototype, "getBranch", 1);
ApiOperation({ summary: "Get repository branch" })(
  RepositoryBranchPublicApiController.prototype,
  "getBranch",
  getBranchDescriptor,
);
ApiParam({ name: "id", required: true })(
  RepositoryBranchPublicApiController.prototype,
  "getBranch",
  getBranchDescriptor,
);
ApiOkResponse({ description: "Repository branch" })(
  RepositoryBranchPublicApiController.prototype,
  "getBranch",
  getBranchDescriptor,
);

Controller("api/v1/repo-commits")(RepositoryCommitPublicApiController);
ApiTags("repo-commits")(RepositoryCommitPublicApiController);

Get()(RepositoryCommitPublicApiController.prototype, "listCommits", listCommitsDescriptor);
Query()(RepositoryCommitPublicApiController.prototype, "listCommits", 0);
ApiOperation({ summary: "List repository commits" })(
  RepositoryCommitPublicApiController.prototype,
  "listCommits",
  listCommitsDescriptor,
);
ApiOkResponse({ description: "Repository commits" })(
  RepositoryCommitPublicApiController.prototype,
  "listCommits",
  listCommitsDescriptor,
);

Get(":id")(RepositoryCommitPublicApiController.prototype, "getCommit", getCommitDescriptor);
Param()(RepositoryCommitPublicApiController.prototype, "getCommit", 0);
Query()(RepositoryCommitPublicApiController.prototype, "getCommit", 1);
ApiOperation({ summary: "Get repository commit" })(
  RepositoryCommitPublicApiController.prototype,
  "getCommit",
  getCommitDescriptor,
);
ApiParam({ name: "id", required: true })(
  RepositoryCommitPublicApiController.prototype,
  "getCommit",
  getCommitDescriptor,
);
ApiOkResponse({ description: "Repository commit" })(
  RepositoryCommitPublicApiController.prototype,
  "getCommit",
  getCommitDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature(INTEGRATION_HUB_REPOSITORY_ENTITIES)],
  controllers: [
    RepositoryPublicApiController,
    RepositoryBranchPublicApiController,
    RepositoryCommitPublicApiController,
  ],
  providers: [
    { provide: REPOSITORY_PUBLIC_API_OPTIONS, useValue: null },
    RepositoryPublicStore,
    RepositoryPublicApiService,
  ],
  exports: [RepositoryPublicApiService],
})(RepositoryPublicApiModule);
