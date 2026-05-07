import { describe, expect, test } from "bun:test";
import { buildDocTree, type DocTreeNode, type FlatDoc } from "./doc-tree";

const docs: FlatDoc[] = [
  { id: "root-1", title: "Root 1", kind: "spec", parent_id: null, sort_order: 0, updated_at: "2026-01-01" },
  { id: "child-1a", title: "Child 1a", kind: "note", parent_id: "root-1", sort_order: 0, updated_at: "2026-01-02" },
  { id: "child-1b", title: "Child 1b", kind: "note", parent_id: "root-1", sort_order: 1, updated_at: "2026-01-03" },
  { id: "root-2", title: "Root 2", kind: "decision", parent_id: null, sort_order: 1, updated_at: "2026-01-04" },
  { id: "grandchild", title: "Grandchild", kind: "note", parent_id: "child-1a", sort_order: 0, updated_at: "2026-01-05" },
];

describe("buildDocTree", () => {
  test("builds nested tree from flat list", () => {
    const tree = buildDocTree(docs);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.id).toBe("root-1");
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children[0]!.id).toBe("child-1a");
    expect(tree[0]!.children[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children[0]!.id).toBe("grandchild");
    expect(tree[0]!.children[1]!.id).toBe("child-1b");
    expect(tree[1]!.id).toBe("root-2");
    expect(tree[1]!.children).toHaveLength(0);
  });

  test("sorts children by sort_order", () => {
    const reversed: FlatDoc[] = [
      { id: "p", title: "P", kind: "spec", parent_id: null, sort_order: 0, updated_at: "2026-01-01" },
      { id: "b", title: "B", kind: "note", parent_id: "p", sort_order: 1, updated_at: "2026-01-02" },
      { id: "a", title: "A", kind: "note", parent_id: "p", sort_order: 0, updated_at: "2026-01-03" },
    ];
    const tree = buildDocTree(reversed);
    expect(tree[0]!.children[0]!.id).toBe("a");
    expect(tree[0]!.children[1]!.id).toBe("b");
  });

  test("returns empty array for empty input", () => {
    expect(buildDocTree([])).toEqual([]);
  });
});
