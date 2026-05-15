import "reflect-metadata";

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { DataSource } from "typeorm";

import { FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES } from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import { DocumentPublicStore } from "@knowledge-workspace/infrastructure/database/document-public-store.ts";
import { KNOWLEDGE_WORKSPACE_ENTITIES } from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import { MemoryPublicStore } from "@knowledge-workspace/infrastructure/database/memory-public-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const MEMORY_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.memoryPublicApi.options");

const MEMORY_KINDS = [
  "note",
  "decision",
  "blocker",
  "file_ref",
  "section_anchor",
  "link",
  "fact",
] as const;
const MEMORY_IMPORTANCE = ["low", "medium", "high"] as const;
const MEMORY_SOURCE = ["heuristic", "llm", "manual"] as const;

export type PublicMemoryKind = (typeof MEMORY_KINDS)[number];
export type PublicMemoryImportance = (typeof MEMORY_IMPORTANCE)[number];
export type PublicMemorySource = (typeof MEMORY_SOURCE)[number];

export interface MemoryPublicApplication {
  list(input: unknown): Promise<unknown>;
  create(input: unknown): Promise<unknown>;
  search?(input: unknown): Promise<unknown>;
  get(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  delete(input: unknown): Promise<unknown>;
  promote?(input: unknown): Promise<unknown>;
  archive?(input: unknown): Promise<unknown>;
  restore?(input: unknown): Promise<unknown>;
}

export interface ContextPreviewPublicApplication {
  preview(input: unknown): Promise<unknown>;
}

export interface MemoryDigestClient {
  summarize(memories: Array<{ body: string; kind: string; importance: string }>): Promise<string>;
}

export interface MemoryPublicApiOptions {
  application?: MemoryPublicApplication;
  context?: ContextPreviewPublicApplication;
  digestClient?: MemoryDigestClient;
  featuresEnv?: string;
}

export class MemoryListQueryDto {
  projectId?: string;
  global?: boolean | string;
  kind?: PublicMemoryKind;
  tags?: string;
  importance?: PublicMemoryImportance;
  archived?: boolean | string;
  source?: PublicMemorySource;
  limit?: number | string;
  offset?: number | string;
}

export class CreateMemoryBodyDto {
  projectId?: string | null;
  global?: boolean;
  kind?: PublicMemoryKind;
  body!: string;
  tags?: string[];
  importance?: PublicMemoryImportance;
  source?: "manual";
  sourceRef?: Record<string, unknown>;
}

export class MemorySearchQueryDto extends MemoryListQueryDto {
  query!: string;
}

export class MemoryPatchBodyDto {
  body?: string;
  tags?: string[];
  importance?: PublicMemoryImportance;
  forceEdit?: boolean;
}

export class MemoryIdParamsDto {
  id!: string;
}

export class MemoryDeleteQueryDto {
  confirm?: string;
}

export class MemoryDigestBodyDto {
  projectId!: string;
  since?: string;
}

export class ContextPreviewQueryDto {
  taskId!: string;
  budget?: number | string;
  includeGlobal?: boolean | string;
}

export class MemoryPublicApiService {
  constructor(
    private readonly options: MemoryPublicApiOptions | null = null,
    private readonly store: MemoryPublicStore | null = null,
    private readonly documentStore: DocumentPublicStore | null = null,
  ) {}

  async listMemories(query: MemoryListQueryDto, authorization: string | undefined): Promise<unknown[]> {
    const memories = await this.requireMemoryApplication(authorization).list(normalizeMemoryListQuery(query));
    return Array.isArray(memories) ? memories.map(toJsonDates) : [];
  }

  async createMemory(body: CreateMemoryBodyDto, authorization: string | undefined): Promise<unknown> {
    const memory = await this.requireMemoryApplication(authorization).create(body);
    if (!memory) {
      throw new InternalServerErrorException("Memory public API create facade returned no memory.");
    }
    return toJsonDates(memory);
  }

