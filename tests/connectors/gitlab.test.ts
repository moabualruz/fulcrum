import { describe, expect, it } from "bun:test";

import { GitLabConnector } from "../../src/connectors/gitlab.ts";

describe("GitLabConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new GitLabConnector({ token: "token", projectId: "group/project" });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-gitlab");
  });

  it("pulls branches, commits, and merge requests into repo supervision items", async () => {
    const requests: Request[] = [];
    const connector = new GitLabConnector({
      token: "token",
      projectId: "group/project",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/repository/branches")) {
          return Response.json([
            { name: "main", default: true, commit: { id: "abc123" } },
            { name: "feature/api", default: false, commit: { id: "def456" } },
          ]);
        }
        if (request.url.endsWith("/repository/commits?per_page=20")) {
          return Response.json([
            {
              id: "abc123",
              title: "Initial commit",
              message: "Initial commit\n",
              author_name: "Ada",
              committed_date: "2026-05-01T12:00:00.000Z",
            },
          ]);
        }
        if (request.url.endsWith("/merge_requests?state=opened")) {
          return Response.json([
            {
              iid: 7,
              title: "Add API",
              state: "opened",
              source_branch: "feature/api",
              target_branch: "main",
              web_url: "https://gitlab.example/group/project/-/merge_requests/7",
            },
          ]);
        }
        throw new Error(`unexpected URL ${request.url}`);
      },
    });
    connector.enable();

    const result = await connector.pull();

    expect(result).toEqual({ pulled: 4, pushed: 0, skipped: 0, errors: [] });
    expect(connector.pulledItems).toEqual([
      {
        externalId: "branch:main",
        data: { kind: "branch", name: "main", sha: "abc123", isDefault: true },
      },
      {
        externalId: "branch:feature/api",
        data: { kind: "branch", name: "feature/api", sha: "def456", isDefault: false },
      },
      {
        externalId: "commit:abc123",
        data: {
          kind: "commit",
          sha: "abc123",
          message: "Initial commit\n",
          author: "Ada",
          committedAt: "2026-05-01T12:00:00.000Z",
        },
      },
      {
        externalId: "pr:7",
        data: {
          kind: "pull_request",
          number: 7,
          title: "Add API",
          state: "opened",
          sourceBranch: "feature/api",
          targetBranch: "main",
          url: "https://gitlab.example/group/project/-/merge_requests/7",
        },
      },
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      "https://gitlab.com/api/v4/projects/group%2Fproject/repository/branches",
      "https://gitlab.com/api/v4/projects/group%2Fproject/repository/commits?per_page=20",
      "https://gitlab.com/api/v4/projects/group%2Fproject/merge_requests?state=opened",
    ]);
    expect(requests[0]!.headers.get("private-token")).toBe("token");
  });

  it("reports auth_failed health on GitLab auth failure", async () => {
    const connector = new GitLabConnector({
      token: "bad",
      projectId: "group/project",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });

  it("treats push as read-only no-op", async () => {
    const connector = new GitLabConnector({ token: "token", projectId: "group/project" });
    connector.enable();

    await expect(connector.push([{ externalId: "branch:main", data: {} }])).resolves.toEqual({
      pulled: 0,
      pushed: 0,
      skipped: 1,
      errors: [],
    });
  });
});
