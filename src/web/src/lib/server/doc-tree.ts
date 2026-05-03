/** Flat doc row from DB — enough for tree building. */
export interface FlatDoc {
  id: string;
  title: string;
  kind: string;
  parent_id: string | null;
  sort_order: number;
  updated_at: string;
}

/** Tree node with children. */
export interface DocTreeNode extends FlatDoc {
  children: DocTreeNode[];
}

/** Build nested tree from flat doc list. Roots = parent_id null. */
export function buildDocTree(docs: FlatDoc[]): DocTreeNode[] {
  const map = new Map<string, DocTreeNode>();
  for (const doc of docs) {
    map.set(doc.id, { ...doc, children: [] });
  }
  const roots: DocTreeNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortChildren = (nodes: DocTreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);
  return roots;
}
