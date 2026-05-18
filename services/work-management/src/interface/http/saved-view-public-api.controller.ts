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
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";
import { SavedViewPublicStore } from "@work-management/infrastructure/database/saved-view-public-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { SavedViewListQueryDto, CreateSavedViewBodyDto, SavedViewIdParamsDto, PatchSavedViewBodyDto, SAVED_VIEW_SCOPES, SAVED_VIEW_TYPES } from "./dto/saved-view.dto.ts";
import type { PublicSavedViewScope, PublicSavedViewType } from "./dto/saved-view.dto.ts";
export { SavedViewListQueryDto, CreateSavedViewBodyDto, SavedViewIdParamsDto, PatchSavedViewBodyDto };
export type { PublicSavedViewScope, PublicSavedViewType };

export const SAVED_VIEW_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.savedViewPublicApi.options");



export interface SavedViewPublicApplication {
  list(input?: unknown): Promise<unknown>;
  create(input: unknown): Promise<unknown>;
  get?(input: unknown): Promise<unknown>;
  update?(input: unknown): Promise<unknown>;
  delete(input: unknown): Promise<unknown>;
}

export interface SavedViewPublicApiOptions {
  application?: SavedViewPublicApplication;
  featuresEnv?: string;
}

export class SavedViewPublicApiService {
  constructor(
    private readonly options: SavedViewPublicApiOptions | null = null,
    private readonly store: SavedViewPublicStore | null = null,
  ) {}

  async listSavedViews(query: SavedViewListQueryDto = {}): Promise<unknown[]> {
    const views = await this.requireApplication().list(definedScope(query));
    return Array.isArray(views) ? views.map(toJsonDates) : [];
  }

  async createSavedView(body: CreateSavedViewBodyDto): Promise<unknown> {
    const view = await this.requireApplication().create({
      orgId: body.orgId,
      ...definedScope(body),
      name: body.name,
      scope: body.scope ?? "private",
      viewType: body.viewType ?? "list",
      filters: body.filters,
      sortBy: body.sortBy,
      isDefault: body.isDefault,
    });
    if (!view) {
      throw new InternalServerErrorException("Saved-view public API create facade returned no saved view.");
    }
    return toJsonDates(view);
  }

  async getSavedView(params: SavedViewIdParamsDto): Promise<unknown> {
    const view = await this.requireMethod("get")({ id: params.id });
    if (!view) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(view);
  }

  async patchSavedView(params: SavedViewIdParamsDto, body: PatchSavedViewBodyDto): Promise<unknown> {
    const view = await this.requireMethod("update")({
      id: params.id,
      ...definedPatch(body),
    });
    if (!view) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(view);
  }

  async deleteSavedView(params: SavedViewIdParamsDto): Promise<void> {
    const view = await this.requireApplication().delete({ id: params.id });
    if (!view) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }

  private requireApplication(): SavedViewPublicApplication {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        list: (input) => this.store!.list(input as never),
        create: (input) => this.store!.create(input as never),
        get: (input) => this.store!.get(input as never),
        update: (input) => this.store!.update(input as never),
        delete: (input) => this.store!.delete(input as never),
      };
    }
    throw new InternalServerErrorException("Application-backed REST saved-views route is required.");
  }

  private requireMethod<Name extends keyof SavedViewPublicApplication>(
    name: Name,
  ): NonNullable<SavedViewPublicApplication[Name]> {
    const method = this.requireApplication()[name];
    if (!method) {
      throw new InternalServerErrorException(`Saved-view public API ${String(name)} facade is not configured.`);
    }
    return method as NonNullable<SavedViewPublicApplication[Name]>;
  }
}

export class SavedViewPublicApiController {
  constructor(private readonly savedViews: SavedViewPublicApiService) {}

  async listSavedViews(query: SavedViewListQueryDto = {}): Promise<unknown[]> {
    return await this.savedViews.listSavedViews(query);
  }

  async createSavedView(body: CreateSavedViewBodyDto): Promise<unknown> {
    return await this.savedViews.createSavedView(body);
  }

  async getSavedView(params: SavedViewIdParamsDto): Promise<unknown> {
    return await this.savedViews.getSavedView(params);
  }

  async patchSavedView(params: SavedViewIdParamsDto, body: PatchSavedViewBodyDto): Promise<unknown> {
    return await this.savedViews.patchSavedView(params, body);
  }

  async deleteSavedView(params: SavedViewIdParamsDto): Promise<void> {
    await this.savedViews.deleteSavedView(params);
  }
}

