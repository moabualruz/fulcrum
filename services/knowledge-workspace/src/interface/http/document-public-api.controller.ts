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
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { DocumentPublicStore } from "@knowledge-workspace/infrastructure/database/document-public-store.ts";
import { KNOWLEDGE_WORKSPACE_ENTITIES } from "@knowledge-workspace/infrastructure/database/document.entities.ts";
import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { DocumentListQueryDto, DocumentTemplateQueryDto, DocumentIdParamsDto, DocumentCommentIdParamsDto, DocumentLinkIdParamsDto, DocumentVersionParamsDto, DocumentVersionIdParamsDto, DocumentVersionDiffQueryDto, DocumentCommentListQueryDto, DocumentCreateBodyDto, DocumentPatchBodyDto, DocumentCommentCreateBodyDto, DocumentCommentPatchBodyDto, DocumentCommentResolveBodyDto, DocumentLinkCreateBodyDto } from "./dto/document.dto.ts";
export { DocumentListQueryDto, DocumentTemplateQueryDto, DocumentIdParamsDto, DocumentCommentIdParamsDto, DocumentLinkIdParamsDto, DocumentVersionParamsDto, DocumentVersionIdParamsDto, DocumentVersionDiffQueryDto, DocumentCommentListQueryDto, DocumentCreateBodyDto, DocumentPatchBodyDto, DocumentCommentCreateBodyDto, DocumentCommentPatchBodyDto, DocumentCommentResolveBodyDto, DocumentLinkCreateBodyDto };

export const DOCUMENT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.documentPublicApi.options");


export interface DocumentPublicApplication {
  list(input?: unknown): Promise<unknown>;
  create(input: unknown): Promise<unknown>;
  get(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  delete(input: unknown): Promise<unknown>;
}

export interface DocumentPublicApiOptions {
  application?: DocumentPublicApplication;
  featuresEnv?: string;
}

export class DocumentPublicApiService {
  constructor(
    private readonly options: DocumentPublicApiOptions | null = null,
    private readonly store: DocumentPublicStore | null = null,
  ) {}

  async listDocuments(query: DocumentListQueryDto): Promise<unknown[]> {
    const docs = await this.requireApplication().list({
      orgId: query.orgId,
      projectId: query.projectId,
      type: query.type,
    });
    return Array.isArray(docs) ? docs.map(normalizeDocument) : [];
  }

  async createDocument(body: DocumentCreateBodyDto): Promise<unknown> {
    const input: Record<string, unknown> = {
      title: body.title,
      docType: body.type,
      bodyMd: body.bodyMd,
    };
    if (body.projectId !== undefined) input["projectId"] = body.projectId;
    const doc = await this.requireApplication().create(input);
    if (!doc) {
      throw new InternalServerErrorException("Document public API create facade returned no document.");
    }
    return normalizeDocument(doc);
  }

  async getDocument(params: DocumentIdParamsDto): Promise<unknown> {
    const doc = await this.requireApplication().get({ id: params.id });
    if (!doc) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return normalizeDocument(doc);
  }

  async patchDocument(params: DocumentIdParamsDto, body: DocumentPatchBodyDto): Promise<unknown> {
    const doc = await this.requireApplication().update({
      id: params.id,
      title: body.title,
      docType: body.type,
      bodyMd: body.bodyMd,
    });
    if (!doc) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return normalizeDocument(doc);
  }

  async deleteDocument(params: DocumentIdParamsDto): Promise<void> {
    const doc = await this.requireApplication().delete({ id: params.id });
    if (!doc) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }

  async listTemplates(query: DocumentTemplateQueryDto): Promise<unknown[]> {
    return await this.requireStore().listTemplates({ projectId: query.projectId });
  }

  async resolveTemplate(query: DocumentTemplateQueryDto): Promise<unknown> {
    return await this.requireStore().resolveTemplate({
      projectId: query.projectId,
      docType: query.docType,
    });
  }

  async listComments(
    params: DocumentIdParamsDto,
    query: DocumentCommentListQueryDto,
  ): Promise<unknown[]> {
    return await this.requireStore().listComments({
      docId: params.id,
      resolved: query.resolved,
    });
  }

  async createComment(
    params: DocumentIdParamsDto,
    body: DocumentCommentCreateBodyDto,
  ): Promise<unknown> {
    const comment = await this.requireStore().createComment({
      docId: params.id,
      authorId: body.authorId,
      bodyMd: body.bodyMd,
      parentCommentId: body.parentCommentId,
      selection: body.selection,
      traceId: body.traceId,
    });
    if (!comment) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return comment;
  }

