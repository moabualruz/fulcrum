import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  DocumentWorkspaceController,
  DocumentWorkspacePageOperationsRequestDto,
  DocumentWorkspacePageTreeRequestDto,
} from "@workflow-coordination/interface/http/document-workspace.controller.ts";
import {
  DocumentWorkspaceService,
  type DocumentWorkspacePageOperationsOutput,
  type DocumentWorkspacePageTreeOutput,
} from "@workflow-coordination/application/document-workspace.service.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

function validPageTreeInput(): DocumentWorkspacePageTreeRequestDto {
  return Object.assign(new DocumentWorkspacePageTreeRequestDto(), {
    pages: [
      {
        id: "child",
        title: "Child",
        position: "10",
        spaceId: "space-docs",
        parentPageId: "root",
      },
      {
        id: "root",
        title: "Root",
        position: "10",
        spaceId: "space-docs",
        parentPageId: null,
        permissions: { canEdit: true },
      },
    ],
    breadcrumbPageId: "child",
  });
}

function validPageOperationsInput(): DocumentWorkspacePageOperationsRequestDto {
  return Object.assign(new DocumentWorkspacePageOperationsRequestDto(), {
    pages: [
      { id: "root", parentPageId: null, title: "Root", position: "10", projectId: "space-docs" },
      { id: "visible", parentPageId: "root", title: "Visible", position: "10", projectId: "space-docs" },
      { id: "blocked", parentPageId: "root", title: "Blocked", position: "20", projectId: "space-docs" },
      { id: "blocked-child", parentPageId: "blocked", title: "Blocked child", position: "10", projectId: "space-docs" },
    ],
    rootPageId: "root",
    accessibleTreePageIds: ["root", "visible", "blocked-child"],
    operations: {
      rename: { nodeId: "visible", name: "Visible renamed" },
      icon: { nodeId: "visible", icon: "spark" },
      deleteIds: ["blocked"],
      appendChildren: [{
        nodeId: "visible",
        children: [{
          id: "visible-child",
          slugId: "visible-child",
          name: "Visible child",
          position: "20",
          spaceId: "space-docs",
          parentPageId: "visible",
          hasChildren: false,
          children: [],
        }],
      }],
      mergeRoots: [{
        id: "incoming-root",
        slugId: "incoming-root",
        name: "Incoming root",
        position: "30",
        spaceId: "space-docs",
        parentPageId: null,
        hasChildren: false,
        children: [],
      }],
      move: {
        nodeId: "incoming-root",
        parentPageId: "root",
        previousSiblingPosition: "20",
        nextSiblingPosition: "40",
      },
    },
    sidebar: {
      result: {
        items: [
          { id: "root", hasChildren: true },
          { id: "visible", hasChildren: false },
          { id: "blocked", hasChildren: true },
        ],
        meta: { limit: 20 },
      },
      spaceId: "space-docs",
      userId: "user-docs",
      spaceCanEdit: true,
      permissions: {
        hasRestrictions: true,
        accessiblePageIds: ["root", "visible"],
        editablePageIds: ["root"],
        parentIdsWithAccessibleChildren: ["root"],
      },
    },
    recent: {
      result: {
        items: [{ id: "root" }, { id: "blocked" }, { id: "visible" }],
        meta: { limit: 20 },
      },
      userId: "user-docs",
      spaceId: "space-docs",
      accessiblePageIds: ["root", "visible"],
    },
  });
}

