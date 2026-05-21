/**
 * TDD: fulcrum symphony runs list --state ready --json.
 */

import { afterEach, describe, expect, it } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("symphony.run: runs list --state ready --json", () => {
  it("prints a valid JSON array from orchestration.fetchCandidateIssues", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const calls: unknown[] = [];

    await run(["runs", "list", "--state", "ready", "--limit", "1", "--json"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async (input: { orgId: string; limit: number }) => {
            calls.push(input);
            return [
              {
                id: "00000000-0000-0000-0000-000000000001",
                identifier: "00000000-0000-0000-0000-000000000001",
                title: "00000000-0000-0000-0000-000000000001",
                state: "ready",
                status: "ready",
                priority: 1,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                blockedByIds: [],
                workflowId: null,
              },
            ];
          },
        },
      },
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(calls).toEqual([{ orgId: DEFAULT_ORG_ID, limit: 1 }]);
    expect(printed).toHaveLength(1);
    const parsed = JSON.parse(printed[0] as string) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("uses the configured Nest run API when no test caller is injected", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return Response.json([
        {
          id: "00000000-0000-0000-0000-000000000001",
          identifier: "TASK-1",
          title: "Ready task",
          state: "ready",
          status: "ready",
          priority: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          blockedByIds: [],
          workflowId: null,
        },
      ]);
    }) as typeof fetch;

    await run(["runs", "list", "--state", "ready", "--limit", "1", "--json"], {
      env: {
        FULCRUM_PUBLIC_API_URL: "http://127.0.0.1:3210",
        FULCRUM_ORG_ID: DEFAULT_ORG_ID,
      },
      fetch: fetchFn,
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(calls).toEqual([{
      method: "GET",
      url: `http://127.0.0.1:3210/api/v1/symphony/candidates?orgId=${DEFAULT_ORG_ID}&limit=1`,
    }]);
    expect(JSON.parse(printed[0] as string)).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        identifier: "TASK-1",
        title: "Ready task",
        state: "ready",
        status: "ready",
        priority: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        blockedByIds: [],
        workflowId: null,
      },
    ]);
  });
});

describe("symphony.run: runs list --state <state> --json", () => {
  it("prints JSON from orchestration.fetchIssuesByStates for run states", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const calls: unknown[] = [];

    await run(["runs", "list", "--state", "running", "--limit", "2", "--json"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => {
            throw new Error("should not fetch candidate issues for run states");
          },
          fetchIssuesByStates: async (input: {
            orgId: string;
            states: string[];
            limit: number;
          }) => {
            calls.push(input);
            return [
              {
                id: "10000000-0000-0000-0000-000000000001",
                state: "running",
                orchestrationState: "running",
                task: {
                  id: "20000000-0000-0000-0000-000000000001",
                  status: "ready",
                  priority: 1,
                  createdAt: new Date("2026-02-01T00:00:00.000Z"),
                  blockedByIds: [],
                  workflowId: null,
                },
                startedAt: new Date("2026-02-01T01:00:00.000Z"),
                attemptCount: 1,
                nextRetryAt: null,
                workspacePath: null,
                lastErrorKind: null,
              },
            ];
          },
        },
      },
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(calls).toEqual([{
      orgId: DEFAULT_ORG_ID,
      states: ["running"],
      limit: 2,
    }]);
    expect(JSON.parse(printed[0] as string)).toEqual([
      {
        id: "10000000-0000-0000-0000-000000000001",
        state: "running",
        orchestrationState: "running",
        task: {
          id: "20000000-0000-0000-0000-000000000001",
          status: "ready",
          priority: 1,
          createdAt: "2026-02-01T00:00:00.000Z",
          blockedByIds: [],
          workflowId: null,
        },
        startedAt: "2026-02-01T01:00:00.000Z",
        attemptCount: 1,
        nextRetryAt: null,
        workspacePath: null,
        lastErrorKind: null,
      },
    ]);
  });

  it("routes active run state lists through the Nest run issue API", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return Response.json([
        {
          id: "10000000-0000-0000-0000-000000000001",
          state: "running",
          orchestrationState: "running",
          task: null,
          startedAt: "2026-02-01T01:00:00.000Z",
          attemptCount: 1,
          nextRetryAt: null,
          workspacePath: null,
          lastErrorKind: null,
        },
      ]);
    }) as typeof fetch;

    await run(["runs", "list", "--state", "running", "--limit", "2", "--json"], {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
        FULCRUM_ORG_ID: DEFAULT_ORG_ID,
      },
      fetch: fetchFn,
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(calls).toEqual([{
      method: "GET",
      url: `http://127.0.0.1:3210/api/v1/symphony/issues?orgId=${DEFAULT_ORG_ID}&states=running&limit=2`,
    }]);
    expect(JSON.parse(printed[0] as string)).toEqual([
      {
        id: "10000000-0000-0000-0000-000000000001",
        state: "running",
        orchestrationState: "running",
        task: null,
        startedAt: "2026-02-01T01:00:00.000Z",
        attemptCount: 1,
        nextRetryAt: null,
        workspacePath: null,
        lastErrorKind: null,
      },
    ]);
  });
});

