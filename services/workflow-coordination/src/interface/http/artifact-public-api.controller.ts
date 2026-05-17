import "reflect-metadata";

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { FulcrumArtifactEntity } from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { ArtifactPublicStore } from "@workflow-coordination/infrastructure/database/artifact-public-store.ts";

import { ArtifactListQueryDto, ArtifactParamsDto, ArtifactDeleteQueryDto, ArtifactUploadRequestDto, ArtifactPublicResponseDto, ArtifactDownloadResponseDto, ArtifactDeleteResponseDto } from "./dto/artifact.dto.ts";
export { ArtifactListQueryDto, ArtifactParamsDto, ArtifactDeleteQueryDto, ArtifactUploadRequestDto, ArtifactPublicResponseDto, ArtifactDownloadResponseDto, ArtifactDeleteResponseDto };

export const ARTIFACT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.artifactPublicApi.options");

export interface ArtifactPublicApiOptions {
  featuresEnv?: string;
}

export class ArtifactPublicApiService {
  constructor(
    private readonly options: ArtifactPublicApiOptions | null = null,
    private readonly store: ArtifactPublicStore | null = null,
  ) {}

  async listArtifacts(query: ArtifactListQueryDto): Promise<ArtifactPublicResponseDto[]> {
    return await this.requireStore().listArtifacts(query);
  }

  async getArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    const artifact = await this.requireStore().getArtifact(params.id);
    if (!artifact) throw new NotFoundException({ error: "artifact not found" });
    return artifact;
  }

  async uploadArtifact(input: ArtifactUploadRequestDto): Promise<ArtifactPublicResponseDto> {
    return await this.requireStore().createArtifact(input);
  }

  async acceptArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.transitionArtifact(params.id, "accepted");
  }

  async rejectArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.transitionArtifact(params.id, "rejected");
  }

  async archiveArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    const artifact = await this.requireStore().setArtifactArchived(params.id, true);
    if (!artifact) throw new NotFoundException({ error: "artifact not found" });
    return artifact;
  }

  async unarchiveArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    const artifact = await this.requireStore().setArtifactArchived(params.id, false);
    if (!artifact) throw new NotFoundException({ error: "artifact not found" });
    return artifact;
  }

  async downloadArtifact(params: ArtifactParamsDto): Promise<ArtifactDownloadResponseDto> {
    const download = await this.requireStore().downloadArtifact(params.id);
    if (!download) throw new NotFoundException({ error: "artifact not found" });
    return download;
  }

  async deleteArtifact(params: ArtifactParamsDto, query: ArtifactDeleteQueryDto): Promise<ArtifactDeleteResponseDto> {
    const result = await this.requireStore().deleteArtifact(params.id, query);
    if (!result) throw new NotFoundException({ error: "artifact not found" });
    return result;
  }

  private async transitionArtifact(id: string, lifecycleState: string): Promise<ArtifactPublicResponseDto> {
    const artifact = await this.requireStore().setArtifactLifecycle(id, lifecycleState);
    if (!artifact) throw new NotFoundException({ error: "artifact not found" });
    return artifact;
  }

  private requireStore(): ArtifactPublicStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Artifact public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class ArtifactPublicApiController {
  constructor(private readonly artifacts: ArtifactPublicApiService) {}

  async listArtifacts(query: ArtifactListQueryDto): Promise<ArtifactPublicResponseDto[]> {
    return await this.artifacts.listArtifacts(query);
  }

  async getArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.artifacts.getArtifact(params);
  }

  async uploadArtifact(input: ArtifactUploadRequestDto): Promise<ArtifactPublicResponseDto> {
    return await this.artifacts.uploadArtifact(input);
  }

  async acceptArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.artifacts.acceptArtifact(params);
  }

  async rejectArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.artifacts.rejectArtifact(params);
  }

  async archiveArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.artifacts.archiveArtifact(params);
  }

  async unarchiveArtifact(params: ArtifactParamsDto): Promise<ArtifactPublicResponseDto> {
    return await this.artifacts.unarchiveArtifact(params);
  }

  async downloadArtifact(params: ArtifactParamsDto): Promise<ArtifactDownloadResponseDto> {
    return await this.artifacts.downloadArtifact(params);
  }

  async deleteArtifact(params: ArtifactParamsDto, query: ArtifactDeleteQueryDto): Promise<ArtifactDeleteResponseDto> {
    return await this.artifacts.deleteArtifact(params, query);
  }
}

