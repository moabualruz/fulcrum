import { describe, expect, it } from "bun:test";

import { BitbucketConnector } from "../../../services/integration-hub/src/application/external-connectors/bitbucket.ts";

describe("BitbucketConnector", () => {
  it("is disabled by default and requires explicit enablement before sync", async () => {
    const connector = new BitbucketConnector({ token: "token", workspace: "acme", repoSlug: "repo" });

    await expect(connector.pull()).rejects.toThrow("connector disabled: connector-bitbucket");
  });

  it("pulls branches, commits, and pull requests into repo supervision items", async () => {
    const requests: Request[] = [];
    const connector = new BitbucketConnector({
      token: "token",
      workspace: "acme",
      repoSlug: "repo",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/refs/branches")) {
          return Response.json({
            values: [
              { name: "main", target: { hash: "abc123" }, mainbranch: true },
              { name: "feature/api", target: { hash: "def456" } },
            ],
          });
        }
        if (request.url.endsWith("/commits?pagelen=20")) {
          return Response.json({
            values: [
              {
                hash: "abc123",
                message: "Initial commit",
                author: { raw: "Ada <ada@example.test>" },
                date: "2026-05-01T12:00:00+00:00",
              },
            ],
          });
        }
        if (request.url.endsWith("/pullrequests?state=OPEN")) {
          return Response.json({
            values: [
              {
                id: 5,
                title: "Add API",
                state: "OPEN",
                source: { branch: { name: "feature/api" } },
                destination: { branch: { name: "main" } },
                links: { html: { href: "https://bitbucket.org/acme/repo/pull-requests/5" } },
              },
            ],
          });
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
          message: "Initial commit",
          author: "Ada <ada@example.test>",
          committedAt: "2026-05-01T12:00:00+00:00",
        },
      },
      {
        externalId: "pr:5",
        data: {
          kind: "pull_request",
          number: 5,
          title: "Add API",
          state: "OPEN",
          sourceBranch: "feature/api",
          targetBranch: "main",
          url: "https://bitbucket.org/acme/repo/pull-requests/5",
        },
      },
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.bitbucket.org/2.0/repositories/acme/repo/refs/branches",
      "https://api.bitbucket.org/2.0/repositories/acme/repo/commits?pagelen=20",
      "https://api.bitbucket.org/2.0/repositories/acme/repo/pullrequests?state=OPEN",
    ]);
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer token");
  });

  it("reports auth_failed health on Bitbucket auth failure", async () => {
    const connector = new BitbucketConnector({
      token: "bad",
      workspace: "acme",
      repoSlug: "repo",
      fetch: async () => new Response(null, { status: 401 }),
    });
    connector.enable();

    await expect(connector.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: "auth_failed",
    });
  });

  it("treats push as read-only no-op", async () => {
    const connector = new BitbucketConnector({ token: "token", workspace: "acme", repoSlug: "repo" });
    connector.enable();

    await expect(connector.push([{ externalId: "branch:main", data: {} }])).resolves.toEqual({
      pulled: 0,
      pushed: 0,
      skipped: 1,
      errors: [],
    });
  });
});