  async patchComment(
    params: DocumentCommentIdParamsDto,
    body: DocumentCommentPatchBodyDto,
  ): Promise<unknown> {
    const comment = await this.requireStore().updateComment({
      commentId: params.commentId,
      bodyMd: body.bodyMd,
      selection: body.selection,
      status: body.status,
    });
    if (!comment) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return comment;
  }

  async resolveComment(
    params: DocumentCommentIdParamsDto,
    body: DocumentCommentResolveBodyDto,
  ): Promise<unknown> {
    const comment = await this.requireStore().resolveComment({
      commentId: params.commentId,
      resolved: body.resolved,
    });
    if (!comment) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return comment;
  }

  async deleteComment(params: DocumentCommentIdParamsDto): Promise<void> {
    const comment = await this.requireStore().deleteComment({ commentId: params.commentId });
    if (!comment) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }

  async listBacklinks(params: DocumentIdParamsDto): Promise<unknown[]> {
    return await this.requireStore().listBacklinks({ docId: params.id });
  }

  async listForwardLinks(params: DocumentIdParamsDto): Promise<unknown[]> {
    return await this.requireStore().listForwardLinks({ docId: params.id });
  }

  async createLink(body: DocumentLinkCreateBodyDto): Promise<unknown> {
    const link = await this.requireStore().createLink({
      sourceDocId: body.sourceDocId,
      targetDocId: body.targetDocId,
      linkType: body.linkType,
      traceId: body.traceId,
    });
    if (!link) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return link;
  }

  async deleteLink(params: DocumentLinkIdParamsDto): Promise<void> {
    const link = await this.requireStore().deleteLink({ linkId: params.linkId });
    if (!link) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }

  async listVersions(params: DocumentIdParamsDto): Promise<unknown[]> {
    return await this.requireStore().listVersions({ docId: params.id });
  }

  async getVersion(params: DocumentVersionParamsDto): Promise<unknown> {
    const version = await this.requireStore().getVersion({
      docId: params.id,
      version: versionNumber(params.version),
    });
    if (!version) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return version;
  }

  async getVersionById(params: DocumentVersionIdParamsDto): Promise<unknown> {
    const version = await this.requireStore().getVersionById({
      docId: params.id,
      versionId: params.versionId,
    });
    if (!version) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return version;
  }

  async diffVersions(
    params: DocumentIdParamsDto,
    query: DocumentVersionDiffQueryDto,
  ): Promise<unknown> {
    const diff = await this.requireStore().diffVersions({
      docId: params.id,
      fromVersion: versionNumber(query.fromVersion),
      toVersion: versionNumber(query.toVersion),
    });
    if (!diff) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return diff;
  }

  async diffVersionById(params: DocumentVersionIdParamsDto): Promise<unknown> {
    const diff = await this.requireStore().diffVersionById({
      docId: params.id,
      versionId: params.versionId,
    });
    if (!diff) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return diff;
  }

  async restoreVersion(params: DocumentVersionParamsDto): Promise<unknown> {
    const document = await this.requireStore().restoreVersion({
      docId: params.id,
      version: versionNumber(params.version),
    });
    if (!document) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return document;
  }

  async restoreVersionById(params: DocumentVersionIdParamsDto): Promise<unknown> {
    const document = await this.requireStore().restoreVersionById({
      docId: params.id,
      versionId: params.versionId,
    });
    if (!document) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
    return document;
  }

  private requireApplication(): DocumentPublicApplication {
    this.requirePublicApiFeature();
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
    throw new InternalServerErrorException("Document public API application facade is not configured.");
  }

  private requireStore(): DocumentPublicStore {
    this.requirePublicApiFeature();
    if (this.store) return this.store;
    throw new InternalServerErrorException("Document public API store is not configured.");
  }

  private requirePublicApiFeature(): void {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
  }
}

export class DocumentPublicApiController {
  constructor(private readonly documents: DocumentPublicApiService) {}

  async listDocuments(query: DocumentListQueryDto): Promise<unknown[]> {
    return await this.documents.listDocuments(query);
  }

  async createDocument(body: DocumentCreateBodyDto): Promise<unknown> {
    return await this.documents.createDocument(body);
  }

  async listTemplates(query: DocumentTemplateQueryDto): Promise<unknown[]> {
    return await this.documents.listTemplates(query);
  }