export class ArtifactPublicApiModule {
  static register(options: ArtifactPublicApiOptions): NestDynamicModule {
    return {
      module: ArtifactPublicApiModule,
      imports: [TypeOrmModule.forFeature([FulcrumArtifactEntity])],
      controllers: [ArtifactPublicApiController],
      providers: [
        { provide: ARTIFACT_PUBLIC_API_OPTIONS, useValue: options },
        ArtifactPublicStore,
        ArtifactPublicApiService,
      ],
      exports: [ArtifactPublicApiService],
    };
  }
}

Inject(ARTIFACT_PUBLIC_API_OPTIONS)(ArtifactPublicApiService, undefined, 0);
Inject(ArtifactPublicStore)(ArtifactPublicApiService, undefined, 1);
Inject(DataSource)(ArtifactPublicStore, undefined, 0);
Inject(ArtifactPublicApiService)(ArtifactPublicApiController, undefined, 0);

for (const property of ["projectId", "traceId", "kind", "runId", "taskId", "docId", "mime", "lifecycleState"] as const) {
  IsOptional()(ArtifactListQueryDto.prototype, property);
  IsString()(ArtifactListQueryDto.prototype, property);
  MinLength(1)(ArtifactListQueryDto.prototype, property);
}
IsString()(ArtifactParamsDto.prototype, "id");
MinLength(1)(ArtifactParamsDto.prototype, "id");

IsOptional()(ArtifactListQueryDto.prototype, "archived");
IsOptional()(ArtifactDeleteQueryDto.prototype, "hard");

IsOptional()(ArtifactListQueryDto.prototype, "limit");
Type(() => Number)(ArtifactListQueryDto.prototype, "limit");
IsInt()(ArtifactListQueryDto.prototype, "limit");
Min(1)(ArtifactListQueryDto.prototype, "limit");
Max(1000)(ArtifactListQueryDto.prototype, "limit");

for (const property of ["projectId", "traceId", "filename"] as const) {
  IsString()(ArtifactUploadRequestDto.prototype, property);
  MinLength(1)(ArtifactUploadRequestDto.prototype, property);
}
for (const property of [
  "id",
  "runId",
  "taskId",
  "docId",
  "kind",
  "title",
  "bodyPath",
  "checksumSha256",
  "mime",
  "sizeBytes",
  "lifecycleState",
] as const) {
  IsOptional()(ArtifactUploadRequestDto.prototype, property);
  IsString()(ArtifactUploadRequestDto.prototype, property);
  MinLength(1)(ArtifactUploadRequestDto.prototype, property);
}
IsOptional()(ArtifactUploadRequestDto.prototype, "metadataJson");
IsObject()(ArtifactUploadRequestDto.prototype, "metadataJson");

for (const property of [
  "id",
  "projectId",
  "traceId",
  "kind",
  "title",
  "sizeBytes",
  "lifecycleState",
  "createdAt",
  "updatedAt",
] as const) {
  IsString()(ArtifactPublicResponseDto.prototype, property);
  MinLength(1)(ArtifactPublicResponseDto.prototype, property);
}
for (const property of ["runId", "taskId", "docId", "filename", "bodyPath", "checksumSha256", "mime", "archivedAt", "deletedAt"] as const) {
  IsOptional()(ArtifactPublicResponseDto.prototype, property);
  IsString()(ArtifactPublicResponseDto.prototype, property);
}
IsBoolean()(ArtifactPublicResponseDto.prototype, "archived");
IsObject()(ArtifactPublicResponseDto.prototype, "metadataJson");

IsBoolean()(ArtifactDeleteResponseDto.prototype, "ok");
IsString()(ArtifactDeleteResponseDto.prototype, "id");
IsBoolean()(ArtifactDeleteResponseDto.prototype, "hard");

const listArtifactsDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "listArtifacts",
);
const getArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "getArtifact",
);
const uploadArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "uploadArtifact",
);
const acceptArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "acceptArtifact",
);
const rejectArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "rejectArtifact",
);
const archiveArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "archiveArtifact",
);
const unarchiveArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "unarchiveArtifact",
);
const downloadArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "downloadArtifact",
);
const deleteArtifactDescriptor = Object.getOwnPropertyDescriptor(
  ArtifactPublicApiController.prototype,
  "deleteArtifact",
);

if (
  !listArtifactsDescriptor ||
  !getArtifactDescriptor ||
  !uploadArtifactDescriptor ||
  !acceptArtifactDescriptor ||
  !rejectArtifactDescriptor ||
  !archiveArtifactDescriptor ||
  !unarchiveArtifactDescriptor ||
  !downloadArtifactDescriptor ||
  !deleteArtifactDescriptor
) {
  throw new Error("ArtifactPublicApiController route descriptor is missing");
}

Controller("api/v1/artifacts")(ArtifactPublicApiController);
ApiTags("artifacts")(ArtifactPublicApiController);