describe("symphony.run: runs show <runId> --json", () => {
  it("prints JSON with workspacePath from orchestration.getWorkspacePath", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const calls: unknown[] = [];

    await run([
      "runs",
      "show",
      "10000000-0000-0000-0000-000000000001",
      "--json",
    ], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          getWorkspacePath: async (input: { orgId: string; runId: string }) => {
            calls.push(input);
            return {
              runId: input.runId,
              workspacePath: "/tmp/fulcrum-workspaces/org/key",
            };
          },
        },
      },
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(calls).toEqual([{
      orgId: DEFAULT_ORG_ID,
      runId: "10000000-0000-0000-0000-000000000001",
    }]);
    expect(JSON.parse(printed[0] as string)).toEqual({
      runId: "10000000-0000-0000-0000-000000000001",
      workspacePath: "/tmp/fulcrum-workspaces/org/key",
    });
  });

  it("accepts --json before the run id", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const calls: unknown[] = [];
    const runId = "10000000-0000-0000-0000-000000000001";

    await run(["runs", "show", "--json", runId], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          getWorkspacePath: async (input: { orgId: string; runId: string }) => {
            calls.push(input);
            return {
              runId: input.runId,
              workspacePath: "/tmp/fulcrum-workspaces/org/key",
            };
          },
        },
      },
      print: (line: string) => {
        printed.push(line);
      },
      printErr: (line: string) => {
        throw new Error(line);
      },
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(calls).toEqual([{ orgId: DEFAULT_ORG_ID, runId }]);
    expect(JSON.parse(printed[0] as string)).toEqual({
      runId,
      workspacePath: "/tmp/fulcrum-workspaces/org/key",
    });
  });

  it("prints retry schedule fields from orchestration.getRun", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const runId = "10000000-0000-0000-0000-000000000001";

    await run(["runs", "show", runId, "--json"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          getRun: async (input: { runId: string }) => {
            expect(input).toEqual({ runId });
            return {
              id: runId,
              state: "retry_queued",
              orchestrationState: "retry_queued",
              workspacePath: "/tmp/fulcrum-workspaces/org/key",
              renderedPrompt: null,
              attemptCount: 3,
              nextRetryAt: new Date("2026-05-02T10:01:20.000Z"),
              lastErrorKind: "stall_timeout",
            };
          },
        },
      },
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(JSON.parse(printed[0] as string)).toEqual({
      id: runId,
      state: "retry_queued",
      orchestrationState: "retry_queued",
      workspacePath: "/tmp/fulcrum-workspaces/org/key",
      renderedPrompt: null,
      attemptCount: 3,
      nextRetryAt: "2026-05-02T10:01:20.000Z",
      lastErrorKind: "stall_timeout",
    });
  });
});

describe("symphony.run: runs show <runId> --verbose", () => {
  it("prints a rendered prompt excerpt when verbose mode is enabled", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const runId = "10000000-0000-0000-0000-000000000001";

    await run(["runs", "show", runId, "--verbose"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          getRun: async (input: { runId: string }) => {
            expect(input).toEqual({ runId });
            return {
              id: runId,
              state: "running",
              renderedPrompt:
                "Fix login flow\n\nUse strict workflow context and include enough diagnostic detail for the assigned agent.",
            };
          },
        },
      },
      print: (line: string) => {
        printed.push(line);
      },
      printErr: () => {},
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(printed.join("\n")).toContain("RENDERED PROMPT");
    expect(printed.join("\n")).toContain("Fix login flow");
  });
});