  async searchMemories(query: MemorySearchQueryDto, authorization: string | undefined): Promise<unknown[]> {
    const application = this.requireMemoryApplication(authorization);
    const search = application.search;
    if (!search) {
      throw new InternalServerErrorException("Application-backed REST memory route is required.");
    }
    const memories = await search(normalizeMemorySearchQuery(query));
    return Array.isArray(memories) ? memories.map(toJsonDates) : [];
  }

  async getMemory(params: MemoryIdParamsDto, authorization: string | undefined): Promise<unknown> {
    const memory = await this.requireMemoryApplication(authorization).get({ id: params.id });
    if (!memory) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(memory);
  }

  async patchMemory(
    params: MemoryIdParamsDto,
    body: MemoryPatchBodyDto,
    authorization: string | undefined,
  ): Promise<unknown> {
    if (body.body !== undefined && body.body.trim().length === 0) {
      throw new UnprocessableEntityException({
        error: "Body must not be empty.",
        code: "VALIDATION_ERROR",
        details: { body: ["String must contain at least 1 character(s)"] },
      });
    }
    const memory = await this.requireMemoryApplication(authorization).update({ id: params.id, ...body });
    if (!memory) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(memory);
  }

  async deleteMemory(
    params: MemoryIdParamsDto,
    query: MemoryDeleteQueryDto,
    authorization: string | undefined,
  ): Promise<unknown> {
    if (query.confirm !== "true") {
      throw new BadRequestException({ error: "DELETE requires confirm=true", code: "CONFIRM_REQUIRED" });
    }
    const result = await this.requireMemoryApplication(authorization).delete({ id: params.id });
    if (!result) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(result);
  }

  async promoteMemory(params: MemoryIdParamsDto, authorization: string | undefined): Promise<unknown> {
    return await this.runMemoryAction(params, authorization, "promote");
  }

  async archiveMemory(params: MemoryIdParamsDto, authorization: string | undefined): Promise<unknown> {
    return await this.runMemoryAction(params, authorization, "archive");
  }

  async restoreMemory(params: MemoryIdParamsDto, authorization: string | undefined): Promise<unknown> {
    return await this.runMemoryAction(params, authorization, "restore");
  }

  async previewContext(query: ContextPreviewQueryDto, authorization: string | undefined): Promise<unknown> {
    this.requireFeatureEnabled();
    this.requireAuthorization(authorization);
    const context = this.options?.context;
    if (!context) {
      throw new InternalServerErrorException("Application-backed REST memory route is required.");
    }
    return await context.preview(normalizeContextPreviewQuery(query));
  }

  async digestMemories(body: MemoryDigestBodyDto, authorization: string | undefined): Promise<unknown> {
    this.requireFeatureEnabled();
    this.requireAuthorization(authorization);
    this.requireDigestEnabled();
    if (!body.projectId) {
      throw new BadRequestException({ error: "projectId is required", code: "VALIDATION_ERROR" });
    }

    const sinceDate = parseSinceDate(body.since);
    const memories = await this.requireStore().listDigestWindow({
      projectId: body.projectId,
      since: sinceDate,
    });
    if (memories.length === 0) return null;

    const summary = await this.digestClient().summarize(
      memories.map((memory) => ({
        body: memory.body,
        kind: memory.kind,
        importance: memory.importance,
      })),
    );
    if (!summary.trim()) {
      throw new InternalServerErrorException("Memory digest summarizer returned an empty summary.");
    }

    const document = await this.requireDocumentStore().create({
      projectId: body.projectId,
      title: `Memory digest ${sinceDate.toISOString().slice(0, 10)}`,
      docType: "memory_digest",
      bodyMd: summary,
    });
    if (!document) {
      throw new InternalServerErrorException("Memory digest document could not be created.");
    }

    return {
      docId: document.id,
      body: summary,
      projectId: body.projectId,
      since: sinceDate.toISOString(),
    };
  }

