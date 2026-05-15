export type DocumentBacklinkDirection = "incoming" | "outgoing";

export interface DocumentBacklinkPaginationOptions {
  limit?: number;
  cursor?: string | null;
  [key: string]: unknown;
}

export interface DocumentBacklinkPageList<Page = unknown> {
  items: Page[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
    [key: string]: unknown;
  };
}

export interface DocumentBacklinkRepository<Page = unknown> {
  findRelatedPageIds(
    pageId: string,
    direction: DocumentBacklinkDirection,
    userId: string,): Promise<string[]>;
  findPagesByIdsPaginated(
    pageIds: string[],
    pagination: DocumentBacklinkPaginationOptions,): Promise<DocumentBacklinkPageList<Page>>;
}

export interface DocumentPagePermissionRepository {
  filterAccessiblePageIds(input: {
    pageIds: string[];
    userId: string;
  }): Promise<string[]>;
}

export class DocumentBacklinkService<Page = unknown> {
  constructor(
    private readonly backlinkRepo: DocumentBacklinkRepository<Page>,
    private readonly pagePermissionRepo: DocumentPagePermissionRepository,) {}

  async countByPageId(
    pageId: string,
    userId: string,): Promise<{ incoming: number; outgoing: number }> {
    const [incomingIds, outgoingIds] = await Promise.all([
      this.accessibleRelatedIds(pageId, "incoming", userId),
      this.accessibleRelatedIds(pageId, "outgoing", userId),
    ]);
    return { incoming: incomingIds.length, outgoing: outgoingIds.length };
  }

  async findByPageId(
    pageId: string,
    direction: DocumentBacklinkDirection,
    userId: string,
    pagination: DocumentBacklinkPaginationOptions,): Promise<DocumentBacklinkPageList<Page>> {
    const accessibleIds = await this.accessibleRelatedIds(
      pageId,
      direction,
      userId,);
    return this.backlinkRepo.findPagesByIdsPaginated(accessibleIds, pagination);
  }

  private async accessibleRelatedIds(
    pageId: string,
    direction: DocumentBacklinkDirection,
    userId: string,): Promise<string[]> {
    const candidateIds = await this.backlinkRepo.findRelatedPageIds(
      pageId,
      direction,
      userId,);
    if (candidateIds.length === 0) return [];
    return this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: candidateIds,
      userId,
    });
  }
}
