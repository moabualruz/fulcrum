// Vitest/Bun tests for Linear, Jira, Plane importers.
// TDD: RED (written before asserting green).

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { CredentialRepository, HttpClient } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCredentials(store: Record<string, string>): CredentialRepository {
  return {
    async get(key: string) {
      return store[key] ?? null;
    },
  };
}

function makeHttp(responses: Record<string, unknown>): HttpClient {
  return {
    async get(url: string) {
      const key = Object.keys(responses).find((k) => url.includes(k));
      if (!key) throw new Error(`Unexpected GET ${url}`);
      return responses[key];
    },
    async post(_url: string, _headers: unknown, _body: unknown) {
      // return first value for GraphQL POST mocks
      return Object.values(responses)[0];
    },
  };
}

// ---------------------------------------------------------------------------
// Feature gate env helpers
// ---------------------------------------------------------------------------

function enableFeature(name: string) {
  const existing = process.env["FULCRUM_FEATURES"] ?? "";
  const features = existing.split(",").filter(Boolean);
  if (!features.includes(name)) features.push(name);
  process.env["FULCRUM_FEATURES"] = features.join(",");
}

function disableFeature(name: string) {
  const existing = process.env["FULCRUM_FEATURES"] ?? "";
  const features = existing.split(",").filter((f) => f !== name);
  process.env["FULCRUM_FEATURES"] = features.join(",");
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

describe("importFromLinear", () => {
  const savedEnv = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (savedEnv !== undefined) process.env["FULCRUM_FEATURES"] = savedEnv;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("OFF: throws 'Feature import-linear not enabled'", async () => {
    disableFeature("import-linear");
    const { importFromLinear } = await import("./linear.ts");
    await expect(
      importFromLinear("team-1", makeCredentials({}), makeHttp({}))
    ).rejects.toThrow("Feature import-linear not enabled");
  });

  test("ON + missing API key → credential error", async () => {
    enableFeature("import-linear");
    const { importFromLinear } = await import("./linear.ts");
    await expect(
      importFromLinear("team-1", makeCredentials({}), makeHttp({}))
    ).rejects.toThrow("Credential 'LINEAR_API_KEY' not found");
  });

  test("ON + API key → 5 tasks mapped correctly", async () => {
    enableFeature("import-linear");
    const { importFromLinear } = await import("./linear.ts");

    const mockResponse = {
      data: {
        issues: {
          nodes: Array.from({ length: 5 }, (_, i) => ({
            id: `linear-${i + 1}`,
            title: `Task ${i + 1}`,
            description: `Desc ${i + 1}`,
            state: { name: "In Progress" },
            priority: 2,
            assignee: { name: "Alice" },
            labels: { nodes: [{ name: "bug" }] },
            dueDate: "2026-06-01",
          })),
        },
      },
    };

    const creds = makeCredentials({ LINEAR_API_KEY: "lin_api_test_key" });
    const http = makeHttp({ "linear.app": mockResponse });

    const result = await importFromLinear("team-1", creds, http);
    expect(result.imported).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test("ON + dry-run → imported=0", async () => {
    enableFeature("import-linear");
    const { importFromLinear } = await import("./linear.ts");

    const mockResponse = {
      data: {
        issues: {
          nodes: [
            { id: "l1", title: "T1", description: "", state: { name: "Todo" }, priority: 1, assignee: null, labels: { nodes: [] }, dueDate: null },
          ],
        },
      },
    };

    const result = await importFromLinear(
      "team-1",
      makeCredentials({ LINEAR_API_KEY: "key" }),
      makeHttp({ "linear.app": mockResponse }),
      { dryRun: true },
    );
    expect(result.imported).toBe(0);
  });

  test("Linear field mapping: labels, status, priority, assignee", async () => {
    enableFeature("import-linear");
    const { importFromLinear } = await import("./linear.ts");

    const mockResponse = {
      data: {
        issues: {
          nodes: [
            {
              id: "l1",
              title: "Fix bug",
              description: "details",
              state: { name: "Done" },
              priority: 1,
              assignee: { name: "Bob" },
              labels: { nodes: [{ name: "backend" }, { name: "p0" }] },
              dueDate: "2026-12-31",
            },
          ],
        },
      },
    };

    // We need to inspect the mapped tasks — modify test to use fieldmap directly
    const { mapLinearIssue } = await import("./linear.fieldmap.ts");
    const task = mapLinearIssue({
      id: "l1",
      title: "Fix bug",
      description: "details",
      state: { name: "Done" },
      priority: 1,
      assignee: { name: "Bob" },
      labels: { nodes: [{ name: "backend" }, { name: "p0" }] },
      dueDate: "2026-12-31",
    });

    expect(task.title).toBe("Fix bug");
    expect(task.status).toBe("Done");
    expect(task.priority).toBe(1);
    expect(task.assignee).toBe("Bob");
    expect(task.labels).toEqual(["backend", "p0"]);
    expect(task.due_date).toBe("2026-12-31");
    expect(task.custom_fields["linear_issue_id"]).toBe("l1");
  });
});

// ---------------------------------------------------------------------------
// Jira
// ---------------------------------------------------------------------------

describe("importFromJira", () => {
  const savedEnv = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (savedEnv !== undefined) process.env["FULCRUM_FEATURES"] = savedEnv;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("OFF: throws 'Feature import-jira not enabled'", async () => {
    disableFeature("import-jira");
    const { importFromJira } = await import("./jira.ts");
    await expect(
      importFromJira("PROJ", makeCredentials({}), makeHttp({}))
    ).rejects.toThrow("Feature import-jira not enabled");
  });

  test("ON + missing JIRA_HOST → credential error", async () => {
    enableFeature("import-jira");
    const { importFromJira } = await import("./jira.ts");
    await expect(
      importFromJira("PROJ", makeCredentials({}), makeHttp({}))
    ).rejects.toThrow("Credential 'JIRA_HOST' not found");
  });

  test("ON + all creds → tasks mapped; reporter→assignee; story_points→estimate; jira_issue_id in custom_fields", async () => {
    enableFeature("import-jira");
    const { importFromJira } = await import("./jira.ts");

    const creds = makeCredentials({
      JIRA_HOST: "https://example.atlassian.net",
      JIRA_EMAIL: "user@example.com",
      JIRA_API_TOKEN: "token123",
    });

    const mockResponse = {
      issues: [
        {
          id: "10001",
          key: "PROJ-1",
          fields: {
            summary: "Fix login bug",
            description: "Some description",
            status: { name: "In Progress" },
            priority: { name: "High" },
            reporter: { displayName: "Charlie" },
            assignee: null,
            labels: ["auth", "critical"],
            duedate: "2026-07-15",
            story_points: 5,
          },
        },
      ],
    };

    const http = makeHttp({ "atlassian.net": mockResponse });
    const result = await importFromJira("PROJ", creds, http);
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("Jira field mapping: reporter→assignee, story_points→estimate, jira_issue_id in custom_fields", async () => {
    const { mapJiraIssue } = await import("./jira.fieldmap.ts");
    const task = mapJiraIssue({
      id: "10001",
      key: "PROJ-1",
      fields: {
        summary: "Fix login",
        description: "desc",
        status: { name: "Open" },
        priority: { name: "High" },
        reporter: { displayName: "Charlie" },
        assignee: null,
        labels: ["auth"],
        duedate: "2026-07-15",
        story_points: 5,
      },
    });
    expect(task.assignee).toBe("Charlie");
    expect(task.estimate).toBe(5);
    expect(task.custom_fields["jira_issue_id"]).toBe("10001");
    expect(task.custom_fields["jira_issue_key"]).toBe("PROJ-1");
    expect(task.priority).toBe(1); // High → 1
  });

  test("Jira dry-run → imported=0", async () => {
    enableFeature("import-jira");
    const { importFromJira } = await import("./jira.ts");

    const creds = makeCredentials({
      JIRA_HOST: "https://example.atlassian.net",
      JIRA_EMAIL: "user@example.com",
      JIRA_API_TOKEN: "token",
    });
    const mockResponse = {
      issues: [
        { id: "1", key: "P-1", fields: { summary: "T1", description: "", status: { name: "Open" }, priority: { name: "Low" }, reporter: null, assignee: null, labels: [], duedate: null } },
      ],
    };

    const result = await importFromJira("P", creds, makeHttp({ "atlassian.net": mockResponse }), { dryRun: true });
    expect(result.imported).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

describe("importFromPlane", () => {
  const savedEnv = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (savedEnv !== undefined) process.env["FULCRUM_FEATURES"] = savedEnv;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("OFF: throws 'Feature import-plane not enabled'", async () => {
    disableFeature("import-plane");
    const { importFromPlane } = await import("./plane.ts");
    await expect(
      importFromPlane("workspace", "project", makeCredentials({}), makeHttp({}))
    ).rejects.toThrow("Feature import-plane not enabled");
  });

  test("ON + missing token → credential error", async () => {
    enableFeature("import-plane");
    const { importFromPlane } = await import("./plane.ts");
    await expect(
      importFromPlane("workspace", "project", makeCredentials({}), makeHttp({}))
    ).rejects.toThrow("Credential 'PLANE_API_TOKEN' not found");
  });

  test("ON + token → tasks mapped", async () => {
    enableFeature("import-plane");
    const { importFromPlane } = await import("./plane.ts");

    const creds = makeCredentials({ PLANE_API_TOKEN: "plane_token" });
    const mockResponse = {
      results: [
        {
          id: "plane-1",
          name: "Build UI",
          description_html: "<p>Details</p>",
          state_detail: { name: "In Progress" },
          priority: "high",
          assignee_details: [{ display_name: "Dana" }],
          label_details: [{ name: "frontend" }],
          due_date: "2026-08-01",
          estimate_point: 3,
        },
      ],
    };

    const result = await importFromPlane("ws", "proj", creds, makeHttp({ "plane.so": mockResponse }));
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("Plane field mapping", async () => {
    const { mapPlaneIssue } = await import("./plane.fieldmap.ts");
    const task = mapPlaneIssue({
      id: "plane-1",
      name: "Build UI",
      description_html: "<p>Details</p>",
      state_detail: { name: "In Progress" },
      priority: "high",
      assignee_details: [{ display_name: "Dana" }],
      label_details: [{ name: "frontend" }],
      due_date: "2026-08-01",
      estimate_point: 3,
    });

    expect(task.title).toBe("Build UI");
    expect(task.status).toBe("In Progress");
    expect(task.priority).toBe(1); // high → 1
    expect(task.assignee).toBe("Dana");
    expect(task.labels).toEqual(["frontend"]);
    expect(task.estimate).toBe(3);
    expect(task.custom_fields["plane_issue_id"]).toBe("plane-1");
  });

  test("Plane dry-run → imported=0", async () => {
    enableFeature("import-plane");
    const { importFromPlane } = await import("./plane.ts");

    const creds = makeCredentials({ PLANE_API_TOKEN: "token" });
    const mockResponse = {
      results: [{ id: "p1", name: "T1" }],
    };

    const result = await importFromPlane("ws", "proj", creds, makeHttp({ "plane.so": mockResponse }), { dryRun: true });
    expect(result.imported).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CLI runImport / formatImportResult
// ---------------------------------------------------------------------------

describe("runImport", () => {
  const savedEnv = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (savedEnv !== undefined) process.env["FULCRUM_FEATURES"] = savedEnv;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("unknown format → error", async () => {
    const { runImport } = await import("@fulcrum/cli/import-pm.ts");
    await expect(
      runImport({
        format: "notion",
        project: "p",
        dryRun: false,
        json: false,
        credentials: makeCredentials({}),
        http: makeHttp({}),
      })
    ).rejects.toThrow("Unknown import format");
  });

  test("formatImportResult --json", async () => {
    const { formatImportResult } = await import("@fulcrum/cli/import-pm.ts");
    const result = { imported: 5, skipped: 1, errors: [] };
    const out = formatImportResult(result, true);
    expect(JSON.parse(out)).toEqual(result);
  });

  test("formatImportResult text", async () => {
    const { formatImportResult } = await import("@fulcrum/cli/import-pm.ts");
    const result = { imported: 3, skipped: 0, errors: [] };
    const out = formatImportResult(result, false);
    expect(out).toContain("imported: 3");
    expect(out).toContain("skipped: 0");
  });
});
