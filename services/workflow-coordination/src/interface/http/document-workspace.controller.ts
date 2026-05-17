import "reflect-metadata";

import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";

import type { FulcrumDocTreePage } from "@knowledge-workspace/domain/document-page-tree.ts";

import {
  DocumentWorkspaceService,
  type DocumentWorkspacePageOperationsInput,
  type DocumentWorkspacePageOperationsOutput,
  type DocumentWorkspacePageTreeOutput,
} from "@workflow-coordination/application/document-workspace.service.ts";

import { DocumentWorkspacePageTreeRequestDto, DocumentWorkspacePageOperationsRequestDto } from "./dto/document-workspace.dto.ts";
export { DocumentWorkspacePageTreeRequestDto, DocumentWorkspacePageOperationsRequestDto };

type DocumentWorkspacePageTreePort = Pick<
  DocumentWorkspaceService,
  "previewPageTree" | "previewPageOperations"
>;

export class DocumentWorkspaceController {
  constructor(private readonly docs: DocumentWorkspacePageTreePort) {}

  async previewPageTree(
    body: DocumentWorkspacePageTreeRequestDto,
  ): Promise<DocumentWorkspacePageTreeOutput> {
    return await this.docs.previewPageTree(body);
  }

  async previewPageOperations(
    body: DocumentWorkspacePageOperationsRequestDto,
  ): Promise<DocumentWorkspacePageOperationsOutput> {
    return await this.docs.previewPageOperations(body);
  }
}

IsArray()(DocumentWorkspacePageTreeRequestDto.prototype, "pages");
IsString()(DocumentWorkspacePageTreeRequestDto.prototype, "breadcrumbPageId");
IsOptional()(DocumentWorkspacePageTreeRequestDto.prototype, "breadcrumbPageId");

IsArray()(DocumentWorkspacePageOperationsRequestDto.prototype, "pages");
IsString()(DocumentWorkspacePageOperationsRequestDto.prototype, "rootPageId");
IsArray()(DocumentWorkspacePageOperationsRequestDto.prototype, "accessibleTreePageIds");

const previewPageTreeDescriptor = Object.getOwnPropertyDescriptor(
  DocumentWorkspaceController.prototype,
  "previewPageTree",
);
const previewPageOperationsDescriptor = Object.getOwnPropertyDescriptor(
  DocumentWorkspaceController.prototype,
  "previewPageOperations",
);

if (!previewPageTreeDescriptor) {
  throw new Error("DocumentWorkspaceController route descriptor is missing");
}
if (!previewPageOperationsDescriptor) {
  throw new Error("DocumentWorkspaceController page operations route descriptor is missing");
}

Inject(DocumentWorkspaceService)(DocumentWorkspaceController, undefined, 0);
Controller("workflows/documents")(DocumentWorkspaceController);
ApiTags("document-workspace")(DocumentWorkspaceController);

Post("page-tree/preview")(DocumentWorkspaceController.prototype, "previewPageTree", previewPageTreeDescriptor);
Body()(DocumentWorkspaceController.prototype, "previewPageTree", 0);
ApiOperation({ summary: "Preview a document page tree" })(
  DocumentWorkspaceController.prototype,
  "previewPageTree",
  previewPageTreeDescriptor,
);
ApiBody({ type: DocumentWorkspacePageTreeRequestDto })(
  DocumentWorkspaceController.prototype,
  "previewPageTree",
  previewPageTreeDescriptor,
);
ApiOkResponse({ description: "Workflow page-tree preview" })(
  DocumentWorkspaceController.prototype,
  "previewPageTree",
  previewPageTreeDescriptor,
);

Post("page-operations/preview")(
  DocumentWorkspaceController.prototype,
  "previewPageOperations",
  previewPageOperationsDescriptor,
);
Body()(DocumentWorkspaceController.prototype, "previewPageOperations", 0);
ApiOperation({ summary: "Preview copied document page-operation filtering" })(
  DocumentWorkspaceController.prototype,
  "previewPageOperations",
  previewPageOperationsDescriptor,
);
ApiBody({ type: DocumentWorkspacePageOperationsRequestDto })(
  DocumentWorkspaceController.prototype,
  "previewPageOperations",
  previewPageOperationsDescriptor,
);
ApiOkResponse({ description: "Workflow page-operation preview" })(
  DocumentWorkspaceController.prototype,
  "previewPageOperations",
  previewPageOperationsDescriptor,
);
