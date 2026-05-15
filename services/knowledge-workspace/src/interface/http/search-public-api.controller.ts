import "reflect-metadata";

import {
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
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import {
  KNOWLEDGE_WORKSPACE_ENTITIES,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import {
  type SavedSearchRow,
  type SearchClickAck,
  type SearchHit,
  type SearchSnapshot,
  SearchPublicStore,
} from "@knowledge-workspace/infrastructure/database/search-public-store.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const SEARCH_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.searchPublicApi.options");

export interface SearchPublicApplication {
  search(input: {
    q: string;
    orgId: string;
    projectId?: string;
    sourceKinds?: string[];
    limit?: number;
  }): Promise<SearchHit[]>;
  suggest(input: { prefix: string; orgId: string; kind?: string; limit?: number }): Promise<string[]>;
  listSavedSearches(input: { orgId: string; userId: string }): Promise<SavedSearchRow[]>;
  createSavedSearch(input: {
    orgId: string;
    userId: string;
    name: string;
    queryJson: Record<string, unknown>;
    scope: "private" | "project" | "org";
    projectId?: string;
  }): Promise<SavedSearchRow>;
  updateSavedSearch(input: {
    orgId: string;
    userId: string;
    id: string;
    name?: string;
    queryJson?: Record<string, unknown>;
    scope?: "private" | "project" | "org";
    projectId?: string;
  }): Promise<SavedSearchRow | null>;
  deleteSavedSearch(input: { orgId: string; userId: string; id: string }): Promise<{ deleted: true; id: string } | null>;
  recordClick(input: {
    orgId: string;
    userId: string;
    query: string;
    resultId: string;
    resultKind: string;
    position?: number;
    projectId?: string;
  }): Promise<SearchClickAck>;
  snapshot(input: { orgId: string; projectId?: string }): Promise<SearchSnapshot>;
}

export interface SearchPublicApiOptions {
  application?: SearchPublicApplication;
  featuresEnv?: string;
  authenticate?: (authorization: string | undefined) => Promise<string | null>;
}

export class SearchQueryDto {
  q!: string;
  org_id!: string;
  project_id?: string;
  kind?: string;
  limit?: number | string;
}

export class SearchSuggestQueryDto {
  prefix!: string;
  org_id!: string;
  kind?: string;
  limit?: number | string;
}

export class SearchListSavedQueryDto {
  org_id!: string;
  user_id!: string;
}

export class SearchCreateSavedRequestDto {
  org_id!: string;
  user_id!: string;
  name!: string;
  query_json!: Record<string, unknown>;
  scope!: "private" | "project" | "org";
  project_id?: string;
}

export class SearchSavedIdParamsDto {
  id!: string;
}

export class SearchUpdateSavedRequestDto {
  org_id!: string;
  user_id!: string;
  name?: string;
  query_json?: Record<string, unknown>;
  scope?: "private" | "project" | "org";
  project_id?: string;
}

export class SearchDeleteSavedQueryDto {
  org_id!: string;
  user_id!: string;
}

export class SearchClickBodyDto {
  org_id!: string;
  user_id!: string;
  project_id?: string;
  query!: string;
  result_id!: string;
  result_kind!: string;
  position?: number | string;
}

export class SearchSnapshotQueryDto {
  org_id!: string;
  project_id?: string;
}

export class SearchSuggestionsResponseDto {
  suggestions!: string[];
}

export class SearchPublicApiService {
  constructor(
    private readonly options: SearchPublicApiOptions | null = null,
    private readonly store: SearchPublicStore | null = null,
  ) {}

  async search(
    query: SearchQueryDto,
    authorization: string | undefined,
  ): Promise<SearchHit[]> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    const sourceKinds = query.kind ? query.kind.split(",").map((kind) => kind.trim()) : undefined;
    return await application.search({
      q: query.q,
      orgId: query.org_id,
      projectId: query.project_id,
      sourceKinds,
      limit: parseOptionalLimit(query.limit),
    });
  }

  async suggest(
    query: SearchSuggestQueryDto,
    authorization: string | undefined,
  ): Promise<SearchSuggestionsResponseDto> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    return {
      suggestions: await application.suggest({
        prefix: query.prefix,
        orgId: query.org_id,
        kind: query.kind,
        limit: parseOptionalLimit(query.limit),
      }),
    };
  }

  async listSavedSearches(
    query: SearchListSavedQueryDto,
    authorization: string | undefined,
  ): Promise<SavedSearchRow[]> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    return await application.listSavedSearches({
      orgId: query.org_id,
      userId: query.user_id,
    });
  }

  async createSavedSearch(
    body: SearchCreateSavedRequestDto,
    authorization: string | undefined,
  ): Promise<SavedSearchRow> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    return await application.createSavedSearch({
      orgId: body.org_id,
      userId: body.user_id,
      name: body.name,
      queryJson: body.query_json,
      scope: body.scope,
      projectId: body.project_id,
    });
  }

  async updateSavedSearch(
    params: SearchSavedIdParamsDto,
    body: SearchUpdateSavedRequestDto,
    authorization: string | undefined,
  ): Promise<SavedSearchRow> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    const saved = await application.updateSavedSearch({
      orgId: body.org_id,
      userId: body.user_id,
      id: params.id,
      name: body.name,
      queryJson: body.query_json,
      scope: body.scope,
      projectId: body.project_id,
    });
    if (!saved) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return saved;
  }

  async deleteSavedSearch(
    params: SearchSavedIdParamsDto,
    query: SearchDeleteSavedQueryDto,
    authorization: string | undefined,
  ): Promise<void> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    const result = await application.deleteSavedSearch({
      orgId: query.org_id,
      userId: query.user_id,
      id: params.id,
    });
    if (!result) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }

  async recordClick(
    body: SearchClickBodyDto,
    authorization: string | undefined,
  ): Promise<SearchClickAck> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    return await application.recordClick({
      orgId: body.org_id,
      userId: body.user_id,
      query: body.query,
      resultId: body.result_id,
      resultKind: body.result_kind,
      position: parseOptionalLimit(body.position),
      projectId: body.project_id,
    });
  }

  async snapshot(
    query: SearchSnapshotQueryDto,
    authorization: string | undefined,
  ): Promise<SearchSnapshot> {
    const { application } = await this.requireAuthorizedApplication(authorization);
    return await application.snapshot({
      orgId: query.org_id,
      projectId: query.project_id,
    });
  }

  private async requireAuthorizedApplication(
    authorization: string | undefined,
  ): Promise<{ application: SearchPublicApplication; userId: string }> {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    const userId = this.options?.authenticate
      ? await this.options.authenticate(authorization)
      : authorization?.startsWith("Bearer ") ? "public-api" : null;
    if (!userId) {
      throw new UnauthorizedException({ error: "unauthorized" });
    }
    const application = this.options?.application ?? this.storeBackedApplication();
    if (!application) {
      throw new InternalServerErrorException("Search public API store is not configured.");
    }
    return { application, userId };
  }

  private storeBackedApplication(): SearchPublicApplication | null {
    if (!this.store) return null;
    return {
      search: (input) => this.store!.search(input),
      suggest: (input) => this.store!.suggest(input),
      listSavedSearches: (input) => this.store!.listSavedSearches(input),
      createSavedSearch: (input) => this.store!.createSavedSearch(input),
      updateSavedSearch: (input) => this.store!.updateSavedSearch(input),
      deleteSavedSearch: (input) => this.store!.deleteSavedSearch(input),
      recordClick: (input) => this.store!.recordClick(input),
      snapshot: (input) => this.store!.snapshot(input),
    };
  }
}

