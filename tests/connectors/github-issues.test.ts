import { describe, expect, it } from "bun:test";

import { GitHubIssuesConnector } from "../../src/connectors/github-issues.ts";

describe("GitHubIssuesConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new GitHubIssuesConnector({ token: "token", repo: "owner/repo" });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-github-issues");
  });

  it("pulls GitHub issues and maps task fields", async () => {
    const requests: Request[] = [];
    const connector = new GitHubIssuesConnector({
      token: "token",
      repo: "owner/repo",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json([
          {
            id: 10001,
            number: 42,
            title: "Ship GitHub connector",
            state: "closed",
            assignees: [{ login: "owner" }],
            labels: [{ name: "api" }, { name: "sync" }],
          },
        ]);
      },
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 1, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "42",
        data: {
          id: 10001,
          title: "Ship GitHub connector",
          status: "done",
          assignee: "owner",
          labels: ["api", "sync"],
          metadata_json: { external_id: 42 },
        },
      },
    ]);
    expect(requests[0]!.url).toBe("https://api.github.com/repos/owner/repo/issues");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer token");
  });

  it("pushes title, state, and labels updates to GitHub", async () => {
    const requests: Request[] = [];
    const connector = new GitHubIssuesConnector({
      token: "token",
      repo: "owner/repo",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({ number: 42 });
      },
    });
    connector.enable();

    const result = await connector.push([
      {
        externalId: "42",
        data: { title: "Finished connector", status: "done", labels: ["api", "sync"] },
      },
    ]);

    expect(result).toEqual({ pulled: 0, pushed: 1, skipped: 0, errors: [] });
    expect(requests[0]!.method).toBe("PATCH");
    expect(requests[0]!.url).toBe("https://api.github.com/repos/owner/repo/issues/42");
    expect(await requests[0]!.json()).toEqual({
      title: "Finished connector",
      state: "closed",
      labels: ["api", "sync"],
    });
  });

  it("reports auth_failed health on GitHub auth failure", async () => {
    const connector = new GitHubIssuesConnector({
      token: "bad",
      repo: "owner/repo",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });
});
