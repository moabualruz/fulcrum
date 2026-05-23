export interface FulcrumDocTreePage {
  id: string;
  slugId?: string | null;
  title?: string | null;
  name?: string | null;
  icon?: string | null;
  position?: string | number | null;
  sortPosition?: string | number | null;
  spaceId?: string | null;
  projectId?: string | null;
  parentPageId?: string | null;
  parentId?: string | null;
  hasChildren?: boolean;
  canEdit?: boolean;
  permissions?: {
    canEdit?: boolean;
  } | null;
}

export interface DocumentTreeNode {
  id: string;
  slugId: string;
  name: string;
  icon?: string;
  position: string;
  spaceId: string;
  parentPageId: string | null;
  hasChildren: boolean;
  canEdit?: boolean;
  children: DocumentTreeNode[];
}

export interface DocumentPositioned {
  position: string | number;
}

export function sortDocumentPositionKeys<T extends DocumentPositioned>(keys: T[]): T[] {
  return keys.sort((a, b) => {
    const positionCompare = compareDocumentPositions(a.position, b.position);
    if (positionCompare !== 0) return positionCompare;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const nameCompare = String(aRecord["name"] ?? aRecord["title"] ?? "").localeCompare(
      String(bRecord["name"] ?? bRecord["title"] ?? ""),
    );
    if (nameCompare !== 0) return nameCompare;
    return String(aRecord["id"] ?? "").localeCompare(String(bRecord["id"] ?? ""));
  });
}

function compareDocumentPositions(left: string | number, right: string | number): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

export function buildDocumentPageTree(pages: FulcrumDocTreePage[]): DocumentTreeNode[] {
  return buildDocumentTreeWithChildren(pages.map(mapDocumentToTreeNode));
}

export function mapDocumentToTreeNode(page: FulcrumDocTreePage): DocumentTreeNode {
  const parentPageId = page.parentPageId ?? page.parentId ?? null;
  const position = page.position ?? page.sortPosition ?? "0";
  const name = page.name ?? page.title ?? "";
  const slugId = page.slugId ?? page.id;
  const spaceId = page.spaceId ?? page.projectId ?? "global";

  return {
    id: page.id,
    slugId,
    name,
    icon: page.icon ?? undefined,
    position: String(position),
    hasChildren: page.hasChildren ?? false,
    spaceId,
    parentPageId,
    canEdit: page.canEdit ?? page.permissions?.canEdit,
    children: [],
  };
}

export function buildDocumentTreeWithChildren(items: DocumentTreeNode[]): DocumentTreeNode[] {
  const nodeMap: Record<string, DocumentTreeNode> = {};
  let result: DocumentTreeNode[] = [];

  items.forEach((item) => {
    nodeMap[item.id] = {...item, children: [] };
  });

  items.forEach((item) => {
    const node = nodeMap[item.id];
    if (!node) return;

    const parent = item.parentPageId === null ? undefined : nodeMap[item.parentPageId];
    if (parent) {
      parent.children.push(node);
      return;
    }

    result.push(node);
  });

  result = sortDocumentPositionKeys(result);

  function sortChildren(node: DocumentTreeNode) {
    if (node.children.length > 0) {
      node.hasChildren = true;
      node.children = sortDocumentPositionKeys(node.children);
      node.children.forEach(sortChildren);
    }
  }

  result.forEach(sortChildren);

  return result;
}

export function findDocumentBreadcrumbPath(
  tree: DocumentTreeNode[],
  pageId: string,
  path: DocumentTreeNode[] = [],): DocumentTreeNode[] | null {
  for (const node of tree) {
    if (!node.name || node.name.trim() === "") {
      node.name = "untitled";
    }

    if (node.id === pageId) {
      return [...path, node];
    }

    if (node.children) {
      const newPath = findDocumentBreadcrumbPath(node.children, pageId, [...path,
        node,
      ]);
      if (newPath) {
        return newPath;
      }
    }
  }
  return null;
}

export function renameDocumentTreeNode(
  nodes: DocumentTreeNode[],
  nodeId: string,
  newName: string,): DocumentTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {...node, name: newName };
    }
    if (node.children && node.children.length > 0) {
      return {...node,
        children: renameDocumentTreeNode(node.children, nodeId, newName),
      };
    }
    return node;
  });
}

export function setDocumentTreeNodeIcon(
  nodes: DocumentTreeNode[],
  nodeId: string,
  newIcon: string,): DocumentTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {...node, icon: newIcon };
    }
    if (node.children && node.children.length > 0) {
      return {...node,
        children: setDocumentTreeNodeIcon(node.children, nodeId, newIcon),
      };
    }
    return node;
  });
}

export function deleteDocumentTreeNode(
  nodes: DocumentTreeNode[],
  nodeId: string,): DocumentTreeNode[] {
  return nodes.map((node): DocumentTreeNode | null => {
      if (node.id === nodeId) {
        return null;
      }

      if (node.children && node.children.length > 0) {
        return {...node,
          children: deleteDocumentTreeNode(node.children, nodeId),
        };
      }
      return node;
    }).filter((node): node is DocumentTreeNode => node !== null);
}