export class SearchPublicApiController {
  constructor(private readonly searches: SearchPublicApiService) {}

  async search(
    query: SearchQueryDto,
    authorization?: string,
  ): Promise<SearchHit[]> {
    return await this.searches.search(query, authorization);
  }

  async suggest(
    query: SearchSuggestQueryDto,
    authorization?: string,
  ): Promise<SearchSuggestionsResponseDto> {
    return await this.searches.suggest(query, authorization);
  }

  async listSavedSearches(
    query: SearchListSavedQueryDto,
    authorization?: string,
  ): Promise<SavedSearchRow[]> {
    return await this.searches.listSavedSearches(query, authorization);
  }

  async createSavedSearch(
    body: SearchCreateSavedRequestDto,
    authorization?: string,
  ): Promise<SavedSearchRow> {
    return await this.searches.createSavedSearch(body, authorization);
  }

  async updateSavedSearch(
    params: SearchSavedIdParamsDto,
    body: SearchUpdateSavedRequestDto,
    authorization?: string,
  ): Promise<SavedSearchRow> {
    return await this.searches.updateSavedSearch(params, body, authorization);
  }

  async deleteSavedSearch(
    params: SearchSavedIdParamsDto,
    query: SearchDeleteSavedQueryDto,
    authorization?: string,
  ): Promise<void> {
    await this.searches.deleteSavedSearch(params, query, authorization);
  }