describe("symphony.run: human output and error paths", () => {
  it("prints candidate runs as a table when --json is omitted", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];

    await run(["runs", "list", "--state", "ready", "--limit", "2"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [
            {
              id: "10000000-0000-0000-0000-000000000001",
              identifier: "TASK-1",
              title: "TASK-1",
              state: "ready",
              status: "ready",
              priority: 7,
              createdAt: new Date("2026-05-01T00:00:00.000Z"),
              blockedByIds: [],
              workflowId: null,
            },
          ],
        },
      },
      print: (line: string) => printed.push(line),
      printErr: (line: string) => {
        throw new Error(line);
      },
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(printed).toEqual([
      "ID                                    STATE  PRIORITY  CREATED_AT",
      "10000000-0000-0000-0000-000000000001  ready  7         2026-05-01T00:00:00.000Z",
    ]);
  });

  it("prints active run states as a table when --json is omitted", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];

    await run(["runs", "list", "--state", "running"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          fetchIssuesByStates: async () => [
            {
              id: "20000000-0000-0000-0000-000000000001",
              state: "running",
              orchestrationState: "running",
              task: {
                id: "task-1",
                status: "ready",
                priority: 1,
                createdAt: new Date("2026-05-01T00:00:00.000Z"),
                blockedByIds: [],
                workflowId: null,
              },
              startedAt: new Date("2026-05-01T01:00:00.000Z"),
              attemptCount: 2,
              nextRetryAt: null,
              workspacePath: null,
              lastErrorKind: null,
            },
          ],
        },
      },
      print: (line: string) => printed.push(line),
      printErr: (line: string) => {
        throw new Error(line);
      },
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(printed).toEqual([
      "ID                                    STATE         ATTEMPT  STARTED_AT",
      "20000000-0000-0000-0000-000000000001  running       2        2026-05-01T01:00:00.000Z",
    ]);
  });

  it("exits for invalid list limits before calling orchestration", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const errors: string[] = [];
    const exits: number[] = [];

    await run(["runs", "list", "--limit", "0"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => {
            throw new Error("should not query for invalid limit");
          },
        },
      },
      print: () => {},
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });

    expect(errors).toEqual(["fulcrum symphony runs list: --limit must be a positive integer"]);
    expect(exits).toEqual([1]);
  });

  it("fails at the public API configuration boundary when no caller is available", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const errors: string[] = [];
    const exits: number[] = [];

    await run(["runs", "list", "--state", "ready", "--json"], {
      env: {},
      print: () => {},
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });

    expect(errors.join("\n")).toContain("Agent-run API caller is not configured");
    expect(exits).toEqual([1]);
  });

  it("prints not-found and unavailable-service errors from runs show/list", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const errors: string[] = [];
    const exits: number[] = [];

    await run(["runs", "show", "missing-run"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          getRun: async () => null,
        },
      },
      print: () => {},
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });
    await run(["runs", "list", "--state", "running"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
        },
      },
      print: () => {},
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });

    expect(errors).toEqual([
      "fulcrum symphony runs show: run not found 'missing-run'",
      "fulcrum symphony runs list: Error: orchestration.fetchIssuesByStates is unavailable",
    ]);
    expect(exits).toEqual([1, 1]);
  });

  it("prints non-json run detail with retry metadata and prompt excerpt", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const longPrompt = "x".repeat(260);

    await run(["runs", "show", "run-1", "--verbose"], {
      caller: {
        orchestration: {
          fetchCandidateIssues: async () => [],
          getRun: async () => ({
            id: "run-1",
            orchestrationState: "retry_queued",
            workspacePath: "/tmp/work",
            renderedPrompt: longPrompt,
            attemptCount: 4,
            nextRetryAt: "2026-05-11T10:00:00.000Z",
            lastErrorKind: "worker_failed",
          }),
        },
      },
      print: (line: string) => printed.push(line),
      printErr: (line: string) => {
        throw new Error(line);
      },
      exit: (code: number) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(printed.slice(0, 6)).toEqual([
      "ID     run-1",
      "STATE  retry_queued",
      "ATTEMPT  4",
      "NEXT_RETRY_AT  2026-05-11T10:00:00.000Z",
      "LAST_ERROR_KIND  worker_failed",
      "WORKSPACE  /tmp/work",
    ]);
    expect(printed).toContain("RENDERED PROMPT");
    expect(printed.at(-1)).toHaveLength(240);
    expect(printed.at(-1)?.endsWith("...")).toBe(true);
  });

  it("prints help and exits 2 for unknown command groups", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const errors: string[] = [];
    const exits: number[] = [];
    const opts = {
      print: (line: string) => printed.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    };

    await run(["--help"], opts);
    await run(["unknown"], opts);
    await run(["runs", "unknown"], opts);

    expect(printed[0]).toContain("fulcrum symphony");
    expect(errors).toContain("fulcrum symphony: unknown command 'unknown'");
    expect(errors).toContain("fulcrum symphony runs: unknown command 'unknown'");
    expect(exits).toEqual([2, 2]);
  });

  it("reports unsupported or unavailable Linear connector paths", async () => {
    const { run } = await import("@fulcrum/cli/commands/symphony.ts");
    const printed: string[] = [];
    const errors: string[] = [];
    const exits: number[] = [];

    await run(["connector", "github", "sync"], {
      print: (line: string) => printed.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });
    await run(["connector", "linear", "pull"], {
      print: (line: string) => printed.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });
    await run(["connector", "linear", "sync", "--json"], {
      print: (line: string) => printed.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => exits.push(code),
    });

    expect(errors).toEqual([
      "fulcrum symphony connector: unsupported connector 'github'",
      "fulcrum symphony connector linear: unknown action 'pull'",
      "Usage: fulcrum symphony connector linear sync [--json]",
    ]);
    expect(JSON.parse(printed.at(-1) as string)).toEqual({
      ok: false,
      error: "Linear connector not available. Set FULCRUM_FEATURES=connector-linear and LINEAR_API_KEY.",
    });
    expect(exits).toEqual([2, 2, 1]);
  });
});