  async resolveTemplate(query: DocumentTemplateQueryDto): Promise<unknown> {
    return await this.documents.resolveTemplate(query);
  }

  async getDocument(params: DocumentIdParamsDto): Promise<unknown> {
    return await this.documents.getDocument(params);
  }

  async patchDocument(params: DocumentIdParamsDto, body: DocumentPatchBodyDto): Promise<unknown> {
    return await this.documents.patchDocument(params, body);
  }

  async deleteDocument(params: DocumentIdParamsDto): Promise<void> {
    await this.documents.deleteDocument(params);
  }

  async listComments(
    params: DocumentIdParamsDto,
    query: DocumentCommentListQueryDto,
  ): Promise<unknown[]> {
    return await this.documents.listComments(params, query);
  }

  async createComment(
    params: DocumentIdParamsDto,
    body: DocumentCommentCreateBodyDto,
  ): Promise<unknown> {
    return await this.documents.createComment(params, body);
  }

  async patchComment(
    params: DocumentCommentIdParamsDto,
    body: DocumentCommentPatchBodyDto,
  ): Promise<unknown> {
    return await this.documents.patchComment(params, body);
  }

  async resolveComment(
    params: DocumentCommentIdParamsDto,
    body: DocumentCommentResolveBodyDto,
  ): Promise<unknown> {
    return await this.documents.resolveComment(params, body);
  }

  async deleteComment(params: DocumentCommentIdParamsDto): Promise<void> {
    await this.documents.deleteComment(params);
  }

  async listBacklinks(params: DocumentIdParamsDto): Promise<unknown[]> {
    return await this.documents.listBacklinks(params);
  }

  async listForwardLinks(params: DocumentIdParamsDto): Promise<unknown[]> {
    return await this.documents.listForwardLinks(params);
  }

  async createLink(body: DocumentLinkCreateBodyDto): Promise<unknown> {
    return await this.documents.createLink(body);
  }

  async deleteLink(params: DocumentLinkIdParamsDto): Promise<void> {
    await this.documents.deleteLink(params);
  }

  async listVersions(params: DocumentIdParamsDto): Promise<unknown[]> {
    return await this.documents.listVersions(params);
  }

  async getVersion(params: DocumentVersionParamsDto): Promise<unknown> {
    return await this.documents.getVersion(params);
  }

  async getVersionById(params: DocumentVersionIdParamsDto): Promise<unknown> {
    return await this.documents.getVersionById(params);
  }

  async diffVersions(
    params: DocumentIdParamsDto,
    query: DocumentVersionDiffQueryDto,
  ): Promise<unknown> {
    return await this.documents.diffVersions(params, query);
  }

  async diffVersionById(params: DocumentVersionIdParamsDto): Promise<unknown> {
    return await this.documents.diffVersionById(params);
  }

  async restoreVersion(params: DocumentVersionParamsDto): Promise<unknown> {
    return await this.documents.restoreVersion(params);
  }

  async restoreVersionById(params: DocumentVersionIdParamsDto): Promise<unknown> {
    return await this.documents.restoreVersionById(params);
  }
}

export class DocumentPublicApiModule {
  static register(options: DocumentPublicApiOptions): NestDynamicModule {
    return {
      module: DocumentPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...KNOWLEDGE_WORKSPACE_ENTITIES])],
      controllers: [DocumentPublicApiController],
      providers: [
        { provide: DOCUMENT_PUBLIC_API_OPTIONS, useValue: options },
        DocumentPublicStore,
        DocumentPublicApiService,
      ],
      exports: [DocumentPublicApiService],
    };
  }
}

function normalizeDocument(value: unknown): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
  return {
    ...doc,
    type: doc["type"] ?? doc["docType"],
  };
}

Inject(DOCUMENT_PUBLIC_API_OPTIONS)(DocumentPublicApiService, undefined, 0);
Inject(DocumentPublicStore)(DocumentPublicApiService, undefined, 1);
Inject(DataSource)(DocumentPublicStore, undefined, 0);
Inject(DocumentPublicApiService)(DocumentPublicApiController, undefined, 0);

IsOptional()(DocumentListQueryDto.prototype, "orgId");
IsString()(DocumentListQueryDto.prototype, "orgId");
MinLength(1)(DocumentListQueryDto.prototype, "orgId");
IsOptional()(DocumentListQueryDto.prototype, "projectId");
IsString()(DocumentListQueryDto.prototype, "projectId");
MinLength(1)(DocumentListQueryDto.prototype, "projectId");
IsOptional()(DocumentListQueryDto.prototype, "type");
IsIn(["page", "wiki", "note", "template"])(DocumentListQueryDto.prototype, "type");

