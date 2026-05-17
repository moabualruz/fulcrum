import { describe, expect, it } from "bun:test";

import { NotionConnector } from "../../../services/integration-hub/src/application/external-connectors/notion.ts";

describe("NotionConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new NotionConnector({ token: "token", databaseId: "db-1" });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-notion");
  });

  it("pulls Notion database rows to tasks and pages to docs", async () => {
    const requests: Request[] = [];
    const connector = new NotionConnector({
      token: "token",
      databaseId: "db-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/v1/databases/db-1/query")) {
          return Response.json({
            results: [
              {
                id: "task-1",
                properties: {
                  Name: { title: [{ plain_text: "Ship Notion connector" }] },
                  Status: { status: { name: "Done" } },
                  Due: { date: { start: "2026-05-20" } },
                },
              },
            ],
          });
        }
        return Response.json({
          results: [
            {
              id: "page-1",
              object: "page",
              properties: { title: { title: [{ plain_text: "Project Notes" }] } },
            },
          ],
        });
      },
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 2, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "task-1",
        data: {
          kind: "task",
          title: "Ship Notion connector",
          status: "done",
          dueDate: "2026-05-20",
          metadata_json: { external_id: "task-1", source: "notion" },
        },
      },
      {
        externalId: "page-1",
        data: {
          kind: "doc",
          title: "Project Notes",
          docType: "wiki",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Project Notes" }] }],
          },
          metadata_json: { external_id: "page-1", source: "notion" },
        },
      },
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.notion.com/v1/databases/db-1/query",
      "https://api.notion.com/v1/search",
    ]);
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer token");
  });

  it("does not duplicate rows or pages when pulled again", async () => {
    const connector = new NotionConnector({
      token: "token",
      databaseId: "db-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.url.endsWith("/v1/databases/db-1/query")) {
          return Response.json({ results: [{ id: "task-1", properties: { Name: { title: [{ plain_text: "Task" }] } } }] });
        }
        return Response.json({ results: [{ id: "page-1", object: "page", properties: {} }] });
      },
    });
    connector.enable();

    await connector.pull();
    const result = await connector.pull();

    expect(result).toEqual({ pulled: 0, pushed: 0, skipped: 2, errors: [] });
    expect(connector.pulledItems).toHaveLength(2);
  });

  it("reports auth_failed health on Notion auth failure", async () => {
    const connector = new NotionConnector({
      token: "bad",
      databaseId: "db-1",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });

  it("reports ok health when Notion user endpoint succeeds", async () => {
    const connector = new NotionConnector({
      token: "token",
      databaseId: "db-1",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        expect(request.url).toBe("https://api.notion.com/v1/users/me");
        return Response.json({ object: "user", id: "user-1" });
      },
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: true,
      status: "ok",
    });
  });
});
