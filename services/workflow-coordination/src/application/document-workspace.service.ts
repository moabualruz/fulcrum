import "reflect-metadata";

import { Injectable } from "@nestjs/common";

import {
  buildDocumentPageTree,
  findDocumentBreadcrumbPath,
  previewDocumentTreeOperations,
  type DocumentTreeNode,
  type DocumentTreeOperationsPreviewInput,
  type DocumentTreeOperationsPreviewOutput,
  type FulcrumDocTreePage,
} from "@knowledge-workspace/domain/document-page-tree.ts";
import {
  applyDocumentSidebarPermissions,
  filterAccessibleRecentDocumentPages,
  filterAccessibleDocumentTreePages,
  type DocumentCursorResult,
  type DocumentPagePermissionOperations,
  type DocumentPageWithParent,
} from "@knowledge-workspace/domain/document-page-operations.ts";

export interface DocumentWorkspacePageTreeInput {
  pages: FulcrumDocTreePage[];
  breadcrumbPageId?: string | null;
}

export interface DocumentWorkspacePageTreeOutput {
  tree: DocumentTreeNode[];
  breadcrumb: DocumentTreeNode[];
}

export interface DocumentWorkspacePageOperationPermissionsInput {
  hasRestrictions?: boolean;
  accessiblePageIds: string[];
  editablePageIds?: string[];
  parentIdsWithAccessibleChildren?: string[];
}

export interface DocumentWorkspaceSidebarOperationItem {
  id: string;
  hasChildren: boolean;
}

export interface DocumentWorkspaceRecentOperationItem {
  id: string;
}

export interface DocumentWorkspacePageOperationsInput {
  pages: DocumentPageWithParent[];
  rootPageId: string;
  accessibleTreePageIds: string[];
  operations?: Omit<DocumentTreeOperationsPreviewInput, "tree">;
  sidebar: {
    result: DocumentCursorResult<DocumentWorkspaceSidebarOperationItem>;
    spaceId: string;
    userId: string;
    spaceCanEdit?: boolean;
    permissions: DocumentWorkspacePageOperationPermissionsInput;
  };
  recent: {
    result: DocumentCursorResult<DocumentWorkspaceRecentOperationItem>;
    userId: string;
    spaceId?: string;
    accessiblePageIds: string[];
  };
}

export interface DocumentWorkspacePageOperationsOutput {
  accessibleTree: DocumentPageWithParent[];
  operationsPreview: DocumentTreeOperationsPreviewOutput;
  sidebar: DocumentCursorResult<DocumentWorkspaceSidebarOperationItem & { canEdit?: boolean }>;
  recent: DocumentCursorResult<DocumentWorkspaceRecentOperationItem>;
}

export class DocumentWorkspaceService {
  async previewPageTree(input: DocumentWorkspacePageTreeInput): Promise<DocumentWorkspacePageTreeOutput> {
    const tree = buildDocumentPageTree(input.pages);
    const breadcrumb = input.breadcrumbPageId
      ? findDocumentBreadcrumbPath(tree, input.breadcrumbPageId) ?? []
      : [];

    return { tree, breadcrumb };
  }

  async previewPageOperations(
    input: DocumentWorkspacePageOperationsInput,): Promise<DocumentWorkspacePageOperationsOutput> {
    const accessibleTree = filterAccessibleDocumentTreePages({
      pages: input.pages,
      rootPageId: input.rootPageId,
      accessiblePageIds: input.accessibleTreePageIds,
    });
    const operationsPreview = previewDocumentTreeOperations({
      tree: buildDocumentPageTree(input.pages.map((page) => toPreviewTreePage(page, input.sidebar.spaceId))),
      ...input.operations,
    });

    const sidebar = await applyDocumentSidebarPermissions({
      result: input.sidebar.result,
      spaceId: input.sidebar.spaceId,
      userId: input.sidebar.userId,
      spaceCanEdit: input.sidebar.spaceCanEdit,
      permissions: pageOperationPermissions(input.sidebar.permissions),
    });

    const recent = await filterAccessibleRecentDocumentPages({
      result: input.recent.result,
      userId: input.recent.userId,
      spaceId: input.recent.spaceId,
      permissions: {
        async filterAccessiblePageIds({ pageIds }) {
          const accessibleSet = new Set(input.recent.accessiblePageIds);
          return pageIds.filter((id) => accessibleSet.has(id));
        },
      },
    });

    return { accessibleTree, operationsPreview, sidebar, recent };
  }
}

function toPreviewTreePage(
  page: DocumentPageWithParent,
  fallbackSpaceId: string,
): FulcrumDocTreePage {
  const record = page as DocumentPageWithParent & Record<string, unknown>;
  const position = typeof record["position"] === "string" || typeof record["position"] === "number"
    ? record["position"]
    : "0";
  return {
    id: page.id,
    parentPageId: page.parentPageId,
    title: typeof record["title"] === "string" ? record["title"] : page.id,
    position,
    spaceId: typeof record["projectId"] === "string" ? record["projectId"] : fallbackSpaceId,
  };
}

function pageOperationPermissions(
  input: DocumentWorkspacePageOperationPermissionsInput,): DocumentPagePermissionOperations {
  const accessibleSet = new Set(input.accessiblePageIds);
  const editableSet = new Set(input.editablePageIds ?? []);
  const parentWithAccessibleChildrenSet = new Set(input.parentIdsWithAccessibleChildren ?? []);

  return {
    async hasRestrictedPagesInSpace() {
      return input.hasRestrictions ?? accessibleSet.size > 0;
    },
    async filterAccessiblePageIds({ pageIds }) {
      return pageIds.filter((id) => accessibleSet.has(id));
    },
    async filterAccessiblePageIdsWithPermissions(pageIds) {
      return pageIds.filter((id) => accessibleSet.has(id)).map((id) => ({ id, canEdit: editableSet.has(id) }));
    },
    async getParentIdsWithAccessibleChildren(parentIds) {
      return parentIds.filter((id) => parentWithAccessibleChildrenSet.has(id));
    },
  };
}

Injectable()(DocumentWorkspaceService);