IsOptional()(DocumentTemplateQueryDto.prototype, "projectId");
IsString()(DocumentTemplateQueryDto.prototype, "projectId");
MinLength(1)(DocumentTemplateQueryDto.prototype, "projectId");
IsOptional()(DocumentTemplateQueryDto.prototype, "docType");
IsString()(DocumentTemplateQueryDto.prototype, "docType");
MinLength(1)(DocumentTemplateQueryDto.prototype, "docType");

IsUUID()(DocumentIdParamsDto.prototype, "id");
IsUUID()(DocumentCommentIdParamsDto.prototype, "commentId");
IsString()(DocumentVersionParamsDto.prototype, "version");
MinLength(1)(DocumentVersionParamsDto.prototype, "version");
IsString()(DocumentVersionIdParamsDto.prototype, "versionId");
MinLength(1)(DocumentVersionIdParamsDto.prototype, "versionId");
IsString()(DocumentVersionDiffQueryDto.prototype, "fromVersion");
MinLength(1)(DocumentVersionDiffQueryDto.prototype, "fromVersion");
IsString()(DocumentVersionDiffQueryDto.prototype, "toVersion");
MinLength(1)(DocumentVersionDiffQueryDto.prototype, "toVersion");

IsOptional()(DocumentCommentListQueryDto.prototype, "resolved");
IsString()(DocumentCommentListQueryDto.prototype, "resolved");

IsOptional()(DocumentCreateBodyDto.prototype, "projectId");
IsString()(DocumentCreateBodyDto.prototype, "projectId");
MinLength(1)(DocumentCreateBodyDto.prototype, "projectId");
IsString()(DocumentCreateBodyDto.prototype, "title");
MinLength(1)(DocumentCreateBodyDto.prototype, "title");
IsOptional()(DocumentCreateBodyDto.prototype, "type");
IsIn(["page", "wiki", "note", "template"])(DocumentCreateBodyDto.prototype, "type");
IsOptional()(DocumentCreateBodyDto.prototype, "bodyMd");
IsString()(DocumentCreateBodyDto.prototype, "bodyMd");

IsOptional()(DocumentPatchBodyDto.prototype, "title");
IsString()(DocumentPatchBodyDto.prototype, "title");
MinLength(1)(DocumentPatchBodyDto.prototype, "title");
IsOptional()(DocumentPatchBodyDto.prototype, "type");
IsIn(["page", "wiki", "note", "template"])(DocumentPatchBodyDto.prototype, "type");
IsOptional()(DocumentPatchBodyDto.prototype, "bodyMd");
IsString()(DocumentPatchBodyDto.prototype, "bodyMd");

IsString()(DocumentCommentCreateBodyDto.prototype, "authorId");
MinLength(1)(DocumentCommentCreateBodyDto.prototype, "authorId");
IsString()(DocumentCommentCreateBodyDto.prototype, "bodyMd");
MinLength(1)(DocumentCommentCreateBodyDto.prototype, "bodyMd");
for (const property of ["parentCommentId", "traceId"] as const) {
  IsOptional()(DocumentCommentCreateBodyDto.prototype, property);
  IsString()(DocumentCommentCreateBodyDto.prototype, property);
}
IsOptional()(DocumentCommentCreateBodyDto.prototype, "selection");

for (const property of ["bodyMd", "status"] as const) {
  IsOptional()(DocumentCommentPatchBodyDto.prototype, property);
  IsString()(DocumentCommentPatchBodyDto.prototype, property);
}
IsOptional()(DocumentCommentPatchBodyDto.prototype, "selection");
IsOptional()(DocumentCommentResolveBodyDto.prototype, "resolved");

IsString()(DocumentLinkIdParamsDto.prototype, "linkId");
MinLength(1)(DocumentLinkIdParamsDto.prototype, "linkId");
IsString()(DocumentLinkCreateBodyDto.prototype, "sourceDocId");
MinLength(1)(DocumentLinkCreateBodyDto.prototype, "sourceDocId");
IsString()(DocumentLinkCreateBodyDto.prototype, "targetDocId");
MinLength(1)(DocumentLinkCreateBodyDto.prototype, "targetDocId");
for (const property of ["linkType", "traceId"] as const) {
  IsOptional()(DocumentLinkCreateBodyDto.prototype, property);
  IsString()(DocumentLinkCreateBodyDto.prototype, property);
  MinLength(1)(DocumentLinkCreateBodyDto.prototype, property);
}

const listDocumentsDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "listDocuments",
);
const createDocumentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "createDocument",
);
const getDocumentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "getDocument",
);
const listTemplatesDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "listTemplates",
);
const resolveTemplateDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "resolveTemplate",
);
const patchDocumentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "patchDocument",
);
const deleteDocumentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "deleteDocument",
);
const listCommentsDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "listComments",
);
const createCommentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "createComment",
);
const patchCommentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "patchComment",
);
const resolveCommentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "resolveComment",
);
const deleteCommentDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "deleteComment",
);
const listBacklinksDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "listBacklinks",
);
const listForwardLinksDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "listForwardLinks",
);
const createLinkDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "createLink",
);
const deleteLinkDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "deleteLink",
);
const listVersionsDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "listVersions",
);
const getVersionDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "getVersion",
);
const getVersionByIdDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "getVersionById",
);
const diffVersionsDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "diffVersions",
);
const diffVersionByIdDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "diffVersionById",
);
const restoreVersionDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "restoreVersion",
);
const restoreVersionByIdDescriptor = Object.getOwnPropertyDescriptor(
  DocumentPublicApiController.prototype,
  "restoreVersionById",
);

if (
  !listDocumentsDescriptor ||
  !createDocumentDescriptor ||
  !getDocumentDescriptor ||
  !listTemplatesDescriptor ||
  !resolveTemplateDescriptor ||
  !patchDocumentDescriptor ||
  !deleteDocumentDescriptor ||
  !listCommentsDescriptor ||
  !createCommentDescriptor ||
  !patchCommentDescriptor ||
  !resolveCommentDescriptor ||
  !deleteCommentDescriptor ||
  !listBacklinksDescriptor ||
  !listForwardLinksDescriptor ||
  !createLinkDescriptor ||
  !deleteLinkDescriptor ||
  !listVersionsDescriptor ||
  !getVersionDescriptor ||
  !getVersionByIdDescriptor ||
  !diffVersionsDescriptor ||
  !diffVersionByIdDescriptor ||
  !restoreVersionDescriptor ||
  !restoreVersionByIdDescriptor
) {
  throw new Error("DocumentPublicApiController route descriptors are missing");
}

Controller("api/v1/docs")(DocumentPublicApiController);
ApiTags("docs")(DocumentPublicApiController);

Get()(DocumentPublicApiController.prototype, "listDocuments", listDocumentsDescriptor);
Query()(DocumentPublicApiController.prototype, "listDocuments", 0);
ApiOperation({ summary: "List docs" })(
  DocumentPublicApiController.prototype,
  "listDocuments",
  listDocumentsDescriptor,
);
ApiOkResponse({ description: "Doc list" })(
  DocumentPublicApiController.prototype,
  "listDocuments",
  listDocumentsDescriptor,
);

Post()(DocumentPublicApiController.prototype, "createDocument", createDocumentDescriptor);
Body()(DocumentPublicApiController.prototype, "createDocument", 0);
ApiOperation({ summary: "Create a doc" })(
  DocumentPublicApiController.prototype,
  "createDocument",
  createDocumentDescriptor,
);
ApiCreatedResponse({ description: "Created doc" })(
  DocumentPublicApiController.prototype,
  "createDocument",
  createDocumentDescriptor,
);

Get("templates")(DocumentPublicApiController.prototype, "listTemplates", listTemplatesDescriptor);
Query()(DocumentPublicApiController.prototype, "listTemplates", 0);
ApiOperation({ summary: "List doc templates" })(
  DocumentPublicApiController.prototype,
  "listTemplates",
  listTemplatesDescriptor,
);
ApiOkResponse({ description: "Doc templates" })(
  DocumentPublicApiController.prototype,
  "listTemplates",
  listTemplatesDescriptor,
);

Get("templates/resolve")(DocumentPublicApiController.prototype, "resolveTemplate", resolveTemplateDescriptor);
Query()(DocumentPublicApiController.prototype, "resolveTemplate", 0);
ApiOperation({ summary: "Resolve a doc template" })(
  DocumentPublicApiController.prototype,
  "resolveTemplate",
  resolveTemplateDescriptor,
);
ApiOkResponse({ description: "Resolved doc template" })(
  DocumentPublicApiController.prototype,
  "resolveTemplate",
  resolveTemplateDescriptor,
);

