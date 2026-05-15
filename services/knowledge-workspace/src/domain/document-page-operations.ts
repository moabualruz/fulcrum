export interface DocumentPageWithParent {
  id: string;
  parentPageId: string | null;
}

export interface DocumentCursorResult<Item> {
  items: Item[];
  meta: {
    limit?: number;
    [key: string]: unknown;
  };
}

export interface DocumentSidebarPermission {
  id: string;
  canEdit: boolean;
}

export interface DocumentPagePermissionOperations {
  hasRestrictedPagesInSpace(spaceId: string): Promise<boolean>;
  filterAccessiblePageIds(input: {
    pageIds: string[];
    userId: string;
    spaceId?: string;
  }): Promise<string[]>;
  filterAccessiblePageIdsWithPermissions(
    pageIds: string[],
    userId: string,): Promise<DocumentSidebarPermission[]>;
  getParentIdsWithAccessibleChildren(
    parentIds: string[],
    userId: string,): Promise<string[]>;
}

export interface FilterAccessibleDocumentTreePagesInput<Page extends DocumentPageWithParent> {
  pages: Page[];
  rootPageId: string;
  accessiblePageIds: Iterable<string>;
}

export interface ApplyDocumentSidebarPermissionsInput<Item extends { id: string; hasChildren: boolean }> {
  result: DocumentCursorResult<Item>;
  spaceId: string;
  userId?: string;
  spaceCanEdit?: boolean;
  permissions: DocumentPagePermissionOperations;
}

export interface FilterAccessibleRecentDocumentPagesInput<Item extends { id: string }> {
  result: DocumentCursorResult<Item>;
  userId: string;
  spaceId?: string;
  permissions: Pick<DocumentPagePermissionOperations, "filterAccessiblePageIds">;
}

export function filterAccessibleDocumentTreePages<Page extends DocumentPageWithParent>(
  input: FilterAccessibleDocumentTreePagesInput<Page>,): Page[] {
  if (input.pages.length === 0) return [];

  const accessibleSet = new Set(input.accessiblePageIds);
  const includedIds = new Set<string>;

  let changed = true;
  while (changed) {
    changed = false;
    for (const page of input.pages) {
      if (includedIds.has(page.id)) continue;
      if (!accessibleSet.has(page.id)) continue;

      if (page.id === input.rootPageId) {
        includedIds.add(page.id);
        changed = true;
        continue;
      }

      if (page.parentPageId && includedIds.has(page.parentPageId)) {
        includedIds.add(page.id);
        changed = true;
      }
    }
  }

  return input.pages.filter((page) => includedIds.has(page.id));
}

export async function applyDocumentSidebarPermissions<Item extends { id: string; hasChildren: boolean }>(
  input: ApplyDocumentSidebarPermissionsInput<Item>,): Promise<DocumentCursorResult<Item & { canEdit?: boolean }>> {
  if (!input.userId || input.result.items.length === 0) {
    return input.result;
  }

  const hasRestrictions = await input.permissions.hasRestrictedPagesInSpace(input.spaceId);

  if (!hasRestrictions) {
    return {...input.result,
      items: input.result.items.map((page) => ({...page,
        canEdit: input.spaceCanEdit ?? true,
      })),
    };
  }

  const pageIds = input.result.items.map((page) => page.id);
  const accessiblePages = await input.permissions.filterAccessiblePageIdsWithPermissions(
    pageIds,
    input.userId,);
  const permissionMap = new Map(accessiblePages.map((page) => [page.id, page.canEdit]));

  let items = input.result.items.filter((page) => permissionMap.has(page.id)).map((page) => ({...page,
      canEdit: Boolean(permissionMap.get(page.id)) && (input.spaceCanEdit ?? true),
    }));

  const pagesWithChildren = items.filter((page) => page.hasChildren);
  if (pagesWithChildren.length > 0) {
    const parentIds = pagesWithChildren.map((page) => page.id);
    const parentsWithAccessibleChildren = await input.permissions.getParentIdsWithAccessibleChildren(
      parentIds,
      input.userId,);
    const hasAccessibleChildrenSet = new Set(parentsWithAccessibleChildren);

    items = items.map((page) => ({...page,
      hasChildren: page.hasChildren && hasAccessibleChildrenSet.has(page.id),
    }));
  }

  return {...input.result, items };
}

export async function filterAccessibleRecentDocumentPages<Item extends { id: string }>(
  input: FilterAccessibleRecentDocumentPagesInput<Item>,): Promise<DocumentCursorResult<Item>> {
  if (input.result.items.length === 0) {
    return input.result;
  }

  const pageIds = input.result.items.map((page) => page.id);
  const accessibleIds = await input.permissions.filterAccessiblePageIds({
    pageIds,
    userId: input.userId,
    spaceId: input.spaceId,
  });
  const accessibleSet = new Set(accessibleIds);

  return {...input.result,
    items: input.result.items.filter((page) => accessibleSet.has(page.id)),
  };
}
