import { describe, expect, it, mock } from "bun:test";

import type { SyncItem } from "./interface.ts";
import { LinearConnector } from "./linear.ts";

function linearIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "uuid-1",
    identifier: "FUL-1",
    title: "Ship Linear connector",
    state: { name: "Done", type: "completed" },
    cycle: { name: "Sprint 4" },
    estimate: 5,
    priority: 2,
    assignee: { email: "owner@example.com", name: "Owner" },
    labels: { nodes: [{ name: "api" }, { name: "sync" }] },
    ...overrides,
  };
}

function mockFetch(pages: Record<string, unknown>[][]) {
  let callIndex = 0;
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (input: string, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const nodes = pages[callIndex] ?? [];
      const hasNext = callIndex < pages.length - 1;
      const cursor = hasNext ? `cursor-${callIndex + 1}` : null;
      callIndex++;
      return Response.json({
        data: {
          issues: {
            pageInfo: { hasNextPage: hasNext, endCursor: cursor },
            nodes,
          },
        },
      });
    },
  };
}

describe("LinearConnector", () => {
  // AC: Flag OFF → no GraphQL call (spy)
  it("is disabled by default and throws before making any API call", async () => {
    const spy = mock(() => Promise.resolve(Response.json({})));
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: spy,
    });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-linear");
    expect(spy).not.toHaveBeenCalled();
  });

  // AC: fetch() queries Linear GraphQL API with Bearer auth; returns mapped fields
  it("pulls Linear issues and maps task fields correctly", async () => {
    const { requests, fetch: mockFn } = mockFetch([[linearIssue()]]);
    const connector = new LinearConnector({
      apiKey: "lin_test_key",
      teamId: "team-1",
      fetch: mockFn,
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 1, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "linear:uuid-1",
        data: {
          id: "uuid-1",
          title: "Ship Linear connector",
          status: "done",
          priority: "high",
          sprint: "Sprint 4",
          estimate: 5,
          assignee: "owner@example.com",
          labels: ["api", "sync"],
        },
      },
    ]);
    expect(requests[0]!.url).toBe("https://api.linear.app/graphql");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer lin_test_key");
  });

  // AC: cursor-based pagination — mock returns 2 pages → all items imported
  it("paginates across multiple pages via endCursor", async () => {
    const page1 = [linearIssue({ id: "uuid-1", identifier: "FUL-1", title: "Issue 1" })];
    const page2 = [
      linearIssue({ id: "uuid-2", identifier: "FUL-2", title: "Issue 2" }),
      linearIssue({ id: "uuid-3", identifier: "FUL-3", title: "Issue 3" }),
    ];
    const { requests, fetch: mockFn } = mockFetch([page1, page2]);
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: mockFn,
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 3, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toHaveLength(3);
    expect(requests).toHaveLength(2);
    // second request should include cursor
    const body2 = (await requests[1]!.clone().json()) as { variables: { after: string } };
    expect(body2.variables.after).toBe("cursor-1");
  });

  // AC: delta sync — first run imports 5; second with 0 updated → {imported:0, updated:0}
  it("delta sync returns zero counts when no items updated since last sync", async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      linearIssue({ id: `uuid-${i}`, identifier: `FUL-${i}`, title: `Issue ${i}` }),
    );
    let callCount = 0;
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: async (input, init) => {
        callCount++;
        if (callCount === 1) {
          return Response.json({
            data: {
              issues: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: items,
              },
            },
          });
        }
        // second run: no items updated
        return Response.json({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        });
      },
    });
    connector.enable();

    const first = await connector.pull();
    expect(first.pulled).toBe(5);

    const second = await connector.pull();
    expect(second).toEqual({ pulled: 0, pushed: 0, skipped: 0, errors: [] });
  });

  // AC: field mapping — Linear priority enum (0–4) → Fulcrum priority
  it("maps Linear priority enum to Fulcrum priority strings", async () => {
    const priorities = [
      { input: 0, expected: "none" },
      { input: 1, expected: "urgent" },
      { input: 2, expected: "high" },
      { input: 3, expected: "medium" },
      { input: 4, expected: "low" },
    ];
    for (const { input, expected } of priorities) {
      const { fetch: mockFn } = mockFetch([[linearIssue({ priority: input })]]);
      const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
      connector.enable();
      await connector.pull();
      expect(connector.pulledItems[0]!.data.priority).toBe(expected);
    }
  });

  // AC: Linear state → Fulcrum status mapping
  it("maps Linear state types to Fulcrum statuses", async () => {
    const cases = [
      { state: { name: "Done", type: "completed" }, expected: "done" },
      { state: { name: "In Progress", type: "started" }, expected: "in-progress" },
      { state: { name: "Backlog", type: "backlog" }, expected: "todo" },
      { state: { name: "Cancelled", type: "canceled" }, expected: "cancelled" },
      { state: { name: "Triage", type: "triage" }, expected: "todo" },
    ];
    for (const { state, expected } of cases) {
      const { fetch: mockFn } = mockFetch([[linearIssue({ state })]]);
      const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
      connector.enable();
      await connector.pull();
      expect(connector.pulledItems[0]!.data.status).toBe(expected);
    }
  });

  // AC: cycle→sprint mapping — cycle name becomes sprint field
  it("maps Linear cycle to Fulcrum sprint by name", async () => {
    const { fetch: mockFn } = mockFetch([
      [linearIssue({ cycle: { name: "Cycle Q2-W3", startsAt: "2026-04-14", endsAt: "2026-04-20" } })],
    ]);
    const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
    connector.enable();
    await connector.pull();
    expect(connector.pulledItems[0]!.data.sprint).toBe("Cycle Q2-W3");
  });

  it("handles missing cycle gracefully (no sprint)", async () => {
    const { fetch: mockFn } = mockFetch([[linearIssue({ cycle: null })]]);
    const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
    connector.enable();
    await connector.pull();
    expect(connector.pulledItems[0]!.data.sprint).toBeUndefined();
  });

  // AC: external_id='linear:<uuid>'
  it("uses linear:<uuid> as external_id", async () => {
    const { fetch: mockFn } = mockFetch([[linearIssue({ id: "abc-def-123" })]]);
    const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
    connector.enable();
    await connector.pull();
    expect(connector.pulledItems[0]!.externalId).toBe("linear:abc-def-123");
  });

  // AC: push updates via GraphQL mutation
  it("pushes title and status updates with GraphQL mutation", async () => {
    const requests: Request[] = [];
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ data: { issueUpdate: { success: true } } });
      },
    });
    connector.enable();

    const result = await connector.push([
      { externalId: "linear:uuid-1", data: { title: "Updated", status: "done" } },
    ]);

    expect(result).toEqual({ pulled: 0, pushed: 1, skipped: 0, errors: [] });
    const body = (await requests[0]!.json()) as { variables: { id: string } };
    // strips linear: prefix when pushing back
    expect(body.variables.id).toBe("uuid-1");
  });

  // AC: healthCheck reports auth_failed
  it("reports auth_failed health on 401", async () => {
    const connector = new LinearConnector({
      apiKey: "bad",
      teamId: "t",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();
    const health = await connector.healthCheck();
    expect(health).toMatchObject({ ok: false, status: "auth_failed" });
  });

  // AC: --json output {imported, updated, errors} shape valid
  it("pull result is JSON-serializable with correct shape", async () => {
    const { fetch: mockFn } = mockFetch([[linearIssue()]]);
    const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
    connector.enable();
    const result = await connector.pull();

    const json = JSON.parse(JSON.stringify(result));
    expect(json).toHaveProperty("pulled");
    expect(json).toHaveProperty("pushed");
    expect(json).toHaveProperty("errors");
    expect(Array.isArray(json.errors)).toBe(true);
  });

  // AC: historical import across cursor pages
  it("imports historical issues across cursors with batch upsert", async () => {
    const batches: SyncItem[][] = [];
    const { fetch: mockFn } = mockFetch([
      [linearIssue({ id: "u1", identifier: "F-1" })],
      [linearIssue({ id: "u2", identifier: "F-2" }), linearIssue({ id: "u3", identifier: "F-3" })],
    ]);
    const connector = new LinearConnector({ apiKey: "key", teamId: "t", fetch: mockFn });
    connector.enable();

    const result = await connector.importHistory({
      batchSize: 2,
      store: {
        async upsertBatch(kind, items) {
          expect(kind).toBe("linear");
          batches.push(items);
        },
      },
    });

    expect(result).toEqual({ imported: 3, upserted: 3, batches: 2, errors: [] });
    expect(batches).toHaveLength(2);
  });
});
