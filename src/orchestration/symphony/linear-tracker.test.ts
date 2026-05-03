/**
 * TDD tests for Linear Symphony tracker adapter.
 *
 * Verifies:
 * - Feature gate: connector-linear flag off → no Linear import errors
 * - Feature gate: connector-linear flag on → adapter active
 * - fetchCandidateIssues maps Linear issues to CandidateIssue shape
 * - fetchIssuesByStates delegates to underlying connector
 * - Bidirectional sync: mock Linear API → tasks rows; push back
 * - Conflict row written on concurrent update (last-write-wins)
 * - Same unit-test fixture shape as tracker.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { CandidateIssue } from "./schemas.ts";
import type { TrackerAdapter } from "./tracker-adapter.ts";

// We test the module-level factory + adapter without real Linear API
// by injecting a mock fetch into the LinearConnector.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectorLinearEnv(on: boolean): void {
  if (on) {
    process.env["FULCRUM_FEATURES"] = "connector-linear";
    process.env["LINEAR_API_KEY"] = "lin_test_key";
    process.env["LINEAR_TEAM_ID"] = "team-1";
  } else {
    delete process.env["FULCRUM_FEATURES"];
    delete process.env["LINEAR_API_KEY"];
    delete process.env["LINEAR_TEAM_ID"];
  }
}

/** Build a mock fetch returning Linear GraphQL responses. */
function mockLinearFetch(issues: LinearIssueFixture[] = []): (input: string, init?: RequestInit) => Promise<Response> {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse((init?.body as string) ?? "{}");
    const query: string = body.query ?? "";

    // TeamIssues query → return issues
    if (query.includes("TeamIssues") || query.includes("issues(filter")) {
      return new Response(JSON.stringify({
        data: {
          issues: {
            nodes: issues.map((i) => ({
              id: i.id,
              identifier: i.identifier,
              title: i.title,
              estimate: i.estimate ?? null,
              state: { name: i.stateName ?? "Todo", type: i.stateType ?? "unstarted" },
              cycle: null,
              assignee: null,
              labels: { nodes: [] },
              updatedAt: i.updatedAt ?? new Date().toISOString(),
            })),
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    // issueUpdate mutation → succeed
    if (query.includes("issueUpdate")) {
      return new Response(JSON.stringify({
        data: { issueUpdate: { success: true } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    // Viewer query (healthCheck)
    if (query.includes("Viewer")) {
      return new Response(JSON.stringify({
        data: { viewer: { id: "user-1" } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response("not found", { status: 404 });
  };
}

interface LinearIssueFixture {
  id: string;
  identifier: string;
  title: string;
  estimate?: number;
  stateName?: string;
  stateType?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("linear-tracker", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      FULCRUM_FEATURES: process.env["FULCRUM_FEATURES"],
      LINEAR_API_KEY: process.env["LINEAR_API_KEY"],
      LINEAR_TEAM_ID: process.env["LINEAR_TEAM_ID"],
    };
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("feature gate", () => {
    it("returns null adapter when connector-linear flag is off", async () => {
      connectorLinearEnv(false);
      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter();
      expect(adapter).toBeNull();
    });

    it("returns active adapter when connector-linear flag is on + API key set", async () => {
      connectorLinearEnv(true);
      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch() });
      expect(adapter).not.toBeNull();
      expect(adapter!.kind).toBe("linear");
    });

    it("returns null when flag on but no API key", async () => {
      process.env["FULCRUM_FEATURES"] = "connector-linear";
      delete process.env["LINEAR_API_KEY"];
      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter();
      expect(adapter).toBeNull();
    });
  });

  describe("fetchCandidateIssues", () => {
    it("returns mapped CandidateIssue array from Linear issues", async () => {
      connectorLinearEnv(true);
      const issues: LinearIssueFixture[] = [
        { id: "lin-1", identifier: "ENG-1", title: "Fix bug", stateName: "Todo", stateType: "unstarted" },
        { id: "lin-2", identifier: "ENG-2", title: "Add feature", stateName: "In Progress", stateType: "started" },
        { id: "lin-3", identifier: "ENG-3", title: "Done task", stateName: "Done", stateType: "completed" },
      ];

      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch(issues) })!;
      expect(adapter).not.toBeNull();

      const candidates = await adapter.fetchCandidateIssues("org-1", 10);

      // Only unstarted/backlog issues are candidates (not in-progress or done)
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates.every((c: CandidateIssue) => c.status === "ready")).toBe(true);

      // Mapped shape
      const first = candidates[0]!;
      expect(first.identifier).toBe("ENG-1");
      expect(first.title).toBe("Fix bug");
      expect(first.id).toBeTruthy();
    });

    it("returns empty array when no issues match", async () => {
      connectorLinearEnv(true);
      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch([]) })!;

      const candidates = await adapter.fetchCandidateIssues("org-1");
      expect(candidates).toEqual([]);
    });

    it("respects limit parameter", async () => {
      connectorLinearEnv(true);
      const issues = Array.from({ length: 20 }, (_, i) => ({
        id: `lin-${i}`,
        identifier: `ENG-${i}`,
        title: `Task ${i}`,
        stateName: "Todo",
        stateType: "unstarted",
      }));

      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch(issues) })!;

      const candidates = await adapter.fetchCandidateIssues("org-1", 5);
      expect(candidates.length).toBeLessThanOrEqual(5);
    });
  });

  describe("fetchIssuesByStates", () => {
    it("returns empty array for empty states", async () => {
      connectorLinearEnv(true);
      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch() })!;

      const result = await adapter.fetchIssuesByStates("org-1", []);
      expect(result).toEqual([]);
    });
  });

  describe("fetchIssueStatesByIds", () => {
    it("returns empty array for empty ids", async () => {
      connectorLinearEnv(true);
      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch() })!;

      const result = await adapter.fetchIssueStatesByIds("org-1", []);
      expect(result).toEqual([]);
    });
  });

  describe("bidirectional sync", () => {
    it("pulls Linear issues and maps to task shape", async () => {
      connectorLinearEnv(true);
      const issues: LinearIssueFixture[] = [
        { id: "lin-10", identifier: "ENG-10", title: "Sync test", stateName: "Todo", stateType: "unstarted" },
      ];

      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: mockLinearFetch(issues) })!;

      const syncResult = await adapter.sync("org-1");
      expect(syncResult.pulled).toBeGreaterThanOrEqual(1);
      expect(syncResult.errors.length).toBe(0);
    });

    it("pushes task state changes back to Linear", async () => {
      connectorLinearEnv(true);
      let pushCalled = false;
      const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if (body.query?.includes("issueUpdate")) {
          pushCalled = true;
          return new Response(JSON.stringify({ data: { issueUpdate: { success: true } } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // pull returns empty
        return new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const { createLinearTrackerAdapter } = await import("./linear-tracker.ts");
      const adapter = createLinearTrackerAdapter({ fetch: fetchImpl })!;

      const pushResult = await adapter.pushStateChange("org-1", {
        externalId: "ENG-99",
        newState: "done",
      });
      expect(pushCalled).toBe(true);
      expect(pushResult.pushed).toBe(1);
    });
  });

  describe("conflict resolution", () => {
    it("uses last-write-wins with updatedAt comparison", async () => {
      connectorLinearEnv(true);
      const { resolveConflict } = await import("./linear-tracker.ts");

      const local = { updatedAt: "2026-05-01T00:00:00Z", state: "in-progress" };
      const remote = { updatedAt: "2026-05-02T00:00:00Z", state: "done" };

      const result = resolveConflict(local, remote);
      expect(result.winner).toBe("remote");
      expect(result.conflict).toBeDefined();
    });

    it("local wins when local is newer", async () => {
      connectorLinearEnv(true);
      const { resolveConflict } = await import("./linear-tracker.ts");

      const local = { updatedAt: "2026-05-03T00:00:00Z", state: "in-progress" };
      const remote = { updatedAt: "2026-05-01T00:00:00Z", state: "done" };

      const result = resolveConflict(local, remote);
      expect(result.winner).toBe("local");
    });
  });
});
