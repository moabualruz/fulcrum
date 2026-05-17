/**
 * Tests for CLI report subcommands, task-relate, task-hierarchy, comment, project-config.
 */

import { describe, expect, it } from "bun:test";

// ─── report command ───────────────────────────────────────────────────────────

describe("report command", () => {
  it("outputs JSON for burndown --format json", async () => {
    const { run } = await import("./report.ts");
    const lines: string[] = [];
    const burndownData = [
      { day: 1, ideal: 20, actual: 20 },
      { day: 2, ideal: 18, actual: 19 },
    ];

    await run(["burndown", "--project", "proj_01", "--format", "json"], {
      caller: {
        reports: {
          burndown: async () => burndownData,
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    const parsed = JSON.parse(lines.join(""));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("day");
  });

  it("routes burndown through the configured public API", async () => {
    const { run } = await import("./report.ts");
    const lines: string[] = [];
    const calls: Array<{ url: string; method: string | undefined }> = [];

    await run(["burndown", "--project", "project-1", "--sprint", "sprint-1", "--json"], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        return Response.json({ data: [{ date: "2026-05-15", remaining: 5 }] });
      }) as typeof fetch,
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3210/api/v1/reports/burndown?orgId=org-1&projectId=project-1&sprintId=sprint-1",
        method: "GET",
      },
    ]);
    expect(JSON.parse(lines.join("\n"))).toEqual({ data: [{ date: "2026-05-15", remaining: 5 }] });
  });

  it("requires a configured public API without injected caller", async () => {
    const { run } = await import("./report.ts");
    const errors: string[] = [];
    const exits: number[] = [];

    await run(["burndown", "--project", "project-1", "--json"], {
      env: {},
      fetch: (async () => {
        throw new Error("fetch should not run without API configuration");
      }) as unknown as typeof fetch,
      print: () => undefined,
      printErr: (line) => errors.push(line),
      exit: (code) => exits.push(code),
    });

    expect(errors.join("\n")).toContain("Report API caller is not configured");
    expect(exits).toEqual([1]);
  });

  it("outputs table for velocity --format table", async () => {
    const { run } = await import("./report.ts");
    const lines: string[] = [];

    await run(["velocity", "--project", "proj_01", "--format", "table"], {
      caller: {
        reports: {
          velocity: async () => [{ sprint: "Sprint 1", points: 42 }],
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(lines.join("\n")).toContain("Sprint 1");
    expect(lines.join("\n")).toContain("42");
  });

  it("outputs CSV for throughput --format csv", async () => {
    const { run } = await import("./report.ts");
    const lines: string[] = [];

    await run(["throughput", "--project", "proj_01", "--format", "csv"], {
      caller: {
        reports: {
          throughput: async () => [{ week: "2024-W01", count: 5 }],
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    const output = lines.join("\n");
    expect(output).toContain("week");
    expect(output).toContain("2024-W01");
  });

  it("prints help for unknown subcommand", async () => {
    const { run } = await import("./report.ts");
    const errors: string[] = [];
    let exitCode: number | undefined;

    await run(["unknown-type"], {
      caller: { reports: {} },
      print: () => undefined,
      printErr: (line) => errors.push(line),
      exit: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(2);
  });
});

// ─── task-relate command ──────────────────────────────────────────────────────

describe("task-relate command", () => {
  it("creates a relationship via caller", async () => {
    const { run } = await import("./task-relate.ts");
    const lines: string[] = [];
    let created: unknown;

    await run(["task_01", "blocks", "task_02"], {
      caller: {
        relationships: {
          create: async (input: unknown) => { created = input; return { id: "rel_01" }; },
          listForTask: async () => [],
          delete: async () => ({ ok: true }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(created).toEqual({ sourceTaskId: "task_01", targetTaskId: "task_02", type: "blocks" });
    expect(lines.join("\n")).toContain("rel_01");
  });

  it("lists relationships with --list flag", async () => {
    const { run } = await import("./task-relate.ts");
    const lines: string[] = [];

    await run(["task_01", "--list"], {
      caller: {
        relationships: {
          create: async () => ({ id: "rel_01" }),
          listForTask: async () => [
            { id: "rel_01", type: "blocks", relatedTaskTitle: "Fix bug", direction: "outgoing" },
          ],
          delete: async () => ({ ok: true }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(lines.join("\n")).toContain("blocks");
    expect(lines.join("\n")).toContain("Fix bug");
  });
});

// ─── task-hierarchy command ───────────────────────────────────────────────────

describe("task-hierarchy command", () => {
  it("renders tree with box-drawing characters", async () => {
    const { run } = await import("./task-hierarchy.ts");
    const lines: string[] = [];

    await run(["tree", "task_01"], {
      caller: {
        tasks: {
          tree: async () => ({
            id: "task_01",
            title: "User Auth",
            type: "epic",
            status: "in_progress",
            assignee: null,
            points: null,
            children: [
              { id: "task_02", title: "Login page", type: "task", status: "todo", assignee: null, points: 3, children: [] },
            ],
          }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    const output = lines.join("\n");
    expect(output).toContain("User Auth");
    expect(output).toContain("Login page");
    // box-drawing chars
    expect(output).toMatch(/[├└─│◆●○⚠]/);
  });
});

// ─── comment command ──────────────────────────────────────────────────────────

describe("comment command", () => {
  it("adds comment via caller", async () => {
    const { run } = await import("./comment.ts");
    const lines: string[] = [];
    let created: unknown;

    await run(["add", "task_01", "Hello world"], {
      caller: {
        comments: {
          create: async (input: unknown) => { created = input; return { id: "cmt_01" }; },
          threaded: async () => [],
          resolve: async () => ({ ok: true }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect((created as { taskId: string }).taskId).toBe("task_01");
    expect(lines.join("\n")).toContain("cmt_01");
  });

  it("renders threaded comments with indent", async () => {
    const { run } = await import("./comment.ts");
    const lines: string[] = [];

    await run(["list", "task_01"], {
      caller: {
        comments: {
          create: async () => ({ id: "cmt_01" }),
          threaded: async () => [
            {
              id: "cmt_01",
              author: "alice",
              body: "First comment",
              createdAt: new Date("2024-01-01T10:00:00Z"),
              replies: [
                {
                  id: "cmt_02",
                  author: "bob",
                  body: "Reply to alice",
                  createdAt: new Date("2024-01-01T11:00:00Z"),
                  replies: [],
                },
              ],
            },
          ],
          resolve: async () => ({ ok: true }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    const output = lines.join("\n");
    expect(output).toContain("alice");
    expect(output).toContain("First comment");
    expect(output).toContain("↳");
    expect(output).toContain("bob");
  });
});

// ─── project-config command ───────────────────────────────────────────────────

describe("project-config command", () => {
  it("displays current methodology", async () => {
    const { run } = await import("./project-config.ts");
    const lines: string[] = [];

    await run(["proj_01"], {
      caller: {
        workflows: {
          getMethodology: async () => ({
            methodology: "kanban",
            enabledTaskTypes: ["epic", "task", "subtask", "bug"],
            transitionCount: 4,
          }),
          updateMethodology: async () => ({ ok: true }),
          updateEnabledTaskTypes: async () => ({ ok: true }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    const output = lines.join("\n");
    expect(output).toContain("kanban");
    expect(output).toContain("epic");
  });

  it("sets methodology via --methodology flag", async () => {
    const { run } = await import("./project-config.ts");
    const lines: string[] = [];
    let updated: unknown;

    await run(["proj_01", "--methodology", "scrum"], {
      caller: {
        workflows: {
          getMethodology: async () => ({ methodology: "scrum", enabledTaskTypes: [], transitionCount: 0 }),
          updateMethodology: async (input: unknown) => { updated = input; return { ok: true }; },
          updateEnabledTaskTypes: async () => ({ ok: true }),
        },
      },
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: () => undefined,
    });

    expect(updated).toEqual({ projectId: "proj_01", methodology: "scrum" });
  });
});
