import { describe, expect, it } from "bun:test";

import { LinearConnector } from "../../src/connectors/linear.ts";

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
        externalId: "FUL-1",
        data: {
          id: "lin-1",
          title: "Ship Linear connector",
          status: "done",
          sprint: "Sprint 4",
          estimate: 5,
          assignee: "owner@example.com",
          labels: ["api", "sync"],
        },
      },
    ]);
    expect(requests[0]!.url).toBe("https://api.linear.app/graphql");
    expect(requests[0]!.headers.get("authorization")).toBe("key");
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
});
