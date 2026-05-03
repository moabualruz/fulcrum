import { describe, expect, it } from "bun:test";

import type { SyncItem } from "../../src/connectors/index.ts";
import { JiraConnector } from "../../src/connectors/jira.ts";

describe("JiraConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new JiraConnector({
      url: "https://example.atlassian.net",
      token: "token",
      projectKey: "FUL",
    });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-jira");
  });

  it("pulls Jira issues and maps task fields", async () => {
    const requests: Request[] = [];
    const connector = new JiraConnector({
      url: "https://example.atlassian.net",
      token: "token",
      projectKey: "FUL",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          issues: [
            {
              id: "10001",
              key: "FUL-1",
              fields: {
                summary: "Ship connector",
                status: { name: "Done" },
                priority: { name: "High" },
                assignee: { emailAddress: "owner@example.com", displayName: "Owner" },
                duedate: "2026-05-15",
                labels: ["api", "sync"],
              },
            },
          ],
        });
      },
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({
      pulled: 1,
      pushed: 0,
      skipped: 0,
      errors: [],
    });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "FUL-1",
        data: {
          id: "10001",
          title: "Ship connector",
          status: "done",
          priority: "high",
          assignee: "owner@example.com",
          dueDate: "2026-05-15",
          labels: ["api", "sync"],
        },
      },
    ]);
    expect(requests[0]!.url).toContain("/rest/api/3/search/jql?");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer token");
  });

  it("pushes task title and done status updates to Jira", async () => {
    const requests: Request[] = [];
    const connector = new JiraConnector({
      url: "https://example.atlassian.net",
      token: "token",
      projectKey: "FUL",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(null, { status: 204 });
      },
    });
    connector.enable();

    const result = await connector.push([
      { externalId: "FUL-1", data: { title: "Finished connector", status: "done" } },
    ]);

    expect(result).toEqual({ pulled: 0, pushed: 1, skipped: 0, errors: [] });
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.url).toBe("https://example.atlassian.net/rest/api/3/issue/FUL-1");
    expect(await requests[0]!.json()).toEqual({
      fields: { summary: "Finished connector" },
      transition: { status: "Done" },
    });
  });

  it("reports auth_failed health on Jira auth failure", async () => {
    const connector = new JiraConnector({
      url: "https://example.atlassian.net",
      token: "bad",
      projectKey: "FUL",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });

  it("imports historical Jira issues across pages and upserts mapped batches", async () => {
    const requests: Request[] = [];
    const batches: SyncItem[][] = [];
    const connector = new JiraConnector({
      url: "https://example.atlassian.net",
      token: "token",
      projectKey: "FUL",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const url = new URL(request.url);
        if (url.searchParams.get("startAt") === "0") {
          return Response.json({
            startAt: 0,
            maxResults: 2,
            total: 3,
            issues: [
              {
                id: "10001",
                key: "FUL-1",
                fields: {
                  summary: "Parent Jira issue",
                  status: { name: "In Progress" },
                  priority: { name: "High" },
                  assignee: { displayName: "Owner" },
                  duedate: "2026-06-01",
                  labels: ["history"],
                  parent: { key: "FUL-0" },
                },
              },
              {
                id: "10002",
                key: "FUL-2",
                fields: {
                  summary: "Child Jira issue",
                  status: { name: "Done" },
                  priority: { name: "Low" },
                  assignee: { emailAddress: "child@example.com" },
                  labels: ["api"],
                  parent: { key: "FUL-1" },
                },
              },
            ],
          });
        }

        return Response.json({
          startAt: 2,
          maxResults: 2,
          total: 3,
          issues: [
            {
              id: "10003",
              key: "FUL-3",
              fields: {
                summary: "Final Jira issue",
                status: { name: "To Do" },
                labels: [],
              },
            },
          ],
        });
      },
    });
    connector.enable();

    const result = await connector.importHistory({
      batchSize: 2,
      store: {
        async upsertBatch(kind, items) {
          expect(kind).toBe("jira");
          batches.push(items);
        },
      },
    });

    expect(result).toEqual({ imported: 3, upserted: 3, batches: 2, errors: [] });
    expect(requests.map((request) => new URL(request.url).searchParams.get("startAt"))).toEqual(["0", "2"]);
    expect(batches[0]).toEqual([
      {
        externalId: "FUL-1",
        data: {
          id: "10001",
          title: "Parent Jira issue",
          status: "in-progress",
          priority: "high",
          assignee: "Owner",
          dueDate: "2026-06-01",
          labels: ["history"],
          parentExternalId: "FUL-0",
        },
      },
      {
        externalId: "FUL-2",
        data: {
          id: "10002",
          title: "Child Jira issue",
          status: "done",
          priority: "low",
          assignee: "child@example.com",
          dueDate: undefined,
          labels: ["api"],
          parentExternalId: "FUL-1",
        },
      },
    ]);
    expect(batches[1]).toEqual([
      {
        externalId: "FUL-3",
        data: {
          id: "10003",
          title: "Final Jira issue",
          status: "todo",
          priority: undefined,
          assignee: undefined,
          dueDate: undefined,
          labels: [],
          parentExternalId: undefined,
        },
      },
    ]);
  });
});
