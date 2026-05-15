import { describe, expect, it } from "bun:test";

import { ConfluenceConnector } from "../../../services/integration-hub/src/application/external-connectors/confluence.ts";

describe("ConfluenceConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new ConfluenceConnector({
      url: "https://example.atlassian.net/wiki",
      token: "token",
      spaceKey: "FUL",
    });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-confluence");
  });

  it("pulls Confluence pages and maps them to wiki docs", async () => {
    const requests: Request[] = [];
    const connector = new ConfluenceConnector({
      url: "https://example.atlassian.net/wiki",
      token: "token",
      spaceKey: "FUL",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          results: [
            {
              id: "123",
              title: "Runbook",
              space: { key: "FUL" },
              body: { storage: { value: "<p>Deploy safely</p>" } },
            },
          ],
        });
      },
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 1, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "123",
        data: {
          title: "Runbook",
          docType: "wiki",
          scope: "project",
          spaceKey: "FUL",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Deploy safely" }] }],
          },
          metadata_json: { external_id: "123", source: "confluence" },
        },
      },
    ]);
    expect(requests[0]!.url).toBe(
      "https://example.atlassian.net/wiki/rest/api/content?spaceKey=FUL&expand=body.storage,space",
    );
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer token");
  });

  it("does not duplicate pages when pulled again", async () => {
    const connector = new ConfluenceConnector({
      url: "https://example.atlassian.net/wiki",
      token: "token",
      spaceKey: "FUL",
      fetch: async () =>
        Response.json({
          results: [{ id: "123", title: "Runbook", body: { storage: { value: "<p>Deploy safely</p>" } } }],
        }),
    });
    connector.enable();

    await connector.pull();
    const result = await connector.pull();

    expect(result).toEqual({ pulled: 0, pushed: 0, skipped: 1, errors: [] });
    expect(connector.pulledItems).toHaveLength(1);
  });

  it("reports auth_failed health on Confluence auth failure", async () => {
    const connector = new ConfluenceConnector({
      url: "https://example.atlassian.net/wiki",
      token: "bad",
      spaceKey: "FUL",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });

  it("reports ok health when Confluence space endpoint succeeds", async () => {
    const connector = new ConfluenceConnector({
      url: "https://example.atlassian.net/wiki",
      token: "token",
      spaceKey: "FUL",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        expect(request.url).toBe("https://example.atlassian.net/wiki/rest/api/space/FUL");
        return Response.json({ key: "FUL" });
      },
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: true,
      status: "ok",
    });
  });
});