describe("Workflow docs Nest controller", () => {
  test("is wired as a Nest API controller on the workflows module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowCycleModule) as unknown[];

    expect(controllers).toContain(DocumentWorkspaceController);
    expect(Reflect.getMetadata(PATH_METADATA, DocumentWorkspaceController)).toBe("workflows/documents");
    expect(Reflect.getMetadata(PATH_METADATA, DocumentWorkspaceController.prototype.previewPageTree)).toBe(
      "page-tree/preview",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentWorkspaceController.prototype.previewPageTree)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, DocumentWorkspaceController.prototype.previewPageOperations)).toBe(
      "page-operations/preview",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, DocumentWorkspaceController.prototype.previewPageOperations)).toBe(
      RequestMethod.POST,
    );
  });

  test("delegates page-tree preview to the server-owned docs service", async () => {
    const input = validPageTreeInput();
    const preview: DocumentWorkspacePageTreeOutput = {
      tree: [],
      breadcrumb: [],
    };
    const service = {
      seen: undefined as DocumentWorkspacePageTreeRequestDto | undefined,
      async previewPageTree(body: DocumentWorkspacePageTreeRequestDto) {
        this.seen = body;
        return preview;
      },
      async previewPageOperations() {
        return {
          accessibleTree: [],
          operationsPreview: { tree: [], persistedMoves: [], applied: [] },
          sidebar: { items: [], meta: { limit: 20 } },
          recent: { items: [], meta: { limit: 20 } },
        };
      },
    };
    const controller = new DocumentWorkspaceController(service);

    await expect(controller.previewPageTree(input)).resolves.toBe(preview);
    expect(service.seen).toBe(input);
  });

  test("delegates page-operations preview to the server-owned docs service", async () => {
    const input = validPageOperationsInput();
    const preview: DocumentWorkspacePageOperationsOutput = {
      accessibleTree: [],
      operationsPreview: { tree: [], persistedMoves: [], applied: [] },
      sidebar: { items: [], meta: { limit: 20 } },
      recent: { items: [], meta: { limit: 20 } },
    };
    const service = {
      seen: undefined as DocumentWorkspacePageOperationsRequestDto | undefined,
      async previewPageTree() {
        return { tree: [], breadcrumb: [] };
      },
      async previewPageOperations(body: DocumentWorkspacePageOperationsRequestDto) {
        this.seen = body;
        return preview;
      },
    };
    const controller = new DocumentWorkspaceController(service);

    await expect(controller.previewPageOperations(input)).resolves.toBe(preview);
    expect(service.seen).toBe(input);
  });

  test("keeps page-tree request validation at the Nest boundary", () => {
    const valid = validPageTreeInput();
    const invalid = Object.assign(new DocumentWorkspacePageTreeRequestDto(), {
      pages: undefined,
    });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property)).toEqual(["pages"]);
  });

  test("keeps page-operations request validation at the Nest boundary", () => {
    const valid = validPageOperationsInput();
    const invalid = Object.assign(new DocumentWorkspacePageOperationsRequestDto(), {
      pages: undefined,
      rootPageId: undefined,
      accessibleTreePageIds: undefined,
    });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property)).toEqual([
      "pages",
      "rootPageId",
      "accessibleTreePageIds",
    ]);
  });

  test("service builds the copied document page tree and breadcrumb model", async () => {
    const service = new DocumentWorkspaceService();

    const result = await service.previewPageTree(validPageTreeInput());

    expect(result.tree.map((node) => node.id)).toEqual(["root"]);
    expect(result.tree[0]?.canEdit).toBe(true);
    expect(result.tree[0]?.children.map((node) => node.id)).toEqual(["child"]);
    expect(result.breadcrumb.map((node) => node.id)).toEqual(["root", "child"]);
  });

  test("service previews copied document page-operation filtering", async () => {
    const service = new DocumentWorkspaceService();

    const result = await service.previewPageOperations(validPageOperationsInput());

    expect(result.accessibleTree.map((page) => page.id)).toEqual(["root", "visible"]);
    expect(result.operationsPreview.applied).toEqual(["rename", "icon", "delete", "append", "merge", "move"]);
    expect(result.operationsPreview.persistedMoves).toEqual([{
      id: "incoming-root",
      parentPageId: "root",
      position: "30",
    }]);
    expect(result.operationsPreview.tree[0]?.children.map((node) => node.id)).toEqual([
      "visible",
      "incoming-root",
    ]);
    expect(result.operationsPreview.tree[0]?.children[0]).toMatchObject({
      id: "visible",
      name: "Visible renamed",
      icon: "spark",
    });
    expect(result.sidebar.items).toEqual([
      { id: "root", hasChildren: true, canEdit: true },
      { id: "visible", hasChildren: false, canEdit: false },
    ]);
    expect(result.recent.items).toEqual([{ id: "root" }, { id: "visible" }]);
  });
});
