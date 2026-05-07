/**
 * TDD — fulcrum symphony runs list --state ready --json.
 */

import { describe, expect, it } from "bun:test";

import { DEFAULT_ORG_ID } from "../../src/db/seed.ts";

describe("symphony.run — runs list --state ready --json", () => {
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
});

describe("symphony.run — runs list --state <state> --json", () => {
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
});

describe("symphony.run — runs show <runId> --json", () => {
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

describe("symphony.run — runs show <runId> --verbose", () => {
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
