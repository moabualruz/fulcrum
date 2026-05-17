import { describe, expect, it } from "bun:test";

import type { SyncItem } from "../../../services/integration-hub/src/application/external-connectors/index.ts";
import { LinearConnector } from "../../../services/integration-hub/src/application/external-connectors/linear.ts";

describe("LinearConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new LinearConnector({ apiKey: "key", teamId: "team-1" });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-linear");
  });

  it("pulls Linear issues and maps task fields", async () => {
    const requests: Request[] = [];
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          data: {
            issues: {
              nodes: [
                {
                  id: "lin-1",
                  identifier: "FUL-1",
                  title: "Ship Linear connector",
                  state: { name: "Done", type: "completed" },
                  cycle: { name: "Sprint 4" },
                  estimate: 5,
                  assignee: { email: "owner@example.com", name: "Owner" },
                  labels: { nodes: [{ name: "api" }, { name: "sync" }] },
                },
              ],
            },
          },
        });
      },
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 1, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "linear:lin-1",
        data: {
          id: "lin-1",
          title: "Ship Linear connector",
          status: "done",
          sprint: "Sprint 4",
          estimate: 5,
          assignee: "owner@example.com",
          labels: ["api", "sync"],
          priority: "none",
        },
      },
    ]);
    expect(requests[0]!.url).toBe("https://api.linear.app/graphql");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer key");
  });

  it("pushes title and status updates with GraphQL mutation", async () => {
    const requests: Request[] = [];
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({ data: { issueUpdate: { success: true } } });
      },
    });
    connector.enable();

    const result = await connector.push([
      { externalId: "lin-1", data: { title: "Finished connector", status: "done" } },
    ]);

    expect(result).toEqual({ pulled: 0, pushed: 1, skipped: 0, errors: [] });
    const body = (await requests[0]!.json()) as { query: string; variables: unknown };
    expect(body.query).toContain("mutation UpdateIssue");
    expect(body.variables).toEqual({
      id: "lin-1",
      input: { title: "Finished connector", stateName: "Done" },
    });
  });

  it("reports auth_failed health on Linear auth failure", async () => {
    const connector = new LinearConnector({
      apiKey: "bad",
      teamId: "team-1",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });

  it("imports historical Linear issues across cursors and idempotently upserts batches", async () => {
    const requests: Request[] = [];
    const batches: SyncItem[][] = [];
    const connector = new LinearConnector({
      apiKey: "key",
      teamId: "team-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const body = (await request.json()) as { variables?: { after?: string } };
        if (!body.variables?.after) {
          return Response.json({
            data: {
              issues: {
                pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
                nodes: [
                  {
                    id: "lin-1",
                    identifier: "FUL-1",
                    title: "Import Linear history",
                    state: { name: "In Progress", type: "started" },
                    cycle: { name: "Cycle 7" },
                    assignee: { email: "owner@example.com" },
                    labels: { nodes: [{ name: "history" }] },
                  },
                ],
              },
            },
          });
        }

        return Response.json({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "lin-1",
                  identifier: "FUL-1",
                  title: "Import Linear history updated",
                  state: { name: "Done", type: "completed" },
                  cycle: { name: "Cycle 7" },
                  assignee: { email: "owner@example.com" },
                  labels: { nodes: [{ name: "history" }, { name: "api" }] },
                },
                {
                  id: "lin-2",
                  identifier: "FUL-2",
                  title: "Second Linear issue",
                  state: { name: "Todo" },
                  cycle: { name: "Cycle 8" },
                },
              ],
            },
          },
        });
      },
    });
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
    expect(requests).toHaveLength(2);
    expect(batches).toEqual([
      [
        {
          externalId: "linear:lin-1",
          data: {
            id: "lin-1",
            title: "Import Linear history",
            status: "in-progress",
            sprint: "Cycle 7",
            estimate: undefined,
            assignee: "owner@example.com",
            labels: ["history"],
            priority: "none",
          },
        },
      ],
      [
        {
          externalId: "linear:lin-1",
          data: {
            id: "lin-1",
            title: "Import Linear history updated",
            status: "done",
            sprint: "Cycle 7",
            estimate: undefined,
            assignee: "owner@example.com",
            labels: ["history", "api"],
            priority: "none",
          },
        },
        {
          externalId: "linear:lin-2",
          data: {
            id: "lin-2",
            title: "Second Linear issue",
            status: "todo",
            sprint: "Cycle 8",
            estimate: undefined,
            assignee: undefined,
            labels: [],
            priority: "none",
          },
        },
      ],
    ]);
  });
});