  async recordClick(
    body: SearchClickBodyDto,
    authorization?: string,
  ): Promise<SearchClickAck> {
    return await this.searches.recordClick(body, authorization);
  }

  async snapshot(
    query: SearchSnapshotQueryDto,
    authorization?: string,
  ): Promise<SearchSnapshot> {
    return await this.searches.snapshot(query, authorization);
  }
}

export class SearchPublicApiModule {
  static register(options: SearchPublicApiOptions): NestDynamicModule {
    return {
      module: SearchPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...KNOWLEDGE_WORKSPACE_ENTITIES])],
      controllers: [SearchPublicApiController],
      providers: [
        { provide: SEARCH_PUBLIC_API_OPTIONS, useValue: options },
        SearchPublicStore,
        SearchPublicApiService,
      ],
      exports: [SearchPublicApiService],
    };
  }
}

function parseOptionalLimit(limit: number | string | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (typeof limit === "number") return limit;
  const parsed = Number.parseInt(limit, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

Inject(SEARCH_PUBLIC_API_OPTIONS)(SearchPublicApiService, undefined, 0);
Inject(SearchPublicStore)(SearchPublicApiService, undefined, 1);
Inject(DataSource)(SearchPublicStore, undefined, 0);
Inject(SearchPublicApiService)(SearchPublicApiController, undefined, 0);

for (const property of ["q", "org_id"] as const) {
  IsString()(SearchQueryDto.prototype, property);
  MinLength(1)(SearchQueryDto.prototype, property);
}
for (const property of ["project_id", "kind", "limit"] as const) {
  IsOptional()(SearchQueryDto.prototype, property);
}

for (const property of ["prefix", "org_id"] as const) {
  IsString()(SearchSuggestQueryDto.prototype, property);
  MinLength(1)(SearchSuggestQueryDto.prototype, property);
}
for (const property of ["kind", "limit"] as const) {
  IsOptional()(SearchSuggestQueryDto.prototype, property);
}

for (const property of ["org_id", "user_id"] as const) {
  IsString()(SearchListSavedQueryDto.prototype, property);
  MinLength(1)(SearchListSavedQueryDto.prototype, property);
}

for (const property of ["org_id", "user_id", "name"] as const) {
  IsString()(SearchCreateSavedRequestDto.prototype, property);
  MinLength(1)(SearchCreateSavedRequestDto.prototype, property);
}
IsObject()(SearchCreateSavedRequestDto.prototype, "query_json");
IsIn(["private", "project", "org"])(SearchCreateSavedRequestDto.prototype, "scope");
IsOptional()(SearchCreateSavedRequestDto.prototype, "project_id");

IsString()(SearchSavedIdParamsDto.prototype, "id");
MinLength(1)(SearchSavedIdParamsDto.prototype, "id");

for (const property of ["org_id", "user_id"] as const) {
  IsString()(SearchUpdateSavedRequestDto.prototype, property);
  MinLength(1)(SearchUpdateSavedRequestDto.prototype, property);
  IsString()(SearchDeleteSavedQueryDto.prototype, property);
  MinLength(1)(SearchDeleteSavedQueryDto.prototype, property);
}
IsOptional()(SearchUpdateSavedRequestDto.prototype, "name");
IsString()(SearchUpdateSavedRequestDto.prototype, "name");
MinLength(1)(SearchUpdateSavedRequestDto.prototype, "name");
IsOptional()(SearchUpdateSavedRequestDto.prototype, "query_json");
IsObject()(SearchUpdateSavedRequestDto.prototype, "query_json");
IsOptional()(SearchUpdateSavedRequestDto.prototype, "scope");
IsIn(["private", "project", "org"])(SearchUpdateSavedRequestDto.prototype, "scope");
IsOptional()(SearchUpdateSavedRequestDto.prototype, "project_id");

for (const property of ["org_id", "user_id", "query", "result_id", "result_kind"] as const) {
  IsString()(SearchClickBodyDto.prototype, property);
  MinLength(1)(SearchClickBodyDto.prototype, property);
}
for (const property of ["project_id", "position"] as const) {
  IsOptional()(SearchClickBodyDto.prototype, property);
}

IsString()(SearchSnapshotQueryDto.prototype, "org_id");
MinLength(1)(SearchSnapshotQueryDto.prototype, "org_id");
IsOptional()(SearchSnapshotQueryDto.prototype, "project_id");

const searchDescriptor = Object.getOwnPropertyDescriptor(SearchPublicApiController.prototype, "search");
const suggestDescriptor = Object.getOwnPropertyDescriptor(SearchPublicApiController.prototype, "suggest");
const listSavedSearchesDescriptor = Object.getOwnPropertyDescriptor(
  SearchPublicApiController.prototype,
  "listSavedSearches",
);
const createSavedSearchDescriptor = Object.getOwnPropertyDescriptor(
  SearchPublicApiController.prototype,
  "createSavedSearch",
);
const updateSavedSearchDescriptor = Object.getOwnPropertyDescriptor(
  SearchPublicApiController.prototype,
  "updateSavedSearch",
);
const deleteSavedSearchDescriptor = Object.getOwnPropertyDescriptor(
  SearchPublicApiController.prototype,
  "deleteSavedSearch",
);
const recordClickDescriptor = Object.getOwnPropertyDescriptor(
  SearchPublicApiController.prototype,
  "recordClick",
);
const snapshotDescriptor = Object.getOwnPropertyDescriptor(
  SearchPublicApiController.prototype,
  "snapshot",
);

if (
  !searchDescriptor ||
  !suggestDescriptor ||
  !listSavedSearchesDescriptor ||
  !createSavedSearchDescriptor ||
  !updateSavedSearchDescriptor ||
  !deleteSavedSearchDescriptor ||
  !recordClickDescriptor ||
  !snapshotDescriptor
) {
  throw new Error("SearchPublicApiController route descriptors are missing");
}

Controller("api/v1/search")(SearchPublicApiController);
ApiTags("search")(SearchPublicApiController);

Get()(SearchPublicApiController.prototype, "search", searchDescriptor);
Query()(SearchPublicApiController.prototype, "search", 0);
Headers("authorization")(SearchPublicApiController.prototype, "search", 1);
ApiOperation({ summary: "Search indexed documents" })(
  SearchPublicApiController.prototype,
  "search",
  searchDescriptor,
);
ApiOkResponse({ description: "Search results" })(
  SearchPublicApiController.prototype,
  "search",
  searchDescriptor,
);

Get("suggest")(SearchPublicApiController.prototype, "suggest", suggestDescriptor);
Query()(SearchPublicApiController.prototype, "suggest", 0);
Headers("authorization")(SearchPublicApiController.prototype, "suggest", 1);
ApiOperation({ summary: "Suggest matching document titles" })(
  SearchPublicApiController.prototype,
  "suggest",
  suggestDescriptor,
);
ApiOkResponse({ type: SearchSuggestionsResponseDto })(
  SearchPublicApiController.prototype,
  "suggest",
  suggestDescriptor,
);

Get("saved")(SearchPublicApiController.prototype, "listSavedSearches", listSavedSearchesDescriptor);
Query()(SearchPublicApiController.prototype, "listSavedSearches", 0);
Headers("authorization")(SearchPublicApiController.prototype, "listSavedSearches", 1);
ApiOperation({ summary: "List saved searches" })(
  SearchPublicApiController.prototype,
  "listSavedSearches",
  listSavedSearchesDescriptor,
);
ApiOkResponse({ description: "Saved searches" })(
  SearchPublicApiController.prototype,
  "listSavedSearches",
  listSavedSearchesDescriptor,
);

Post("saved")(SearchPublicApiController.prototype, "createSavedSearch", createSavedSearchDescriptor);
Body()(SearchPublicApiController.prototype, "createSavedSearch", 0);
Headers("authorization")(SearchPublicApiController.prototype, "createSavedSearch", 1);
ApiOperation({ summary: "Create a saved search" })(
  SearchPublicApiController.prototype,
  "createSavedSearch",
  createSavedSearchDescriptor,
);
ApiBody({ type: SearchCreateSavedRequestDto })(
  SearchPublicApiController.prototype,
  "createSavedSearch",
  createSavedSearchDescriptor,
);
ApiOkResponse({ description: "Created saved search" })(
  SearchPublicApiController.prototype,
  "createSavedSearch",
  createSavedSearchDescriptor,
);

Patch("saved/:id")(SearchPublicApiController.prototype, "updateSavedSearch", updateSavedSearchDescriptor);
Param()(SearchPublicApiController.prototype, "updateSavedSearch", 0);
Body()(SearchPublicApiController.prototype, "updateSavedSearch", 1);
Headers("authorization")(SearchPublicApiController.prototype, "updateSavedSearch", 2);
ApiOperation({ summary: "Update a saved search" })(
  SearchPublicApiController.prototype,
  "updateSavedSearch",
  updateSavedSearchDescriptor,
);
ApiParam({ name: "id" })(
  SearchPublicApiController.prototype,
  "updateSavedSearch",
  updateSavedSearchDescriptor,
);
ApiBody({ type: SearchUpdateSavedRequestDto })(
  SearchPublicApiController.prototype,
  "updateSavedSearch",
  updateSavedSearchDescriptor,
);
ApiOkResponse({ description: "Updated saved search" })(
  SearchPublicApiController.prototype,
  "updateSavedSearch",
  updateSavedSearchDescriptor,
);

Delete("saved/:id")(SearchPublicApiController.prototype, "deleteSavedSearch", deleteSavedSearchDescriptor);
HttpCode(204)(SearchPublicApiController.prototype, "deleteSavedSearch", deleteSavedSearchDescriptor);
Param()(SearchPublicApiController.prototype, "deleteSavedSearch", 0);
Query()(SearchPublicApiController.prototype, "deleteSavedSearch", 1);
Headers("authorization")(SearchPublicApiController.prototype, "deleteSavedSearch", 2);
ApiOperation({ summary: "Delete a saved search" })(
  SearchPublicApiController.prototype,
  "deleteSavedSearch",
  deleteSavedSearchDescriptor,
);
ApiParam({ name: "id" })(
  SearchPublicApiController.prototype,
  "deleteSavedSearch",
  deleteSavedSearchDescriptor,
);
ApiNoContentResponse({ description: "Deleted saved search" })(
  SearchPublicApiController.prototype,
  "deleteSavedSearch",
  deleteSavedSearchDescriptor,
);

Post("click")(SearchPublicApiController.prototype, "recordClick", recordClickDescriptor);
Body()(SearchPublicApiController.prototype, "recordClick", 0);
Headers("authorization")(SearchPublicApiController.prototype, "recordClick", 1);
ApiOperation({ summary: "Record a search result click" })(
  SearchPublicApiController.prototype,
  "recordClick",
  recordClickDescriptor,
);
ApiBody({ type: SearchClickBodyDto })(
  SearchPublicApiController.prototype,
  "recordClick",
  recordClickDescriptor,
);
ApiOkResponse({ description: "Recorded search click" })(
  SearchPublicApiController.prototype,
  "recordClick",
  recordClickDescriptor,
);

Get("snapshot")(SearchPublicApiController.prototype, "snapshot", snapshotDescriptor);
Query()(SearchPublicApiController.prototype, "snapshot", 0);
Headers("authorization")(SearchPublicApiController.prototype, "snapshot", 1);
ApiOperation({ summary: "Build a search snapshot" })(
  SearchPublicApiController.prototype,
  "snapshot",
  snapshotDescriptor,
);
ApiOkResponse({ description: "Search snapshot" })(
  SearchPublicApiController.prototype,
  "snapshot",
  snapshotDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...KNOWLEDGE_WORKSPACE_ENTITIES])],
  controllers: [SearchPublicApiController],
  providers: [
    { provide: SEARCH_PUBLIC_API_OPTIONS, useValue: null },
    SearchPublicStore,
    SearchPublicApiService,
  ],
  exports: [SearchPublicApiService],
})(SearchPublicApiModule);
