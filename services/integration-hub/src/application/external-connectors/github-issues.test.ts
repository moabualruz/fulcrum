import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { runConnectorJob } from "./framework.ts";
import { GitHubIssuesConnector, parseLinkHeader } from "./github-issues.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-gh-connector-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

// ---------------------------------------------------------------------------
// Mock GitHub API responses
// ---------------------------------------------------------------------------

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: "Test issue",
    body: "Description",
    state: "open",
    labels: [{ name: "bug", color: "d73a4a" }],
    milestone: null,
    assignees: [{ login: "octocat" }],
    ...overrides,
  };
}

function mockFetch(pages: Record<string, unknown>[][], perPageSize = 100) {
  let callCount = 0;
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pageIndex = callCount++;
    const issues = pages[pageIndex] ?? [];
    const hasNext = pageIndex < pages.length - 1;
    const nextUrl = `https://api.github.com/repos/test/repo/issues?state=all&per_page=${perPageSize}&page=${pageIndex + 2}`;

    return new Response(JSON.stringify(issues), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...(hasNext ? { Link: `<${nextUrl}>; rel="next"` } : {}),
      },
    });
  };
}

describe("parseLinkHeader", () => {
  test("extracts next URL from Link header", () => {
    const header = '<https://api.github.com/repos/foo/bar/issues?page=2>; rel="next", <https://api.github.com/repos/foo/bar/issues?page=5>; rel="last"';
    expect(parseLinkHeader(header)).toBe("https://api.github.com/repos/foo/bar/issues?page=2");
  });

  test("returns null when no next", () => {
    expect(parseLinkHeader('<https://example.com>; rel="last"')).toBeNull();
    expect(parseLinkHeader(null)).toBeNull();
  });
});

describe("GitHubIssuesConnector", () => {
  test("fetches paginated issues and maps fields", async () => {
    const page1 = [
      makeIssue({ number: 1, title: "First", state: "open", labels: [{ name: "bug" }] }),
      makeIssue({ number: 2, title: "Second", state: "closed", labels: [] }),
    ];
    const page2 = [
      makeIssue({ number: 3, title: "Third", state: "open", milestone: {
        number: 1, title: "v1.0", created_at: "2025-01-01T00:00:00Z", due_on: "2025-01-31T00:00:00Z",
      }}),
    ];

    const connector = new GitHubIssuesConnector({
      token: "ghp_test",
      repo: "test/repo",
      fetchFn: mockFetch([page1, page2]) as typeof globalThis.fetch,
    });

    const items = await connector.fetch();
    expect(items.length).toBe(3);

    expect(items[0]!.external_id).toBe("github:1");
    expect(items[0]!.title).toBe("First");
    expect(items[0]!.status).toBe("pending");
    expect(items[0]!.labels).toEqual(["bug"]);
    expect(items[0]!.assignee).toBe("octocat");

    expect(items[1]!.external_id).toBe("github:2");
    expect(items[1]!.status).toBe("completed");

    expect(items[2]!.sprint_external_id).toBe("github:milestone:1");
    expect(items[2]!.sprint_title).toBe("v1.0");
    expect(items[2]!.sprint_end_date).toBe("2025-01-31T00:00:00Z");
  });

  test("skips pull requests", async () => {
    const issues = [
      makeIssue({ number: 1, title: "Issue" }),
      { ...makeIssue({ number: 2, title: "PR" }), pull_request: { url: "..." } },
    ];

    const connector = new GitHubIssuesConnector({
      token: "ghp_test",
      repo: "test/repo",
      fetchFn: mockFetch([issues]) as typeof globalThis.fetch,
    });

    const items = await connector.fetch();
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Issue");
  });

  test("flag OFF prevents sync — no HTTP call", async () => {
    const db = await freshDb("flagoff");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      delete process.env["FULCRUM_FEATURES"];
      const org = await createLocalOrg(db, { slug: "o", name: "O" });

      let called = false;
      const connector = new GitHubIssuesConnector({
        token: "ghp_test",
        repo: "test/repo",
        fetchFn: (async () => { called = true; return new Response("[]"); }) as unknown as typeof globalThis.fetch,
      });

      await expect(runConnectorJob(db, connector, org.id)).rejects.toThrow(
        "not enabled",
      );
      expect(called).toBe(false);
    } finally {
      if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("full sync imports issues with labels and milestones", async () => {
    const db = await freshDb("fullsync");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-github-issues";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });

      const issues = [
        makeIssue({
          number: 10,
          title: "Login bug",
          state: "open",
          labels: [{ name: "bug" }, { name: "P1" }],
          milestone: {
            number: 5,
            title: "Sprint 3",
            created_at: "2025-03-01T00:00:00Z",
            due_on: "2025-03-15T00:00:00Z",
          },
          assignees: [{ login: "alice" }],
        }),
        makeIssue({
          number: 11,
          title: "Docs update",
          state: "closed",
          labels: [{ name: "docs" }],
          milestone: {
            number: 5,
            title: "Sprint 3",
            created_at: "2025-03-01T00:00:00Z",
            due_on: "2025-03-15T00:00:00Z",
          },
          assignees: [],
        }),
      ];

      const connector = new GitHubIssuesConnector({
        token: "ghp_test",
        repo: "test/repo",
        fetchFn: mockFetch([issues]) as typeof globalThis.fetch,
      });

      const result = await runConnectorJob(db, connector, org.id);
      expect(result.imported).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);

      // Verify tasks.
      const tasks = await db.query<{ external_id: string; title: string; status: string; assignee: string | null; sprint_id: string | null }>(
        `SELECT external_id, title, status, assignee, sprint_id FROM tasks WHERE org_id = $1 ORDER BY external_id`,
        [org.id],
      );
      expect(tasks.length).toBe(2);
      expect(tasks[0]!.external_id).toBe("github:10");
      expect(tasks[0]!.status).toBe("pending");
      expect(tasks[0]!.assignee).toBe("alice");
      expect(tasks[0]!.sprint_id).toBeTruthy();
      expect(tasks[1]!.external_id).toBe("github:11");
      expect(tasks[1]!.status).toBe("completed");
      expect(tasks[1]!.assignee).toBeNull();

      // Both tasks share same sprint.
      expect(tasks[0]!.sprint_id).toBe(tasks[1]!.sprint_id);

      // Verify sprint.
      const sprints = await db.query<{ title: string; external_id: string }>(
        `SELECT title, external_id FROM sprints WHERE org_id = $1`,
        [org.id],
      );
      expect(sprints.length).toBe(1);
      expect(sprints[0]!.title).toBe("Sprint 3");

      // Verify labels — bug, P1, docs.
      const labels = await db.query<{ name: string }>(
        `SELECT name FROM labels WHERE org_id = $1 ORDER BY name`,
        [org.id],
      );
      expect(labels.map((l) => l.name)).toEqual(["P1", "bug", "docs"]);

      // Verify --json shape.
      expect(result).toEqual({ imported: 2, updated: 0, errors: 0 });
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });
});