Get(":id")(DocumentPublicApiController.prototype, "getDocument", getDocumentDescriptor);
Param()(DocumentPublicApiController.prototype, "getDocument", 0);
ApiOperation({ summary: "Get a doc by ID" })(
  DocumentPublicApiController.prototype,
  "getDocument",
  getDocumentDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "getDocument",
  getDocumentDescriptor,
);
ApiOkResponse({ description: "Doc" })(
  DocumentPublicApiController.prototype,
  "getDocument",
  getDocumentDescriptor,
);

Patch(":id")(DocumentPublicApiController.prototype, "patchDocument", patchDocumentDescriptor);
Param()(DocumentPublicApiController.prototype, "patchDocument", 0);
Body()(DocumentPublicApiController.prototype, "patchDocument", 1);
ApiOperation({ summary: "Update a doc" })(
  DocumentPublicApiController.prototype,
  "patchDocument",
  patchDocumentDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "patchDocument",
  patchDocumentDescriptor,
);
ApiOkResponse({ description: "Updated doc" })(
  DocumentPublicApiController.prototype,
  "patchDocument",
  patchDocumentDescriptor,
);

Delete(":id")(DocumentPublicApiController.prototype, "deleteDocument", deleteDocumentDescriptor);
HttpCode(204)(DocumentPublicApiController.prototype, "deleteDocument", deleteDocumentDescriptor);
Param()(DocumentPublicApiController.prototype, "deleteDocument", 0);
ApiOperation({ summary: "Delete a doc" })(
  DocumentPublicApiController.prototype,
  "deleteDocument",
  deleteDocumentDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "deleteDocument",
  deleteDocumentDescriptor,
);
ApiNoContentResponse({ description: "Deleted" })(
  DocumentPublicApiController.prototype,
  "deleteDocument",
  deleteDocumentDescriptor,
);

Get(":id/comments")(DocumentPublicApiController.prototype, "listComments", listCommentsDescriptor);
Param()(DocumentPublicApiController.prototype, "listComments", 0);
Query()(DocumentPublicApiController.prototype, "listComments", 1);
ApiOperation({ summary: "List doc comments" })(
  DocumentPublicApiController.prototype,
  "listComments",
  listCommentsDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "listComments",
  listCommentsDescriptor,
);
ApiOkResponse({ description: "Doc comments" })(
  DocumentPublicApiController.prototype,
  "listComments",
  listCommentsDescriptor,
);

Post(":id/comments")(DocumentPublicApiController.prototype, "createComment", createCommentDescriptor);
Param()(DocumentPublicApiController.prototype, "createComment", 0);
Body()(DocumentPublicApiController.prototype, "createComment", 1);
ApiOperation({ summary: "Create a doc comment" })(
  DocumentPublicApiController.prototype,
  "createComment",
  createCommentDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "createComment",
  createCommentDescriptor,
);
ApiCreatedResponse({ description: "Created doc comment" })(
  DocumentPublicApiController.prototype,
  "createComment",
  createCommentDescriptor,
);

Patch("comments/:commentId")(DocumentPublicApiController.prototype, "patchComment", patchCommentDescriptor);
Param()(DocumentPublicApiController.prototype, "patchComment", 0);
Body()(DocumentPublicApiController.prototype, "patchComment", 1);
ApiOperation({ summary: "Update a doc comment" })(
  DocumentPublicApiController.prototype,
  "patchComment",
  patchCommentDescriptor,
);
ApiParam({ name: "commentId", required: true })(
  DocumentPublicApiController.prototype,
  "patchComment",
  patchCommentDescriptor,
);
ApiOkResponse({ description: "Updated doc comment" })(
  DocumentPublicApiController.prototype,
  "patchComment",
  patchCommentDescriptor,
);

Patch("comments/:commentId/resolve")(
  DocumentPublicApiController.prototype,
  "resolveComment",
  resolveCommentDescriptor,
);
Param()(DocumentPublicApiController.prototype, "resolveComment", 0);
Body()(DocumentPublicApiController.prototype, "resolveComment", 1);
ApiOperation({ summary: "Resolve or reopen a doc comment" })(
  DocumentPublicApiController.prototype,
  "resolveComment",
  resolveCommentDescriptor,
);
ApiParam({ name: "commentId", required: true })(
  DocumentPublicApiController.prototype,
  "resolveComment",
  resolveCommentDescriptor,
);
ApiOkResponse({ description: "Resolved doc comment" })(
  DocumentPublicApiController.prototype,
  "resolveComment",
  resolveCommentDescriptor,
);