Get()(ArtifactPublicApiController.prototype, "listArtifacts", listArtifactsDescriptor);
Query()(ArtifactPublicApiController.prototype, "listArtifacts", 0);
ApiOperation({ summary: "List workflow artifacts" })(
  ArtifactPublicApiController.prototype,
  "listArtifacts",
  listArtifactsDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto, isArray: true })(
  ArtifactPublicApiController.prototype,
  "listArtifacts",
  listArtifactsDescriptor,
);

Get(":id")(ArtifactPublicApiController.prototype, "getArtifact", getArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "getArtifact", 0);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "getArtifact", getArtifactDescriptor);
ApiOperation({ summary: "Get workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "getArtifact",
  getArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto })(
  ArtifactPublicApiController.prototype,
  "getArtifact",
  getArtifactDescriptor,
);

Post()(ArtifactPublicApiController.prototype, "uploadArtifact", uploadArtifactDescriptor);
Body()(ArtifactPublicApiController.prototype, "uploadArtifact", 0);
ApiOperation({ summary: "Create workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "uploadArtifact",
  uploadArtifactDescriptor,
);
ApiBody({ type: ArtifactUploadRequestDto })(
  ArtifactPublicApiController.prototype,
  "uploadArtifact",
  uploadArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto })(
  ArtifactPublicApiController.prototype,
  "uploadArtifact",
  uploadArtifactDescriptor,
);

Post(":id/accept")(ArtifactPublicApiController.prototype, "acceptArtifact", acceptArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "acceptArtifact", 0);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "acceptArtifact", acceptArtifactDescriptor);
ApiOperation({ summary: "Accept workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "acceptArtifact",
  acceptArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto })(
  ArtifactPublicApiController.prototype,
  "acceptArtifact",
  acceptArtifactDescriptor,
);

Post(":id/reject")(ArtifactPublicApiController.prototype, "rejectArtifact", rejectArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "rejectArtifact", 0);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "rejectArtifact", rejectArtifactDescriptor);
ApiOperation({ summary: "Reject workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "rejectArtifact",
  rejectArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto })(
  ArtifactPublicApiController.prototype,
  "rejectArtifact",
  rejectArtifactDescriptor,
);

Post(":id/archive")(ArtifactPublicApiController.prototype, "archiveArtifact", archiveArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "archiveArtifact", 0);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "archiveArtifact", archiveArtifactDescriptor);
ApiOperation({ summary: "Archive workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "archiveArtifact",
  archiveArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto })(
  ArtifactPublicApiController.prototype,
  "archiveArtifact",
  archiveArtifactDescriptor,
);

Post(":id/unarchive")(ArtifactPublicApiController.prototype, "unarchiveArtifact", unarchiveArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "unarchiveArtifact", 0);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "unarchiveArtifact", unarchiveArtifactDescriptor);
ApiOperation({ summary: "Unarchive workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "unarchiveArtifact",
  unarchiveArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactPublicResponseDto })(
  ArtifactPublicApiController.prototype,
  "unarchiveArtifact",
  unarchiveArtifactDescriptor,
);

Get(":id/download")(ArtifactPublicApiController.prototype, "downloadArtifact", downloadArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "downloadArtifact", 0);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "downloadArtifact", downloadArtifactDescriptor);
ApiOperation({ summary: "Download workflow artifact metadata" })(
  ArtifactPublicApiController.prototype,
  "downloadArtifact",
  downloadArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactDownloadResponseDto })(
  ArtifactPublicApiController.prototype,
  "downloadArtifact",
  downloadArtifactDescriptor,
);

Delete(":id")(ArtifactPublicApiController.prototype, "deleteArtifact", deleteArtifactDescriptor);
Param()(ArtifactPublicApiController.prototype, "deleteArtifact", 0);
Query()(ArtifactPublicApiController.prototype, "deleteArtifact", 1);
ApiParam({ name: "id" })(ArtifactPublicApiController.prototype, "deleteArtifact", deleteArtifactDescriptor);
ApiOperation({ summary: "Delete workflow artifact" })(
  ArtifactPublicApiController.prototype,
  "deleteArtifact",
  deleteArtifactDescriptor,
);
ApiOkResponse({ type: ArtifactDeleteResponseDto })(
  ArtifactPublicApiController.prototype,
  "deleteArtifact",
  deleteArtifactDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([FulcrumArtifactEntity])],
  controllers: [ArtifactPublicApiController],
  providers: [
    { provide: ARTIFACT_PUBLIC_API_OPTIONS, useValue: null },
    ArtifactPublicStore,
    ArtifactPublicApiService,
  ],
  exports: [ArtifactPublicApiService],
})(ArtifactPublicApiModule);