  private async runMemoryAction(
    params: MemoryIdParamsDto,
    authorization: string | undefined,
    action: "promote" | "archive" | "restore",
  ): Promise<unknown> {
    const application = this.requireMemoryApplication(authorization);
    const actionHandler = application[action];
    if (!actionHandler) {
      throw new InternalServerErrorException("Application-backed REST memory route is required.");
    }
    const memory = await actionHandler({ id: params.id });
    if (!memory) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return toJsonDates(memory);
  }

  private requireMemoryApplication(authorization: string | undefined): MemoryPublicApplication {
    this.requireFeatureEnabled();
    this.requireAuthorization(authorization);
    const application = this.options?.application;
    if (application) return application;
    if (this.store) {
      return {
        list: (input) => this.store!.list(input as Parameters<MemoryPublicStore["list"]>[0]),
        create: (input) => this.store!.create(input as Parameters<MemoryPublicStore["create"]>[0]),
        search: (input) => this.store!.search(input as Parameters<MemoryPublicStore["search"]>[0]),
        get: (input) => this.store!.get(input as Parameters<MemoryPublicStore["get"]>[0]),
        update: (input) => this.store!.update(input as Parameters<MemoryPublicStore["update"]>[0]),
        delete: (input) => this.store!.delete(input as Parameters<MemoryPublicStore["delete"]>[0]),
        promote: (input) => this.store!.promote(input as Parameters<MemoryPublicStore["promote"]>[0]),
        archive: (input) => this.store!.archive(input as Parameters<MemoryPublicStore["archive"]>[0]),
        restore: (input) => this.store!.restore(input as Parameters<MemoryPublicStore["restore"]>[0]),
      };
    }
    throw new InternalServerErrorException("Application-backed REST memory route is required.");
  }

  private requireFeatureEnabled(): void {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
  }

  private requireDigestEnabled(): void {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("report-llm-narration", env)) {
      throw new BadRequestException({ error: "feature not enabled", code: "FEATURE_DISABLED" });
    }
  }

  private requireAuthorization(authorization: string | undefined): void {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }
  }

  private requireStore(): MemoryPublicStore {
    if (!this.store) {
      throw new InternalServerErrorException("Memory TypeORM store is not configured.");
    }
    return this.store;
  }

  private requireDocumentStore(): DocumentPublicStore {
    if (!this.documentStore) {
      throw new InternalServerErrorException("Document TypeORM store is not configured.");
    }
    return this.documentStore;
  }

  private digestClient(): MemoryDigestClient {
    return this.options?.digestClient ?? defaultMemoryDigestClient();
  }
}

export class MemoryPublicApiController {
  constructor(private readonly memories: MemoryPublicApiService) {}

  async listMemories(query: MemoryListQueryDto, authorization?: string): Promise<unknown[]> {
    return await this.memories.listMemories(query, authorization);
  }

  async createMemory(body: CreateMemoryBodyDto, authorization?: string): Promise<unknown> {
    return await this.memories.createMemory(body, authorization);
  }

  async searchMemories(query: MemorySearchQueryDto, authorization?: string): Promise<unknown[]> {
    return await this.memories.searchMemories(query, authorization);
  }

  async getMemory(params: MemoryIdParamsDto, authorization?: string): Promise<unknown> {
    return await this.memories.getMemory(params, authorization);
  }

  async patchMemory(
    params: MemoryIdParamsDto,
    body: MemoryPatchBodyDto,
    authorization?: string,
  ): Promise<unknown> {
    return await this.memories.patchMemory(params, body, authorization);
  }

  async deleteMemory(
    params: MemoryIdParamsDto,
    query: MemoryDeleteQueryDto,
    authorization?: string,
  ): Promise<unknown> {
    return await this.memories.deleteMemory(params, query, authorization);
  }

  async promoteMemory(params: MemoryIdParamsDto, authorization?: string): Promise<unknown> {
    return await this.memories.promoteMemory(params, authorization);
  }

  async archiveMemory(params: MemoryIdParamsDto, authorization?: string): Promise<unknown> {
    return await this.memories.archiveMemory(params, authorization);
  }