Delete("comments/:commentId")(DocumentPublicApiController.prototype, "deleteComment", deleteCommentDescriptor);
HttpCode(204)(DocumentPublicApiController.prototype, "deleteComment", deleteCommentDescriptor);
Param()(DocumentPublicApiController.prototype, "deleteComment", 0);
ApiOperation({ summary: "Delete a doc comment" })(
  DocumentPublicApiController.prototype,
  "deleteComment",
  deleteCommentDescriptor,
);
ApiParam({ name: "commentId", required: true })(
  DocumentPublicApiController.prototype,
  "deleteComment",
  deleteCommentDescriptor,
);
ApiNoContentResponse({ description: "Deleted doc comment" })(
  DocumentPublicApiController.prototype,
  "deleteComment",
  deleteCommentDescriptor,
);

Get(":id/backlinks")(DocumentPublicApiController.prototype, "listBacklinks", listBacklinksDescriptor);
Param()(DocumentPublicApiController.prototype, "listBacklinks", 0);
ApiOperation({ summary: "List doc backlinks" })(
  DocumentPublicApiController.prototype,
  "listBacklinks",
  listBacklinksDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "listBacklinks",
  listBacklinksDescriptor,
);
ApiOkResponse({ description: "Doc backlinks" })(
  DocumentPublicApiController.prototype,
  "listBacklinks",
  listBacklinksDescriptor,
);

Get(":id/forward-links")(DocumentPublicApiController.prototype, "listForwardLinks", listForwardLinksDescriptor);
Param()(DocumentPublicApiController.prototype, "listForwardLinks", 0);
ApiOperation({ summary: "List doc forward links" })(
  DocumentPublicApiController.prototype,
  "listForwardLinks",
  listForwardLinksDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "listForwardLinks",
  listForwardLinksDescriptor,
);
ApiOkResponse({ description: "Doc forward links" })(
  DocumentPublicApiController.prototype,
  "listForwardLinks",
  listForwardLinksDescriptor,
);

Post("links")(DocumentPublicApiController.prototype, "createLink", createLinkDescriptor);
Body()(DocumentPublicApiController.prototype, "createLink", 0);
ApiOperation({ summary: "Create a doc link" })(
  DocumentPublicApiController.prototype,
  "createLink",
  createLinkDescriptor,
);
ApiCreatedResponse({ description: "Created doc link" })(
  DocumentPublicApiController.prototype,
  "createLink",
  createLinkDescriptor,
);

Delete("links/:linkId")(DocumentPublicApiController.prototype, "deleteLink", deleteLinkDescriptor);
HttpCode(204)(DocumentPublicApiController.prototype, "deleteLink", deleteLinkDescriptor);
Param()(DocumentPublicApiController.prototype, "deleteLink", 0);
ApiOperation({ summary: "Delete a doc link" })(
  DocumentPublicApiController.prototype,
  "deleteLink",
  deleteLinkDescriptor,
);
ApiParam({ name: "linkId", required: true })(
  DocumentPublicApiController.prototype,
  "deleteLink",
  deleteLinkDescriptor,
);
ApiNoContentResponse({ description: "Deleted doc link" })(
  DocumentPublicApiController.prototype,
  "deleteLink",
  deleteLinkDescriptor,
);

Get(":id/versions")(DocumentPublicApiController.prototype, "listVersions", listVersionsDescriptor);
Param()(DocumentPublicApiController.prototype, "listVersions", 0);
ApiOperation({ summary: "List doc versions" })(
  DocumentPublicApiController.prototype,
  "listVersions",
  listVersionsDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "listVersions",
  listVersionsDescriptor,
);
ApiOkResponse({ description: "Doc versions" })(
  DocumentPublicApiController.prototype,
  "listVersions",
  listVersionsDescriptor,
);

Get(":id/versions/diff")(DocumentPublicApiController.prototype, "diffVersions", diffVersionsDescriptor);
Param()(DocumentPublicApiController.prototype, "diffVersions", 0);
Query()(DocumentPublicApiController.prototype, "diffVersions", 1);
ApiOperation({ summary: "Diff doc versions" })(
  DocumentPublicApiController.prototype,
  "diffVersions",
  diffVersionsDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "diffVersions",
  diffVersionsDescriptor,
);
ApiOkResponse({ description: "Doc version diff" })(
  DocumentPublicApiController.prototype,
  "diffVersions",
  diffVersionsDescriptor,
);

