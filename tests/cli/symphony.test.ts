/**
 * TDD — fulcrum symphony runs list --state ready --json.
 */

import { describe, expect, it } from "bun:test";

import { DEFAULT_ORG_ID } from "../../src/db/seed.ts";

describe("symphony.run — runs list --state ready --json", () => {
  it("prints a valid JSON array from orchestration.fetchCandidateIssues", async () => {
    const { run } = await import("../../src/cli/commands/symphony.ts");
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