  async restoreMemory(params: MemoryIdParamsDto, authorization?: string): Promise<unknown> {
    return await this.memories.restoreMemory(params, authorization);
  }

  async digestMemories(body: MemoryDigestBodyDto, authorization?: string): Promise<unknown> {
    return await this.memories.digestMemories(body, authorization);
  }
}

export class ContextPreviewPublicApiController {
  constructor(private readonly memories: MemoryPublicApiService) {}

  async previewContext(query: ContextPreviewQueryDto, authorization?: string): Promise<unknown> {
    return await this.memories.previewContext(query, authorization);
  }
}

export class MemoryPublicApiModule {
  static register(options: MemoryPublicApiOptions): NestDynamicModule {
    return {
      module: MemoryPublicApiModule,
      imports: [
        TypeOrmModule.forFeature([
          ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
          ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
          ...KNOWLEDGE_WORKSPACE_ENTITIES,
        ]),
      ],
      controllers: [MemoryPublicApiController, ContextPreviewPublicApiController],
      providers: [
        { provide: MEMORY_PUBLIC_API_OPTIONS, useValue: options },
        MemoryPublicStore,
        DocumentPublicStore,
        MemoryPublicApiService,
      ],
      exports: [MemoryPublicApiService],
    };
  }
}

function normalizeMemoryListQuery(query: MemoryListQueryDto): Record<string, unknown> {
  return compactRecord({
    projectId: query.projectId,
    global: parseOptionalBoolean(query.global),
    kind: query.kind,
    tags: parseTags(query.tags),
    importance: query.importance,
    archived: parseOptionalBoolean(query.archived),
    source: query.source,
    limit: parseOptionalInteger(query.limit),
    offset: parseOptionalInteger(query.offset),
  });
}

function normalizeMemorySearchQuery(query: MemorySearchQueryDto): Record<string, unknown> {
  return {
    query: query.query,
    ...normalizeMemoryListQuery(query),
  };
}

function normalizeContextPreviewQuery(query: ContextPreviewQueryDto): Record<string, unknown> {
  return compactRecord({
    taskId: query.taskId,
    budget: parseOptionalInteger(query.budget),
    includeGlobal: parseOptionalBoolean(query.includeGlobal),
  });
}

function parseSinceDate(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ error: "since must be a valid date", code: "VALIDATION_ERROR" });
  }
  return date;
}

function parseTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined;
  const parsed = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalBoolean(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseOptionalInteger(value: number | string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isInteger(value) ? value : undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

Inject(MEMORY_PUBLIC_API_OPTIONS)(MemoryPublicApiService, undefined, 0);
Inject(MemoryPublicStore)(MemoryPublicApiService, undefined, 1);
Inject(DocumentPublicStore)(MemoryPublicApiService, undefined, 2);
Inject(DataSource)(MemoryPublicStore, undefined, 0);
Inject(DataSource)(DocumentPublicStore, undefined, 0);
Inject(MemoryPublicApiService)(MemoryPublicApiController, undefined, 0);
Inject(MemoryPublicApiService)(ContextPreviewPublicApiController, undefined, 0);

IsOptional()(MemoryListQueryDto.prototype, "projectId");
IsUUID()(MemoryListQueryDto.prototype, "projectId");
IsOptional()(MemoryListQueryDto.prototype, "global");
IsOptional()(MemoryListQueryDto.prototype, "kind");
IsIn(MEMORY_KINDS)(MemoryListQueryDto.prototype, "kind");
IsOptional()(MemoryListQueryDto.prototype, "tags");
IsString()(MemoryListQueryDto.prototype, "tags");
IsOptional()(MemoryListQueryDto.prototype, "importance");
IsIn(MEMORY_IMPORTANCE)(MemoryListQueryDto.prototype, "importance");
IsOptional()(MemoryListQueryDto.prototype, "archived");
IsOptional()(MemoryListQueryDto.prototype, "source");
IsIn(MEMORY_SOURCE)(MemoryListQueryDto.prototype, "source");
IsOptional()(MemoryListQueryDto.prototype, "limit");
IsOptional()(MemoryListQueryDto.prototype, "offset");

IsString()(MemorySearchQueryDto.prototype, "query");
MinLength(1)(MemorySearchQueryDto.prototype, "query");

IsOptional()(CreateMemoryBodyDto.prototype, "projectId");
IsOptional()(CreateMemoryBodyDto.prototype, "global");
IsOptional()(CreateMemoryBodyDto.prototype, "kind");
IsIn(MEMORY_KINDS)(CreateMemoryBodyDto.prototype, "kind");
IsString()(CreateMemoryBodyDto.prototype, "body");
MinLength(1)(CreateMemoryBodyDto.prototype, "body");
IsOptional()(CreateMemoryBodyDto.prototype, "tags");
IsArray()(CreateMemoryBodyDto.prototype, "tags");
ArrayMaxSize(50)(CreateMemoryBodyDto.prototype, "tags");
IsOptional()(CreateMemoryBodyDto.prototype, "importance");
IsIn(MEMORY_IMPORTANCE)(CreateMemoryBodyDto.prototype, "importance");
IsOptional()(CreateMemoryBodyDto.prototype, "source");
IsIn(["manual"])(CreateMemoryBodyDto.prototype, "source");
IsOptional()(CreateMemoryBodyDto.prototype, "sourceRef");
IsObject()(CreateMemoryBodyDto.prototype, "sourceRef");

IsOptional()(MemoryPatchBodyDto.prototype, "body");
IsString()(MemoryPatchBodyDto.prototype, "body");
MinLength(1)(MemoryPatchBodyDto.prototype, "body");
IsOptional()(MemoryPatchBodyDto.prototype, "tags");
IsArray()(MemoryPatchBodyDto.prototype, "tags");
ArrayMaxSize(50)(MemoryPatchBodyDto.prototype, "tags");
IsOptional()(MemoryPatchBodyDto.prototype, "importance");
IsIn(MEMORY_IMPORTANCE)(MemoryPatchBodyDto.prototype, "importance");
IsOptional()(MemoryPatchBodyDto.prototype, "forceEdit");

IsUUID()(MemoryIdParamsDto.prototype, "id");

IsOptional()(MemoryDeleteQueryDto.prototype, "confirm");
IsString()(MemoryDeleteQueryDto.prototype, "confirm");

IsString()(MemoryDigestBodyDto.prototype, "projectId");
MinLength(1)(MemoryDigestBodyDto.prototype, "projectId");
IsOptional()(MemoryDigestBodyDto.prototype, "since");
IsString()(MemoryDigestBodyDto.prototype, "since");

IsString()(ContextPreviewQueryDto.prototype, "taskId");
MinLength(1)(ContextPreviewQueryDto.prototype, "taskId");
IsOptional()(ContextPreviewQueryDto.prototype, "budget");
IsOptional()(ContextPreviewQueryDto.prototype, "includeGlobal");

const listMemoriesDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "listMemories",
);
const createMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "createMemory",
);
const searchMemoriesDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "searchMemories",
);
const getMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "getMemory",
);
const patchMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "patchMemory",
);
const deleteMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "deleteMemory",
);
const promoteMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "promoteMemory",
);
const archiveMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "archiveMemory",
);
const restoreMemoryDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "restoreMemory",
);
const digestMemoriesDescriptor = Object.getOwnPropertyDescriptor(
  MemoryPublicApiController.prototype,
  "digestMemories",
);
const previewContextDescriptor = Object.getOwnPropertyDescriptor(
  ContextPreviewPublicApiController.prototype,
  "previewContext",
);

if (
  !listMemoriesDescriptor ||
  !createMemoryDescriptor ||
  !searchMemoriesDescriptor ||
  !getMemoryDescriptor ||
  !patchMemoryDescriptor ||
  !deleteMemoryDescriptor ||
  !promoteMemoryDescriptor ||
  !archiveMemoryDescriptor ||
  !restoreMemoryDescriptor ||
  !digestMemoriesDescriptor ||
  !previewContextDescriptor
) {
  throw new Error("Memory public API route descriptors are missing");
}

