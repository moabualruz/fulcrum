import { describe, expect, test } from "bun:test";

import {
  buildDocTree,
  buildMoveInput,
  docTypeMeta,
  flattenDocTree,
  nextScopeUrl,
} from "./doc-tree";
import type { DocTreeNode } from "./doc-tree";

const rows: DocTreeNode[] = [
  {
    id: "root",
    title: "Root wiki",
    slug: "root-wiki",
    parentId: null,
    projectId: "project-1",
    scope: "project",
    docType: "wiki",
    sortPosition: 10,
    children: [],
  },
  {
    id: "child",
    title: "Child spec",
    slug: "child-spec",
    parentId: "root",
    projectId: "project-1",
    scope: "project",
    docType: "spec",
    sortPosition: 20,
    children: [],
  },
  {
    id: "later",
    title: "Later ADR",
    slug: "later-adr",
    parentId: null,
    projectId: "project-1",
    scope: "project",
    docType: "adr",
    sortPosition: 30,
    children: [],
  },
];

describe("doc tree helpers", () => {
  test("buildDocTree nests children under parents and preserves sibling sort order", () => {
    const tree = buildDocTree([rows[1]!, rows[2]!, rows[0]!]);

    expect(tree.map((node) => node.id)).toEqual(["root", "later"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["child"]);
  });

  test("flattenDocTree emits depth for accessible tree rendering", () => {
    expect(flattenDocTree(buildDocTree(rows)).map((item) => [item.node.id, item.depth])).toEqual([
      ["root", 1],
      ["child", 2],
      ["later", 1],
    ]);
  });

  test("docTypeMeta exposes icon labels and color badge classes", () => {
    expect(docTypeMeta("spec")).toMatchObject({ icon: "FileText", label: "Spec" });
    expect(docTypeMeta("spec").badgeClass).toContain("purple");
    expect(docTypeMeta("adr").badgeClass).toContain("red");
    expect(docTypeMeta("wiki").badgeClass).toContain("blue");
  });

  test("buildMoveInput reparent move calls docs.move with midpoint sort position", () => {
    const move = buildMoveInput({
      docId: "child",
      parentId: "later",
      previousSibling: { id: "a", sortPosition: 40 },
      nextSibling: { id: "b", sortPosition: 50 },
    });

    expect(move).toEqual({
      id: "child",
      parentId: "later",
      sortPosition: 45,
    });
  });

  test("nextScopeUrl persists g-key scope toggle in query params", () => {
    expect(nextScopeUrl(new URL("http://localhost/docs?scope=project"), "global")).toBe(
      "/docs?scope=global",
    );
  });
});
