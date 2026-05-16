import { describe, expect, test } from "bun:test";

import {
  DocumentBacklinkService,
  type DocumentBacklinkDirection,
  type DocumentBacklinkRepository,
  type DocumentPagePermissionRepository,
} from "@knowledge-workspace/domain/document-backlinks.ts";

const pageId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000099";

class FakeBacklinkRepo implements DocumentBacklinkRepository {
  relatedCalls: Array<{ pageId: string; direction: DocumentBacklinkDirection; userId: string }> = [];
  paginatedCalls: Array<{ pageIds: string[]; pagination: { limit?: number } }> = [];
  related: Record<DocumentBacklinkDirection, string[]> = {
    incoming: [],
    outgoing: [],
  };

  async findRelatedPageIds(
    inputPageId: string,
    direction: DocumentBacklinkDirection,
    inputUserId: string,
  ): Promise<string[]> {
    this.relatedCalls.push({ pageId: inputPageId, direction, userId: inputUserId });
    return this.related[direction];
  }

  async findPagesByIdsPaginated(pageIds: string[], pagination: { limit?: number }) {
    this.paginatedCalls.push({ pageIds, pagination });
    return {
      items: pageIds.map((id) => ({ id })),
      meta: {
        limit: pagination.limit ?? 20,
        hasNextPage: false,
        hasPrevPage: false,
        nextCursor: null,
        prevCursor: null,
      },
    };
  }
}

class FakePermissionRepo implements DocumentPagePermissionRepository {
  calls: Array<{ pageIds: string[]; userId: string }> = [];
  blocked = new Set<string>();

  async filterAccessiblePageIds(input: { pageIds: string[]; userId: string }): Promise<string[]> {
    this.calls.push({ pageIds: input.pageIds, userId: input.userId });
    return input.pageIds.filter((id) => !this.blocked.has(id));
  }
}

function buildService() {
  const backlinks = new FakeBacklinkRepo();
  const permissions = new FakePermissionRepo();
  const service = new DocumentBacklinkService(backlinks, permissions);
  return { service, backlinks, permissions };
}

describe("document workspace backlink behavior", () => {
  test("returns post-filter counts for incoming and outgoing links", async () => {
    const { service, backlinks, permissions } = buildService();
    backlinks.related.incoming = ["a", "b", "c"];
    backlinks.related.outgoing = ["x", "y"];
    permissions.blocked = new Set(["b", "y"]);

    const result = await service.countByPageId(pageId, userId);

    expect(result).toEqual({ incoming: 2, outgoing: 1 });
    expect(permissions.calls).toEqual([
      { pageIds: ["a", "b", "c"], userId },
      { pageIds: ["x", "y"], userId },
    ]);
  });

  test("skips permission filtering when there are no candidate related pages", async () => {
    const { service, permissions } = buildService();

    const result = await service.countByPageId(pageId, userId);

    expect(result).toEqual({ incoming: 0, outgoing: 0 });
    expect(permissions.calls).toEqual([]);
  });

  test("passes user id into related-id lookup for both directions", async () => {
    const { service, backlinks } = buildService();

    await service.countByPageId(pageId, userId);

    expect(backlinks.relatedCalls).toEqual([
      { pageId, direction: "incoming", userId },
      { pageId, direction: "outgoing", userId },
    ]);
  });

  test("findByPageId passes accessible ids through to the paginated page lookup", async () => {
    const { service, backlinks, permissions } = buildService();
    backlinks.related.incoming = ["a", "b"];
    permissions.blocked = new Set(["b"]);

    const result = await service.findByPageId(pageId, "incoming", userId, { limit: 20 });

    expect(result.items).toEqual([{ id: "a" }]);
    expect(backlinks.paginatedCalls).toEqual([{ pageIds: ["a"], pagination: { limit: 20 } }]);
  });

  test("findByPageId still calls the paginated lookup with an empty list", async () => {
    const { service, backlinks, permissions } = buildService();

    const result = await service.findByPageId(pageId, "incoming", userId, { limit: 20 });

    expect(result.items).toEqual([]);
    expect(backlinks.paginatedCalls).toEqual([{ pageIds: [], pagination: { limit: 20 } }]);
    expect(permissions.calls).toEqual([]);
  });
});
