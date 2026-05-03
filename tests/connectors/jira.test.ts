import { describe, expect, it } from "bun:test";

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
});