Controller("api/v1/memory")(MemoryPublicApiController);
ApiTags("memory")(MemoryPublicApiController);

Get()(MemoryPublicApiController.prototype, "listMemories", listMemoriesDescriptor);
Query()(MemoryPublicApiController.prototype, "listMemories", 0);
Headers("authorization")(MemoryPublicApiController.prototype, "listMemories", 1);
ApiOperation({ summary: "List memories" })(
  MemoryPublicApiController.prototype,
  "listMemories",
  listMemoriesDescriptor,
);
ApiOkResponse({ description: "Memory list" })(
  MemoryPublicApiController.prototype,
  "listMemories",
  listMemoriesDescriptor,
);

Post()(MemoryPublicApiController.prototype, "createMemory", createMemoryDescriptor);
Body()(MemoryPublicApiController.prototype, "createMemory", 0);
Headers("authorization")(MemoryPublicApiController.prototype, "createMemory", 1);
ApiOperation({ summary: "Create a memory" })(
  MemoryPublicApiController.prototype,
  "createMemory",
  createMemoryDescriptor,
);
ApiCreatedResponse({ description: "Created memory" })(
  MemoryPublicApiController.prototype,
  "createMemory",
  createMemoryDescriptor,
);

Get("search")(MemoryPublicApiController.prototype, "searchMemories", searchMemoriesDescriptor);
Query()(MemoryPublicApiController.prototype, "searchMemories", 0);
Headers("authorization")(MemoryPublicApiController.prototype, "searchMemories", 1);
ApiOperation({ summary: "Search memories" })(
  MemoryPublicApiController.prototype,
  "searchMemories",
  searchMemoriesDescriptor,
);
ApiOkResponse({ description: "Memory search results" })(
  MemoryPublicApiController.prototype,
  "searchMemories",
  searchMemoriesDescriptor,
);

Get(":id")(MemoryPublicApiController.prototype, "getMemory", getMemoryDescriptor);
Param()(MemoryPublicApiController.prototype, "getMemory", 0);
Headers("authorization")(MemoryPublicApiController.prototype, "getMemory", 1);
ApiOperation({ summary: "Get a memory" })(
  MemoryPublicApiController.prototype,
  "getMemory",
  getMemoryDescriptor,
);
ApiParam({ name: "id", required: true })(MemoryPublicApiController.prototype, "getMemory", getMemoryDescriptor);
ApiOkResponse({ description: "Memory" })(MemoryPublicApiController.prototype, "getMemory", getMemoryDescriptor);

Patch(":id")(MemoryPublicApiController.prototype, "patchMemory", patchMemoryDescriptor);
Param()(MemoryPublicApiController.prototype, "patchMemory", 0);
Body()(MemoryPublicApiController.prototype, "patchMemory", 1);
Headers("authorization")(MemoryPublicApiController.prototype, "patchMemory", 2);
ApiOperation({ summary: "Update a memory" })(
  MemoryPublicApiController.prototype,
  "patchMemory",
  patchMemoryDescriptor,
);
ApiParam({ name: "id", required: true })(MemoryPublicApiController.prototype, "patchMemory", patchMemoryDescriptor);
ApiOkResponse({ description: "Updated memory" })(
  MemoryPublicApiController.prototype,
  "patchMemory",
  patchMemoryDescriptor,
);

Delete(":id")(MemoryPublicApiController.prototype, "deleteMemory", deleteMemoryDescriptor);
HttpCode(200)(MemoryPublicApiController.prototype, "deleteMemory", deleteMemoryDescriptor);
Param()(MemoryPublicApiController.prototype, "deleteMemory", 0);
Query()(MemoryPublicApiController.prototype, "deleteMemory", 1);
Headers("authorization")(MemoryPublicApiController.prototype, "deleteMemory", 2);
ApiOperation({ summary: "Forget a memory" })(
  MemoryPublicApiController.prototype,
  "deleteMemory",
  deleteMemoryDescriptor,
);
ApiParam({ name: "id", required: true })(MemoryPublicApiController.prototype, "deleteMemory", deleteMemoryDescriptor);
ApiOkResponse({ description: "Deleted memory" })(
  MemoryPublicApiController.prototype,
  "deleteMemory",
  deleteMemoryDescriptor,
);