export class SavedViewPublicApiModule {
  static register(options: SavedViewPublicApiOptions): NestDynamicModule {
    return {
      module: SavedViewPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [SavedViewPublicApiController],
      providers: [
        { provide: SAVED_VIEW_PUBLIC_API_OPTIONS, useValue: options },
        SavedViewPublicStore,
        SavedViewPublicApiService,
      ],
      exports: [SavedViewPublicApiService],
    };
  }
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function definedScope(input: { orgId?: string; projectId?: string }): Record<string, string> {
  const scope: Record<string, string> = {};
  if (input.orgId !== undefined) scope["orgId"] = input.orgId;
  if (input.projectId !== undefined) scope["projectId"] = input.projectId;
  return scope;
}

function definedPatch(input: PatchSavedViewBodyDto): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch["name"] = input.name;
  if (input.scope !== undefined) patch["scope"] = input.scope;
  if (input.viewType !== undefined) patch["viewType"] = input.viewType;
  if (input.filters !== undefined) patch["filters"] = input.filters;
  if (input.sortBy !== undefined) patch["sortBy"] = input.sortBy;
  if (input.isDefault !== undefined) patch["isDefault"] = input.isDefault;
  return patch;
}

Inject(SAVED_VIEW_PUBLIC_API_OPTIONS)(SavedViewPublicApiService, undefined, 0);
Inject(SavedViewPublicStore)(SavedViewPublicApiService, undefined, 1);
Inject(DataSource)(SavedViewPublicStore, undefined, 0);
Inject(SavedViewPublicApiService)(SavedViewPublicApiController, undefined, 0);

for (const property of ["orgId", "projectId"] as const) {
  IsOptional()(SavedViewListQueryDto.prototype, property);
  IsUUID()(SavedViewListQueryDto.prototype, property);
}

IsUUID()(CreateSavedViewBodyDto.prototype, "orgId");
IsOptional()(CreateSavedViewBodyDto.prototype, "projectId");
IsUUID()(CreateSavedViewBodyDto.prototype, "projectId");
IsString()(CreateSavedViewBodyDto.prototype, "name");
MinLength(1)(CreateSavedViewBodyDto.prototype, "name");
IsOptional()(CreateSavedViewBodyDto.prototype, "scope");
IsIn(SAVED_VIEW_SCOPES)(CreateSavedViewBodyDto.prototype, "scope");
IsOptional()(CreateSavedViewBodyDto.prototype, "viewType");
IsIn(SAVED_VIEW_TYPES)(CreateSavedViewBodyDto.prototype, "viewType");
IsOptional()(CreateSavedViewBodyDto.prototype, "filters");
IsObject()(CreateSavedViewBodyDto.prototype, "filters");
IsOptional()(CreateSavedViewBodyDto.prototype, "sortBy");
IsString()(CreateSavedViewBodyDto.prototype, "sortBy");
IsOptional()(CreateSavedViewBodyDto.prototype, "isDefault");
IsBoolean()(CreateSavedViewBodyDto.prototype, "isDefault");

IsUUID()(SavedViewIdParamsDto.prototype, "id");

IsOptional()(PatchSavedViewBodyDto.prototype, "name");
IsString()(PatchSavedViewBodyDto.prototype, "name");
MinLength(1)(PatchSavedViewBodyDto.prototype, "name");
IsOptional()(PatchSavedViewBodyDto.prototype, "scope");
IsIn(SAVED_VIEW_SCOPES)(PatchSavedViewBodyDto.prototype, "scope");
IsOptional()(PatchSavedViewBodyDto.prototype, "viewType");
IsIn(SAVED_VIEW_TYPES)(PatchSavedViewBodyDto.prototype, "viewType");
IsOptional()(PatchSavedViewBodyDto.prototype, "filters");
IsObject()(PatchSavedViewBodyDto.prototype, "filters");
IsOptional()(PatchSavedViewBodyDto.prototype, "sortBy");
IsString()(PatchSavedViewBodyDto.prototype, "sortBy");
IsOptional()(PatchSavedViewBodyDto.prototype, "isDefault");
IsBoolean()(PatchSavedViewBodyDto.prototype, "isDefault");

