import { describe, expect, test } from "bun:test";

import {
  appendDocumentTreeNodeChildren,
  buildDocumentPageTree,
  deleteDocumentTreeNode,
  findDocumentBreadcrumbPath,
  mergeDocumentRootTrees,
  previewDocumentTreeOperations,
  renameDocumentTreeNode,
  setDocumentTreeNodeIcon,
  sortDocumentPositionKeys,
  type FulcrumDocTreePage,
} from "@knowledge-workspace/domain/document-page-tree.ts";

const docs: FulcrumDocTreePage[] = [
  {
    id: "child-b",
    slugId: "child-b",
    title: "Child B",
    icon: "B",
    position: "20",
    spaceId: "space-1",
    parentPageId: "root-b",
    canEdit: false,
  },
  {
    id: "root-b",
    slugId: "root-b",
    title: "Root B",
    icon: "RB",
    position: "20",
    spaceId: "space-1",
    parentPageId: null,
    canEdit: true,
  },
  {
    id: "root-a",
    slugId: "root-a",
    title: "Root A",
    icon: "RA",
    position: "10",
    spaceId: "space-1",
    parentPageId: null,
    permissions: { canEdit: true },
  },
  {
    id: "grandchild",
    slugId: "grandchild",
    title: "Grandchild",
    position: "10",
    spaceId: "space-1",
    parentPageId: "child-a",
  },
  {
    id: "child-a",
    slugId: "child-a",
    title: "Child A",
    position: "10",
    spaceId: "space-1",
    parentPageId: "root-b",
  },
];

describe("document workspace page tree behavior", () => {
  test("sorts position keys the way document tree nodes are ordered", () => {
    const sorted = sortDocumentPositionKeys([
      { id: "a", position: "10" },
      { id: "b", position: "2" },
      { id: "c", position: "30" },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  test("builds a nested page tree from flat Fulcrum docs and sorts each level", () => {
    const tree = buildDocumentPageTree(docs);

    expect(tree.map((node) => node.id)).toEqual(["root-a", "root-b"]);
    expect(tree[1]?.children.map((node) => node.id)).toEqual(["child-a", "child-b"]);
    expect(tree[1]?.children[0]?.children.map((node) => node.id)).toEqual(["grandchild"]);
    expect(tree[1]?.hasChildren).toBe(true);
    expect(tree[1]?.children[0]?.hasChildren).toBe(true);
    expect(tree[0]?.canEdit).toBe(true);
    expect(tree[1]?.children[0]?.spaceId).toBe("space-1");
  });

  test("finds breadcrumbs and normalizes blank page titles to untitled", () => {
    const tree = buildDocumentPageTree([
      ...docs,
      {
        id: "blank",
        slugId: "blank",
        title: "   ",
        position: "30",
        spaceId: "space-1",
        parentPageId: "grandchild",
      },
    ]);

    const path = findDocumentBreadcrumbPath(tree, "blank");

    expect(path?.map((node) => node.id)).toEqual(["root-b", "child-a", "grandchild", "blank"]);
    expect(path?.at(-1)?.name).toBe("untitled");
    expect(findDocumentBreadcrumbPath(tree, "missing")).toBeNull();
  });

  test("updates names/icons and deletes nodes recursively without mutating siblings", () => {
    const tree = buildDocumentPageTree(docs);

    const renamed = renameDocumentTreeNode(tree, "child-a", "Renamed");
    const withIcon = setDocumentTreeNodeIcon(renamed, "child-a", "spark");
    const pruned = deleteDocumentTreeNode(withIcon, "child-b");

    expect(pruned[1]?.children.map((node) => node.id)).toEqual(["child-a"]);
    expect(pruned[1]?.children[0]?.name).toBe("Renamed");
    expect(pruned[1]?.children[0]?.icon).toBe("spark");
    expect(tree[1]?.children.map((node) => node.id)).toEqual(["child-a", "child-b"]);
  });

  test("appends children while preserving already-loaded deeper children", () => {
    const tree = buildDocumentPageTree(docs);

    const merged = appendDocumentTreeNodeChildren(tree, "root-b", [
      {
        id: "child-a",
        slugId: "child-a",
        name: "Child A renamed upstream",
        position: "10",
        spaceId: "space-1",
        parentPageId: "root-b",
        hasChildren: false,
        children: [],
      },
      {
        id: "child-c",
        slugId: "child-c",
        name: "Child C",
        position: "30",
        spaceId: "space-1",
        parentPageId: "root-b",
        hasChildren: false,
        children: [],
      },
    ]);

    expect(merged[1]?.children.map((node) => node.id)).toEqual(["child-a", "child-c"]);
    expect(merged[1]?.children[0]?.name).toBe("Child A renamed upstream");
    expect(merged[1]?.children[0]?.children.map((node) => node.id)).toEqual(["grandchild"]);
  });

  test("merges root pages without replacing existing roots", () => {
    const tree = buildDocumentPageTree(docs);
    const incoming = buildDocumentPageTree([
      {
        id: "root-a",
        slugId: "root-a-updated",
        title: "Root A updated elsewhere",
        position: "10",
        spaceId: "space-1",
        parentPageId: null,
      },
      {
        id: "root-c",
        slugId: "root-c",
        title: "Root C",
        position: "30",
        spaceId: "space-1",
        parentPageId: null,
      },
    ]);

    const merged = mergeDocumentRootTrees(tree, incoming);

    expect(merged.map((node) => node.id)).toEqual(["root-a", "root-b", "root-c"]);
    expect(merged[0]?.slugId).toBe("root-a");
  });

  test("previews rename, icon, delete, append, merge, and persisted move operations", () => {
    const tree = buildDocumentPageTree(docs);
    const preview = previewDocumentTreeOperations({
      tree,
      rename: { nodeId: "child-a", name: "Renamed child" },
      icon: { nodeId: "child-a", icon: "spark" },
      deleteIds: ["child-b"],
      appendChildren: [{
        nodeId: "child-a",
        children: [{
          id: "child-a-new",
          slugId: "child-a-new",
          name: "New child",
          position: "20",
          spaceId: "space-1",
          parentPageId: "child-a",
          hasChildren: false,
          children: [],
        }],
      }],
      mergeRoots: [{
        id: "root-c",
        slugId: "root-c",
        name: "Root C",
        position: "30",
        spaceId: "space-1",
        parentPageId: null,
        hasChildren: false,
        children: [],
      }],
      move: {
        nodeId: "root-c",
        parentPageId: "root-b",
        previousSiblingPosition: "20",
        nextSiblingPosition: "40",
      },
    });

    expect(preview.applied).toEqual(["rename", "icon", "delete", "append", "merge", "move"]);
    expect(preview.persistedMoves).toEqual([{ id: "root-c", parentPageId: "root-b", position: "30" }]);
    expect(preview.tree.map((node) => node.id)).toEqual(["root-a", "root-b"]);
    expect(preview.tree[1]?.children.map((node) => node.id)).toEqual(["child-a", "root-c"]);
    expect(preview.tree[1]?.children[0]).toMatchObject({
      id: "child-a",
      name: "Renamed child",
      icon: "spark",
    });
    expect(preview.tree[1]?.children[0]?.children.map((node) => node.id)).toEqual(["child-a-new"]);
  });
});
