/**
 * Dispatch loop happy-path integration test (P3#11).
 *
 * Tests the full tick() cycle:
 *   unclaimed → claimed → running → succeeded/released
 * Verifies event rows, OTel spans, hook invocation order, maxConcurrency cap.
 */

import { describe, expect, mock, test, beforeEach } from "bun:test";

import type { WorkflowConfig } from "@execution-orchestration/infrastructure/agent-runtime/symphony/schemas.ts";
import type { LifecycleHookContext } from "@execution-orchestration/infrastructure/agent-runtime/symphony/hooks.ts";
import {
  tick,
  type TickDeps,
  type TickResult,
} from "@execution-orchestration/infrastructure/agent-runtime/symphony/dispatch.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 300_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

function makeCandidate(id: string) {
  return {
    id,
    identifier: id,
    title: `Task ${id}`,
    state: "ready",
    status: "ready" as const,
    priority: 1,
    createdAt: new Date(),
    blockedByIds: [],
    workflowId: null,
  };
}

function makeRun(id: string, taskId: string, orgId: string) {
  return {
    id,
    org: { id: orgId },
    task: { id: taskId, org: { id: orgId }, status: "ready", priority: 1, createdAt: new Date(), blockedByIds: [], workflowId: null },
    orchestrationState: "unclaimed" as string,
    workspacePath: undefined as string | undefined,
    attemptCount: 1,
    startedAt: new Date(),
    nextRetryAt: null,
    lastErrorKind: null,
    claimedBy: null,
  };
}

interface SpanRecord {
  name: string;
  attributes: Record<string, unknown>;
}

function makeDeps(overrides: Partial<TickDeps> = {}): TickDeps & { spans: SpanRecord[]; events: Array<{ verb: string; payload: unknown }> } {
  const spans: SpanRecord[] = [];
  const events: Array<{ verb: string; payload: unknown }> = [];
  const hookCalls: string[] = [];

  return {
    spans,
    events,
    orgId: "org-1",
    instanceId: "inst-1",
    maxConcurrency: 2,
    config: DEFAULT_CONFIG,

    fetchCandidateIssues: mock(async () => [makeCandidate("task-1")]),
    claimRun: mock(async (_orgId, taskId, _instanceId) => ({ runId: `run-${taskId}` })),
    getRunEntity: mock(async (runId) => makeRun(runId, "task-1", "org-1")),
    createWorkspace: mock(async (_run) => "/tmp/ws/task-1"),
    renderPrompt: mock(async () => "rendered prompt"),
    dispatchToRunner: mock(async () => ({ success: true, output: "done" })),
    destroyWorkspace: mock(async () => {}),
    transitionState: mock(async (_runId, _from, to) => {
      events.push({ verb: "state_changed", payload: { to } });
    }),
    dispatchHook: mock(async (_hookName, _ctx) => {
      hookCalls.push(_hookName);
    }),
    emitSpan: mock((name, attributes) => {
      spans.push({ name, attributes });
    }),
    countRunningRuns: mock(async () => 0),

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatch loop tick()", () => {
  test("happy path: unclaimed → claimed → running → succeeded", async () => {
    const deps = makeDeps();
    const result = await tick(deps);

    expect(result.claimed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    // State transitions emitted
    const stateChanges = deps.events.map((e) => e.payload);
    expect(stateChanges).toContainEqual({ to: "claimed" });
    expect(stateChanges).toContainEqual({ to: "running" });
    expect(stateChanges).toContainEqual({ to: "succeeded" });

    // OTel spans recorded
    expect(deps.spans.length).toBeGreaterThanOrEqual(3);
    const spanNames = deps.spans.map((s) => s.name);
    expect(spanNames).toContain("symphony.claim");
    expect(spanNames).toContain("symphony.run");
    expect(spanNames).toContain("symphony.release");
  });

  test("before_run and after_run hooks fire in order", async () => {
    const hookOrder: string[] = [];
    const deps = makeDeps({
      dispatchHook: mock(async (hookName) => {
        hookOrder.push(hookName);
      }),
    });

    await tick(deps);

    const beforeIdx = hookOrder.indexOf("before_run");
    const afterIdx = hookOrder.indexOf("after_run");
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(afterIdx).toBeGreaterThan(beforeIdx);
  });

  test("on_failure hook fires on runner error", async () => {
    const hookOrder: string[] = [];
    const deps = makeDeps({
      dispatchToRunner: mock(async () => {
        throw new Error("sandbox crash");
      }),
      dispatchHook: mock(async (hookName) => {
        hookOrder.push(hookName);
      }),
    });

    const result = await tick(deps);

    expect(result.failed).toBe(1);
    expect(hookOrder).toContain("on_failure");
  });

  test("maxConcurrency cap enforced — skips claims when at limit", async () => {
    const deps = makeDeps({
      countRunningRuns: mock(async () => 2), // already at max
      fetchCandidateIssues: mock(async () => [makeCandidate("task-1")]),
    });

    const result = await tick(deps);

    expect(result.claimed).toBe(0);
    expect(result.skippedCapacity).toBe(true);
  });

  test("destroyWorkspace called on success", async () => {
    const deps = makeDeps();
    await tick(deps);

    expect(deps.destroyWorkspace).toHaveBeenCalled();
  });

  test("workspace preserved on failure when keepOnFailure=true", async () => {
    const deps = makeDeps({
      config: { ...DEFAULT_CONFIG, keepOnFailure: true },
      dispatchToRunner: mock(async () => {
        throw new Error("crash");
      }),
    });

    await tick(deps);

    expect(deps.destroyWorkspace).not.toHaveBeenCalled();
  });

  test("no candidates → tick returns zero counts", async () => {
    const deps = makeDeps({
      fetchCandidateIssues: mock(async () => []),
    });

    const result = await tick(deps);

    expect(result.claimed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test("OTel span attributes include org_id and run_id", async () => {
    const deps = makeDeps();
    await tick(deps);

    const claimSpan = deps.spans.find((s) => s.name === "symphony.claim");
    expect(claimSpan?.attributes.org_id).toBe("org-1");
    expect(claimSpan?.attributes.run_id).toBe("run-task-1");
  });
});