Get(":id/versions/:version")(DocumentPublicApiController.prototype, "getVersion", getVersionDescriptor);
Param()(DocumentPublicApiController.prototype, "getVersion", 0);
ApiOperation({ summary: "Get a doc version" })(
  DocumentPublicApiController.prototype,
  "getVersion",
  getVersionDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "getVersion",
  getVersionDescriptor,
);
ApiParam({ name: "version", required: true })(
  DocumentPublicApiController.prototype,
  "getVersion",
  getVersionDescriptor,
);
ApiOkResponse({ description: "Doc version" })(
  DocumentPublicApiController.prototype,
  "getVersion",
  getVersionDescriptor,
);

Get(":id/version-ids/:versionId")(
  DocumentPublicApiController.prototype,
  "getVersionById",
  getVersionByIdDescriptor,
);
Param()(DocumentPublicApiController.prototype, "getVersionById", 0);
ApiOperation({ summary: "Get a doc version by ID" })(
  DocumentPublicApiController.prototype,
  "getVersionById",
  getVersionByIdDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "getVersionById",
  getVersionByIdDescriptor,
);
ApiParam({ name: "versionId", required: true })(
  DocumentPublicApiController.prototype,
  "getVersionById",
  getVersionByIdDescriptor,
);
ApiOkResponse({ description: "Doc version" })(
  DocumentPublicApiController.prototype,
  "getVersionById",
  getVersionByIdDescriptor,
);

Get(":id/version-ids/:versionId/diff")(
  DocumentPublicApiController.prototype,
  "diffVersionById",
  diffVersionByIdDescriptor,
);
Param()(DocumentPublicApiController.prototype, "diffVersionById", 0);
ApiOperation({ summary: "Diff a doc version by ID against its predecessor" })(
  DocumentPublicApiController.prototype,
  "diffVersionById",
  diffVersionByIdDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "diffVersionById",
  diffVersionByIdDescriptor,
);
ApiParam({ name: "versionId", required: true })(
  DocumentPublicApiController.prototype,
  "diffVersionById",
  diffVersionByIdDescriptor,
);
ApiOkResponse({ description: "Doc version diff" })(
  DocumentPublicApiController.prototype,
  "diffVersionById",
  diffVersionByIdDescriptor,
);

Post(":id/versions/:version/restore")(
  DocumentPublicApiController.prototype,
  "restoreVersion",
  restoreVersionDescriptor,
);
Param()(DocumentPublicApiController.prototype, "restoreVersion", 0);
ApiOperation({ summary: "Restore a doc version" })(
  DocumentPublicApiController.prototype,
  "restoreVersion",
  restoreVersionDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "restoreVersion",
  restoreVersionDescriptor,
);
ApiParam({ name: "version", required: true })(
  DocumentPublicApiController.prototype,
  "restoreVersion",
  restoreVersionDescriptor,
);
ApiOkResponse({ description: "Restored doc" })(
  DocumentPublicApiController.prototype,
  "restoreVersion",
  restoreVersionDescriptor,
);

Post(":id/version-ids/:versionId/restore")(
  DocumentPublicApiController.prototype,
  "restoreVersionById",
  restoreVersionByIdDescriptor,
);
Param()(DocumentPublicApiController.prototype, "restoreVersionById", 0);
ApiOperation({ summary: "Restore a doc version by ID" })(
  DocumentPublicApiController.prototype,
  "restoreVersionById",
  restoreVersionByIdDescriptor,
);
ApiParam({ name: "id", required: true })(
  DocumentPublicApiController.prototype,
  "restoreVersionById",
  restoreVersionByIdDescriptor,
);
ApiParam({ name: "versionId", required: true })(
  DocumentPublicApiController.prototype,
  "restoreVersionById",
  restoreVersionByIdDescriptor,
);
ApiOkResponse({ description: "Restored doc" })(
  DocumentPublicApiController.prototype,
  "restoreVersionById",
  restoreVersionByIdDescriptor,
);

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...KNOWLEDGE_WORKSPACE_ENTITIES])],
  controllers: [DocumentPublicApiController],
  providers: [
    { provide: DOCUMENT_PUBLIC_API_OPTIONS, useValue: null },
    DocumentPublicStore,
    DocumentPublicApiService,
  ],
  exports: [DocumentPublicApiService],
})(DocumentPublicApiModule);

function versionNumber(value: string): number {
  const version = Number.parseInt(value, 10);
  if (!Number.isInteger(version) || version <= 0) {
    throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
  }
  return version;
}
