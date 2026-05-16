import { describe, expect, test } from "bun:test";

import {
  applyDocumentSidebarPermissions,
  filterAccessibleRecentDocumentPages,
  filterAccessibleDocumentTreePages,
  type DocumentPagePermissionOperations,
  type DocumentPageWithParent,
} from "@knowledge-workspace/domain/document-page-operations.ts";

class FakePagePermissions implements DocumentPagePermissionOperations {
  hasRestrictions = false;
  accessibleIds = new Set<string>();
  permissions = new Map<string, boolean>();
  parentsWithAccessibleChildren = new Set<string>();
  filterCalls: Array<{ pageIds: string[]; userId: string; spaceId?: string }> = [];

  async hasRestrictedPagesInSpace(): Promise<boolean> {
    return this.hasRestrictions;
  }

  async filterAccessiblePageIds(input: {
    pageIds: string[];
    userId: string;
    spaceId?: string;
  }): Promise<string[]> {
    this.filterCalls.push(input);
    return input.pageIds.filter((id) => this.accessibleIds.has(id));
  }

  async filterAccessiblePageIdsWithPermissions(pageIds: string[]) {
    return pageIds
      .filter((id) => this.accessibleIds.has(id))
      .map((id) => ({ id, canEdit: this.permissions.get(id) ?? false }));
  }

  async getParentIdsWithAccessibleChildren(parentIds: string[]): Promise<string[]> {
    return parentIds.filter((id) => this.parentsWithAccessibleChildren.has(id));
  }
}

const pages: DocumentPageWithParent[] = [
  { id: "root", parentPageId: null },
  { id: "child-a", parentPageId: "root" },
  { id: "child-b", parentPageId: "root" },
  { id: "grandchild", parentPageId: "child-b" },
];

describe("document workspace page operation behavior", () => {
  test("filters accessible trees while preserving parent-chain integrity", () => {
    const filtered = filterAccessibleDocumentTreePages({
      pages,
      rootPageId: "root",
      accessiblePageIds: ["root", "child-a", "grandchild"],
    });

    expect(filtered.map((page) => page.id)).toEqual(["root", "child-a"]);
  });

  test("does not include descendants when the root page is inaccessible", () => {
    const filtered = filterAccessibleDocumentTreePages({
      pages,
      rootPageId: "root",
      accessiblePageIds: ["child-a", "child-b", "grandchild"],
    });

    expect(filtered).toEqual([]);
  });

  test("sidebar pages inherit space edit permission when no restricted pages exist", async () => {
    const permissions = new FakePagePermissions();
    const result = await applyDocumentSidebarPermissions({
      result: {
        items: [
          { id: "root", hasChildren: true },
          { id: "other", hasChildren: false },
        ],
        meta: { limit: 20 },
      },
      spaceId: "space-1",
      userId: "user-1",
      spaceCanEdit: false,
      permissions,
    });

    expect(result.items).toEqual([
      { id: "root", hasChildren: true, canEdit: false },
      { id: "other", hasChildren: false, canEdit: false },
    ]);
  });

  test("sidebar pages apply page restrictions, edit permissions, and accessible child visibility", async () => {
    const permissions = new FakePagePermissions();
    permissions.hasRestrictions = true;
    permissions.accessibleIds = new Set(["root", "child"]);
    permissions.permissions = new Map([
      ["root", true],
      ["child", false],
    ]);
    permissions.parentsWithAccessibleChildren = new Set(["root"]);
    const items: Array<{ id: string; hasChildren: boolean }> = [
      { id: "root", hasChildren: true },
      { id: "child", hasChildren: true },
      { id: "blocked", hasChildren: true },
    ];

    const result = await applyDocumentSidebarPermissions({
      result: {
        items,
        meta: { limit: 20 },
      },
      spaceId: "space-1",
      userId: "user-1",
      spaceCanEdit: true,
      permissions,
    });

    expect(result.items).toEqual([
      { id: "root", hasChildren: true, canEdit: true },
      { id: "child", hasChildren: false, canEdit: false },
    ]);
  });

  test("recent pages are filtered by accessible ids and pass through space id", async () => {
    const permissions = new FakePagePermissions();
    permissions.accessibleIds = new Set(["a", "c"]);

    const result = await filterAccessibleRecentDocumentPages({
      result: {
        items: [{ id: "a" }, { id: "b" }, { id: "c" }],
        meta: { limit: 20 },
      },
      userId: "user-1",
      spaceId: "space-1",
      permissions,
    });

    expect(result.items).toEqual([{ id: "a" }, { id: "c" }]);
    expect(permissions.filterCalls).toEqual([
      { pageIds: ["a", "b", "c"], userId: "user-1", spaceId: "space-1" },
    ]);
  });

  test("recent page filtering skips permission lookup when there are no items", async () => {
    const permissions = new FakePagePermissions();

    const result = await filterAccessibleRecentDocumentPages({
      result: { items: [], meta: { limit: 20 } },
      userId: "user-1",
      permissions,
    });

    expect(result.items).toEqual([]);
    expect(permissions.filterCalls).toEqual([]);
  });
});