const listSavedViewsDescriptor = Object.getOwnPropertyDescriptor(
  SavedViewPublicApiController.prototype,
  "listSavedViews",
);
const createSavedViewDescriptor = Object.getOwnPropertyDescriptor(
  SavedViewPublicApiController.prototype,
  "createSavedView",
);
const getSavedViewDescriptor = Object.getOwnPropertyDescriptor(
  SavedViewPublicApiController.prototype,
  "getSavedView",
);
const patchSavedViewDescriptor = Object.getOwnPropertyDescriptor(
  SavedViewPublicApiController.prototype,
  "patchSavedView",
);
const deleteSavedViewDescriptor = Object.getOwnPropertyDescriptor(
  SavedViewPublicApiController.prototype,
  "deleteSavedView",
);

if (
  !listSavedViewsDescriptor ||
  !createSavedViewDescriptor ||
  !getSavedViewDescriptor ||
  !patchSavedViewDescriptor ||
  !deleteSavedViewDescriptor
) {
  throw new Error("SavedViewPublicApiController route descriptors are missing");
}

Controller("api/v1/saved-views")(SavedViewPublicApiController);
ApiTags("saved-views")(SavedViewPublicApiController);

Get()(SavedViewPublicApiController.prototype, "listSavedViews", listSavedViewsDescriptor);
Query()(SavedViewPublicApiController.prototype, "listSavedViews", 0);
ApiOperation({ summary: "List saved views" })(
  SavedViewPublicApiController.prototype,
  "listSavedViews",
  listSavedViewsDescriptor,
);
ApiOkResponse({ description: "Saved view list" })(
  SavedViewPublicApiController.prototype,
  "listSavedViews",
  listSavedViewsDescriptor,
);

Post()(SavedViewPublicApiController.prototype, "createSavedView", createSavedViewDescriptor);
Body()(SavedViewPublicApiController.prototype, "createSavedView", 0);
ApiOperation({ summary: "Create a saved view" })(
  SavedViewPublicApiController.prototype,
  "createSavedView",
  createSavedViewDescriptor,
);
ApiCreatedResponse({ description: "Created saved view" })(
  SavedViewPublicApiController.prototype,
  "createSavedView",
  createSavedViewDescriptor,
);

Get(":id")(SavedViewPublicApiController.prototype, "getSavedView", getSavedViewDescriptor);
Param()(SavedViewPublicApiController.prototype, "getSavedView", 0);
ApiOperation({ summary: "Get a saved view" })(
  SavedViewPublicApiController.prototype,
  "getSavedView",
  getSavedViewDescriptor,
);
ApiParam({ name: "id", required: true })(
  SavedViewPublicApiController.prototype,
  "getSavedView",
  getSavedViewDescriptor,
);
ApiOkResponse({ description: "Saved view" })(
  SavedViewPublicApiController.prototype,
  "getSavedView",
  getSavedViewDescriptor,
);

Patch(":id")(SavedViewPublicApiController.prototype, "patchSavedView", patchSavedViewDescriptor);
Param()(SavedViewPublicApiController.prototype, "patchSavedView", 0);
Body()(SavedViewPublicApiController.prototype, "patchSavedView", 1);
ApiOperation({ summary: "Update a saved view" })(
  SavedViewPublicApiController.prototype,
  "patchSavedView",
  patchSavedViewDescriptor,
);
ApiParam({ name: "id", required: true })(
  SavedViewPublicApiController.prototype,
  "patchSavedView",
  patchSavedViewDescriptor,
);
ApiOkResponse({ description: "Updated saved view" })(
  SavedViewPublicApiController.prototype,
  "patchSavedView",
  patchSavedViewDescriptor,
);

Delete(":id")(SavedViewPublicApiController.prototype, "deleteSavedView", deleteSavedViewDescriptor);
HttpCode(204)(SavedViewPublicApiController.prototype, "deleteSavedView", deleteSavedViewDescriptor);
Param()(SavedViewPublicApiController.prototype, "deleteSavedView", 0);
ApiOperation({ summary: "Delete a saved view" })(
  SavedViewPublicApiController.prototype,
  "deleteSavedView",
  deleteSavedViewDescriptor,
);
ApiParam({ name: "id", required: true })(
  SavedViewPublicApiController.prototype,
  "deleteSavedView",
  deleteSavedViewDescriptor,
);
ApiNoContentResponse({ description: "Deleted" })(
  SavedViewPublicApiController.prototype,
  "deleteSavedView",
  deleteSavedViewDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [SavedViewPublicApiController],
  providers: [
    { provide: SAVED_VIEW_PUBLIC_API_OPTIONS, useValue: null },
    SavedViewPublicStore,
    SavedViewPublicApiService,
  ],
  exports: [SavedViewPublicApiService],
})(SavedViewPublicApiModule);
