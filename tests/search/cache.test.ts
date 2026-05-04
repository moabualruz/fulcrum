import { describe, expect, test } from "bun:test";

import { SearchCache } from "../../src/search/cache.ts";
import type { SearchQueryInput, SearchQueryOutput } from "../../src/search/query.ts";

function output(id: string): SearchQueryOutput {
  return {
    results: [
      {
        id,
        orgId: "org-search",
        projectId: null,
        kind: "doc",
        entityId: id,
        title: id,
        body: "",
        labels: [],
        metadata: {},
        updatedAt: new Date("2026-05-03T00:00:00.000Z"),
        score: 1,
      },
    ],
    total: 1,
    facetCounts: {
      kind: { doc: 1 },
      docType: {},
      status: {},
      assigneeId: {},
      repoId: {},
      authorId: {},
    },
  };
}

function input(q: string, extra: Partial<SearchQueryInput> = {}): SearchQueryInput {
  return { orgId: "org-search", q, ...extra };
}

describe("P11#08 search client cache", () => {
  test("cache hit within TTL returns cached result without calling fetcher twice", async () => {
    const cache = new SearchCache({ now: () => 1_000 });
    let calls = 0;

    const first = await cache.query(input("alpha"), async () => {
      calls += 1;
      return output("alpha-result");
    });
    const second = await cache.query(input("alpha"), async () => {
      calls += 1;
      return output("unexpected");
    });

    expect(first).toBe(second);
    expect(second.results[0]!.id).toBe("alpha-result");
    expect(calls).toBe(1);
  });

  test("cache miss uses org, text, and filters as cache key", async () => {
    const cache = new SearchCache({ now: () => 1_000 });
    let calls = 0;

    await cache.query(input("alpha", { kind: "doc" }), async () => {
      calls += 1;
      return output("doc-result");
    });
    const taskResult = await cache.query(input("alpha", { kind: "task" }), async () => {
      calls += 1;
      return output("task-result");
    });
    const otherOrgResult = await cache.query({ orgId: "org-other", q: "alpha", kind: "doc" }, async () => {
      calls += 1;
      return output("other-org-result");
    });

    expect(taskResult.results[0]!.id).toBe("task-result");
    expect(otherOrgResult.results[0]!.id).toBe("other-org-result");
    expect(calls).toBe(3);
  });

  test("entry 51 evicts least recently used entry", async () => {
    const cache = new SearchCache({ now: () => 1_000 });
    let calls = 0;

    for (let index = 0; index < 50; index += 1) {
      await cache.query(input(`query-${index}`), async () => {
        calls += 1;
        return output(`result-${index}`);
      });
    }

    await cache.query(input("query-0"), async () => {
      calls += 1;
      return output("unexpected");
    });

    await cache.query(input("query-50"), async () => {
      calls += 1;
      return output("result-50");
    });

    const evicted = await cache.query(input("query-1"), async () => {
      calls += 1;
      return output("result-1-refetched");
    });

    expect(evicted.results[0]!.id).toBe("result-1-refetched");
    expect(calls).toBe(52);
  });

  test("invalidateOrg clears cached entries for one org only", async () => {
    const cache = new SearchCache({ now: () => 1_000 });
    let calls = 0;

    await cache.query(input("alpha"), async () => {
      calls += 1;
      return output("org-search-result");
    });
    await cache.query({ orgId: "org-other", q: "alpha" }, async () => {
      calls += 1;
      return output("org-other-result");
    });

    cache.invalidateOrg("org-search");

    const invalidated = await cache.query(input("alpha"), async () => {
      calls += 1;
      return output("org-search-refetched");
    });
    const stillCached = await cache.query({ orgId: "org-other", q: "alpha" }, async () => {
      calls += 1;
      return output("unexpected");
    });

    expect(invalidated.results[0]!.id).toBe("org-search-refetched");
    expect(stillCached.results[0]!.id).toBe("org-other-result");
    expect(calls).toBe(3);
  });

  test("TTL expiry after 60s causes a miss", async () => {
    let now = 1_000;
    const cache = new SearchCache({ now: () => now });
    let calls = 0;

    await cache.query(input("alpha"), async () => {
      calls += 1;
      return output("fresh");
    });

    now += 60_001;

    const expired = await cache.query(input("alpha"), async () => {
      calls += 1;
      return output("refetched");
    });

    expect(expired.results[0]!.id).toBe("refetched");
    expect(calls).toBe(2);
  });
});