export function appendDocumentTreeNodeChildren(
  treeItems: DocumentTreeNode[],
  nodeId: string,
  children: DocumentTreeNode[],): DocumentTreeNode[] {
  return treeItems.map((node) => {
    if (node.id === nodeId) {
      const newIds = new Set(children.map((child) => child.id));

      const existingMap = new Map(
        (node.children ?? []).filter((child) => newIds.has(child.id)).map((child) => [child.id, child]),);

      const merged = children.map((newChild) => {
        const existing = existingMap.get(newChild.id);
        return existing && existing.children
          ? {...newChild, children: existing.children }
          : newChild;
      });

      return {...node,
        children: merged,
      };
    }

    if (node.children) {
      return {...node,
        children: appendDocumentTreeNodeChildren(node.children, nodeId, children),
      };
    }

    return node;
  });
}

export function mergeDocumentRootTrees(
  prevRoots: DocumentTreeNode[],
  incomingRoots: DocumentTreeNode[],): DocumentTreeNode[] {
  const seen = new Set(prevRoots.map((root) => root.id));
  const merged = [...prevRoots];

  incomingRoots.forEach((node) => {
    if (!seen.has(node.id)) {
      merged.push(node);
    }
  });

  return sortDocumentPositionKeys(merged);
}

export interface DocumentTreeAppendChildrenOperation {
  nodeId: string;
  children: DocumentTreeNode[];
}

export interface DocumentTreeMoveOperation {
  nodeId: string;
  parentPageId: string | null;
  previousSiblingPosition?: string | number | null;
  nextSiblingPosition?: string | number | null;
}

export interface DocumentTreeOperationsPreviewInput {
  tree: DocumentTreeNode[];
  rename?: { nodeId: string; name: string };
  icon?: { nodeId: string; icon: string };
  deleteIds?: string[];
  appendChildren?: DocumentTreeAppendChildrenOperation[];
  mergeRoots?: DocumentTreeNode[];
  move?: DocumentTreeMoveOperation;
}

export interface DocumentTreeOperationsPreviewOutput {
  tree: DocumentTreeNode[];
  persistedMoves: Array<{ id: string; parentPageId: string | null; position: string }>;
  applied: string[];
}

export function previewDocumentTreeOperations(
  input: DocumentTreeOperationsPreviewInput,
): DocumentTreeOperationsPreviewOutput {
  let tree = cloneDocumentTree(input.tree);
  const applied: string[] = [];
  const persistedMoves: Array<{ id: string; parentPageId: string | null; position: string }> = [];

  if (input.rename) {
    tree = renameDocumentTreeNode(tree, input.rename.nodeId, input.rename.name);
    applied.push("rename");
  }

  if (input.icon) {
    tree = setDocumentTreeNodeIcon(tree, input.icon.nodeId, input.icon.icon);
    applied.push("icon");
  }

  for (const id of input.deleteIds ?? []) {
    tree = deleteDocumentTreeNode(tree, id);
    applied.push("delete");
  }

  for (const append of input.appendChildren ?? []) {
    tree = appendDocumentTreeNodeChildren(tree, append.nodeId, sortDocumentPositionKeys(cloneDocumentTree(append.children)));
    applied.push("append");
  }

  if (input.mergeRoots) {
    tree = mergeDocumentRootTrees(tree, cloneDocumentTree(input.mergeRoots));
    applied.push("merge");
  }

  if (input.move) {
    const position = midpointPosition(
      input.move.previousSiblingPosition ?? null,
      input.move.nextSiblingPosition ?? null,
    );
    tree = moveDocumentTreeNode(tree, input.move.nodeId, input.move.parentPageId, position);
    persistedMoves.push({ id: input.move.nodeId, parentPageId: input.move.parentPageId, position });
    applied.push("move");
  }

  return { tree, persistedMoves, applied };
}

function moveDocumentTreeNode(
  tree: DocumentTreeNode[],
  nodeId: string,
  parentPageId: string | null,
  position: string,
): DocumentTreeNode[] {
  const flat = flattenDocumentTree(tree).map((node) =>
    node.id === nodeId ? { ...node, parentPageId, position, children: [] } : { ...node, children: [] },
  );
  return buildDocumentTreeWithChildren(flat);
}

function flattenDocumentTree(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => [
    { ...node, children: [] },
    ...flattenDocumentTree(node.children),
  ]);
}

function cloneDocumentTree(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.map((node) => ({ ...node, children: cloneDocumentTree(node.children) }));
}

function midpointPosition(previous: string | number | null, next: string | number | null): string {
  const previousNumber = previous === null ? null : Number(previous);
  const nextNumber = next === null ? null : Number(next);
  if (previousNumber === null && nextNumber === null) return "1";
  if (previousNumber === null) {
    return nextNumber !== null && Number.isFinite(nextNumber) ? String(nextNumber - 1) : "1";
  }
  if (nextNumber === null) {
    return Number.isFinite(previousNumber) ? String(previousNumber + 1) : `${previous}.1`;
  }
  if (Number.isFinite(previousNumber) && Number.isFinite(nextNumber)) {
    return String((previousNumber + nextNumber) / 2);
  }
  return previous === null ? "1" : `${previous}.1`;
}