for (const [methodName, descriptor, path, summary] of [
  ["promoteMemory", promoteMemoryDescriptor, ":id/promote", "Promote a memory"],
  ["archiveMemory", archiveMemoryDescriptor, ":id/archive", "Archive a memory"],
  ["restoreMemory", restoreMemoryDescriptor, ":id/restore", "Restore a memory"],
] as const) {
  Post(path)(MemoryPublicApiController.prototype, methodName, descriptor);
  HttpCode(200)(MemoryPublicApiController.prototype, methodName, descriptor);
  Param()(MemoryPublicApiController.prototype, methodName, 0);
  Headers("authorization")(MemoryPublicApiController.prototype, methodName, 1);
  ApiOperation({ summary })(MemoryPublicApiController.prototype, methodName, descriptor);
  ApiParam({ name: "id", required: true })(MemoryPublicApiController.prototype, methodName, descriptor);
  ApiOkResponse({ description: summary })(MemoryPublicApiController.prototype, methodName, descriptor);
}

Post("digest")(MemoryPublicApiController.prototype, "digestMemories", digestMemoriesDescriptor);
HttpCode(200)(MemoryPublicApiController.prototype, "digestMemories", digestMemoriesDescriptor);
Body()(MemoryPublicApiController.prototype, "digestMemories", 0);
Headers("authorization")(MemoryPublicApiController.prototype, "digestMemories", 1);
ApiOperation({ summary: "Create a memory digest document" })(
  MemoryPublicApiController.prototype,
  "digestMemories",
  digestMemoriesDescriptor,
);
ApiOkResponse({ description: "Memory digest result" })(
  MemoryPublicApiController.prototype,
  "digestMemories",
  digestMemoriesDescriptor,
);

Controller("api/v1/context")(ContextPreviewPublicApiController);
ApiTags("context")(ContextPreviewPublicApiController);

Get("preview")(ContextPreviewPublicApiController.prototype, "previewContext", previewContextDescriptor);
Query()(ContextPreviewPublicApiController.prototype, "previewContext", 0);
Headers("authorization")(ContextPreviewPublicApiController.prototype, "previewContext", 1);
ApiOperation({ summary: "Preview assembled context for a task" })(
  ContextPreviewPublicApiController.prototype,
  "previewContext",
  previewContextDescriptor,
);
ApiOkResponse({ description: "Context preview" })(
  ContextPreviewPublicApiController.prototype,
  "previewContext",
  previewContextDescriptor,
);

Module({
  imports: [
    TypeOrmModule.forFeature([
      ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
      ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
      ...KNOWLEDGE_WORKSPACE_ENTITIES,
    ]),
  ],
  controllers: [MemoryPublicApiController, ContextPreviewPublicApiController],
  providers: [
    { provide: MEMORY_PUBLIC_API_OPTIONS, useValue: null },
    MemoryPublicStore,
    DocumentPublicStore,
    MemoryPublicApiService,
  ],
  exports: [MemoryPublicApiService],
})(MemoryPublicApiModule);

function defaultMemoryDigestClient(): MemoryDigestClient {
  return {
    async summarize(memories) {
      const socketPath = process.env["FULCRUM_SIDECAR_SOCKET"] ?? "/tmp/fulcrum-sidecar.sock";
      const response = await fetch("http://localhost/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "summarize",
          params: { memories },
          id: 1,
        }),
        unix: socketPath,
      } as RequestInit & { unix: string });
      const json = await response.json() as { result?: { summary?: string }; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message ?? "Memory digest summarizer failed.");
      return json.result?.summary ?? "";
    },
  };
}
