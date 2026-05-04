import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Org } from "../../db/entities/auth/Org.ts";
import { Event } from "../../db/entities/core/Event.ts";
import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { Task } from "../../db/entities/tasks/Task.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import {
  dispatchLifecycleHook,
  resolveHookTimeoutMs,
  HookTimeoutError,
} from "../symphony/hooks.ts";
import { claimRun, ClaimConflictError } from "../symphony/orchestrator.ts";
import {
  parseWorkflowConfig,
  renderPrompt,
  UnknownVariableError,
} from "../symphony/prompt.ts";
import { calcRetryDelay, scheduleRetry } from "../symphony/retry.ts";
import {
  fetchCandidateIssues,
  fetchIssuesByStates,
  fetchIssueStatesByIds,
} from "../symphony/tracker.ts";
import { scanForStalledRuns } from "../symphony/stall.ts";
import { sanitizeWorkspaceKey, workspaceRoot } from "../symphony/workspace.ts";
import { tick, type TickDeps } from "../symphony/dispatch.ts";
import type {
  AgentRunOrchestrationState,
  CandidateIssue,
  WorkflowConfig,
} from "../symphony/schemas.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CONFORMANCE_TEST_PATH =
  "src/orchestration/__tests__/symphony-conformance.test.ts";
const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 300_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

const dbs: TestOrm[] = [];

afterEach(async () => {
  while (dbs.length > 0) {
    await dbs.pop()!.close();
  }
});

async function testDb(): Promise<TestOrm> {
  const db = await createTestOrm();
  dbs.push(db);
  return db;
}

async function seedTask(
  db: TestOrm,
  input: Partial<Task> = {},
): Promise<Task> {
  const em = db.em.fork();
  const task = em.create(Task, {
    org: em.getReference(Org, ORG_ID),
    status: "ready",
    priority: null,
    blockedByIds: [],
    ...input,
  });
  em.persist(task);
  await em.flush();
  return task;
}

async function seedRun(
  db: TestOrm,
  input: Partial<AgentRun> = {},
): Promise<AgentRun> {
  const em = db.em.fork();
  const task = input.task ?? await seedTask(db);
  const run = em.create(AgentRun, {
    org: em.getReference(Org, ORG_ID),
    task: em.getReference(Task, task.id),
    orchestrationState: "unclaimed",
    attemptCount: 0,
    ...input,
  });
  em.persist(run);
  await em.flush();
  return run;
}

describe("Symphony conformance suite", () => {
  test("REQUIRED: conformance file contains zero todo or skip tests", async () => {
    const source = await readFile(CONFORMANCE_TEST_PATH, "utf8");
    expect(source).not.toMatch(/\b(?:test|it|describe)\.(?:todo|skip|skipIf|todoIf)\b/);
  });

  test("REQUIRED: conformance trace maps every required SPEC section to at least one test ID", async () => {
    const doc = await readFile("docs/symphony-conformance.md", "utf8");
    const requiredBlock = doc.split("## 18.2")[0] ?? doc;
    const sections = [...requiredBlock.matchAll(/^### .+$/gm)].map((match) => ({
      heading: match[0],
      index: match.index ?? 0,
    }));

    expect(sections.length).toBeGreaterThanOrEqual(18);
    for (const [index, section] of sections.entries()) {
      const nextIndex = sections[index + 1]?.index ?? requiredBlock.length;
      const body = requiredBlock.slice(section.index, nextIndex);
      expect(body, section.heading).toContain("Test ID:");
    }
  });

  test("REQUIRED: local CI includes the Symphony conformance suite as a hard gate", async () => {
    const source = await readFile("scripts/ci.ts", "utf8");

    expect(source).toContain("symphony:conformance");
    expect(source).toContain("src/orchestration/__tests__/symphony-conformance.test.ts");
  });

  test("REQUIRED: workflow config applies defaults and strict prompt rendering fails unknown variables", async () => {
    expect(parseWorkflowConfig("")).toEqual(DEFAULT_CONFIG);

    await expect(
      renderPrompt(
        { id: "wf-1", configYaml: "", promptMd: "Work {{ issue.title }} {{ attempt }}" },
        { issue: { title: "Implement conformance" }, attempt: 2 },
      ),
    ).resolves.toBe("Work Implement conformance 2");

    await expect(
      renderPrompt(
        { id: "wf-1", configYaml: "", promptMd: "{{ missing.value }}" },
        { issue: {}, attempt: null },
      ),
    ).rejects.toThrow(UnknownVariableError);
  });

  test("REQUIRED: workflow config accepts retry, stall, attempt, and failure-retention overrides", () => {
    expect(parseWorkflowConfig(`
stall_timeout_ms: 1200
max_retry_backoff_ms: 42000
keepOnFailure: true
maxAttempts: 5
`)).toEqual({
      stallTimeoutMs: 1200,
      maxRetryBackoffMs: 42000,
      keepOnFailure: true,
      maxAttempts: 5,
    });
  });

  test("REQUIRED: state enum includes claim, running, retry, release, and terminal attempt states", async () => {
    const { AGENT_RUN_ORCHESTRATION_STATES } = await import("../states.ts");

    expect(AGENT_RUN_ORCHESTRATION_STATES).toEqual([
      "unclaimed",
      "claimed",
      "running",
      "retry_queued",
      "released",
      "succeeded",
      "failed",
      "timed_out",
      "stalled",
      "cancelled",
    ]);
  });

  test("REQUIRED: migration creates Symphony partial indexes for claim, dispatch poll, and stall scan", async () => {
    const db = await testDb();

    const indexes = await db.pglite.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'agent_runs' order by indexname`,
    );

    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "agent_runs_claimed_unique",
        "agent_runs_dispatch_poll",
        "agent_runs_stall_scan",
      ]),
    );
  });

  test("REQUIRED: claim lock allows exactly one unclaimed run transition", async () => {
    const db = await testDb();
    const task = await seedTask(db);
    const firstRun = await seedRun(db, { task });
    await seedRun(db, { task });

    await expect(claimRun(db.em, ORG_ID, task.id, "worker-a")).resolves.toEqual({
      runId: firstRun.id,
    });
    await expect(claimRun(db.em, ORG_ID, task.id, "worker-b")).rejects.toThrow(
      ClaimConflictError,
    );

    const events = await db.em.fork().find(Event, {
      org: ORG_ID,
      subjectKind: "agent_run",
      subjectId: firstRun.id,
      verb: "state_changed",
    } as never);
    expect(events.map((event) => event.payload)).toContainEqual({
      from: "unclaimed",
      to: "claimed",
    });
  });

  test("REQUIRED: tracker fetchCandidateIssues orders ready unblocked tasks and excludes occupied tasks", async () => {
    const db = await testDb();
    const claimed = await seedTask(db, { priority: 0, createdAt: new Date("2026-01-01") });
    await seedRun(db, { task: claimed, orchestrationState: "claimed" });
    const unresolvedBlocker = await seedTask(db, { status: "todo" });
    const newHigh = await seedTask(db, { priority: 1, createdAt: new Date("2026-01-03") });
    const oldHigh = await seedTask(db, { priority: 1, createdAt: new Date("2026-01-01") });
    const oldLow = await seedTask(db, { priority: 2, createdAt: new Date("2026-01-01") });
    await seedTask(db, { priority: 0, blockedByIds: [unresolvedBlocker.id] });

    const issues = await fetchCandidateIssues(db.em, ORG_ID, 10);

    expect(issues.map((issue) => issue.id)).toEqual([
      oldHigh.id,
      newHigh.id,
      oldLow.id,
    ]);
  });

  test("REQUIRED: tracker fetchIssuesByStates batches full run rows and fetchIssueStatesByIds returns slim state rows", async () => {
    const db = await testDb();
    const running = await seedRun(db, { orchestrationState: "running", attemptCount: 2 });
    const retry = await seedRun(db, { orchestrationState: "retry_queued", attemptCount: 1 });

    const fullRows = await fetchIssuesByStates(db.em, ORG_ID, ["running", "retry_queued"], 10);
    expect(fullRows.map((row) => row.id).sort()).toEqual([retry.id, running.id].sort());
    expect(fullRows.find((row) => row.id === running.id)).toMatchObject({
      state: "running",
      orchestrationState: "running",
      attemptCount: 2,
    });

    const slimRows = await fetchIssueStatesByIds(db.em, ORG_ID, [
      running.id,
      retry.id,
      randomUUID(),
    ]);
    const expectedSlimRows: typeof slimRows = ([
      { id: retry.id, state: "retry_queued" },
      { id: running.id, state: "running" },
    ] satisfies Array<{ id: string; state: AgentRunOrchestrationState }>).sort(
      (a, b) => a.id.localeCompare(b.id),
    );
    expect(slimRows).toEqual(expectedSlimRows);
  });

  test("REQUIRED: dispatch loop claims, runs hooks, invokes runner in workspace, and records release spans", async () => {
    const calls: string[] = [];
    const deps: TickDeps = {
      orgId: ORG_ID,
      instanceId: "instance-1",
      maxConcurrency: 2,
      config: DEFAULT_CONFIG,
      fetchCandidateIssues: mock(async (): Promise<CandidateIssue[]> => [{
        id: randomUUID(),
        identifier: "FUL-1",
        title: "Run me",
        state: "ready",
        status: "ready",
        priority: 1,
        createdAt: new Date(),
        blockedByIds: [],
        workflowId: null,
      }]),
      claimRun: mock(async () => ({ runId: "run-1" })),
      getRunEntity: mock(async () => ({ id: "run-1", attemptCount: 0 })),
      createWorkspace: mock(async () => join(tmpdir(), "fulcrum-conformance-workspace")),
      renderPrompt: mock(async () => "Prompt"),
      dispatchToRunner: mock(async (_prompt, workspacePath) => {
        expect(workspacePath).toContain("fulcrum-conformance-workspace");
        return { success: true };
      }),
      destroyWorkspace: mock(async () => {
        calls.push("destroy");
      }),
      transitionState: mock(async (_runId, from, to) => {
        calls.push(`${from}->${to}`);
      }),
      dispatchHook: mock(async (hookName) => {
        calls.push(hookName);
      }),
      emitSpan: mock((name) => calls.push(name)),
      countRunningRuns: mock(async () => 0),
    };

    await expect(tick(deps)).resolves.toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
    expect(calls).toEqual(expect.arrayContaining([
      "unclaimed->claimed",
      "claimed->running",
      "before_run",
      "after_run",
      "running->succeeded",
      "symphony.claim",
      "symphony.run",
      "symphony.release",
      "destroy",
    ]));
  });

  test("REQUIRED: dispatch loop skips candidate fetch when global capacity is exhausted", async () => {
    const fetchCandidateIssues = mock(async (): Promise<CandidateIssue[]> => []);
    const result = await tick({
      orgId: ORG_ID,
      instanceId: "instance-1",
      maxConcurrency: 1,
      config: DEFAULT_CONFIG,
      fetchCandidateIssues,
      claimRun: mock(async () => ({ runId: "run-1" })),
      getRunEntity: mock(async () => ({})),
      createWorkspace: mock(async () => "/tmp/work"),
      renderPrompt: mock(async () => "Prompt"),
      dispatchToRunner: mock(async () => ({ success: true })),
      destroyWorkspace: mock(async () => {}),
      transitionState: mock(async () => {}),
      dispatchHook: mock(async () => {}),
      emitSpan: mock(() => {}),
      countRunningRuns: mock(async () => 1),
    });

    expect(result).toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
      skippedCapacity: true,
    });
    expect(fetchCandidateIssues).not.toHaveBeenCalled();
  });

  test("REQUIRED: retry delay uses 10s exponential formula capped by configured max", () => {
    expect([
      calcRetryDelay(1, 300_000),
      calcRetryDelay(2, 300_000),
      calcRetryDelay(4, 300_000),
      calcRetryDelay(10, 300_000),
    ]).toEqual([10_000, 20_000, 80_000, 300_000]);
  });

  test("REQUIRED: retry queue records attempt, due time, state, and error kind", async () => {
    const db = await testDb();
    const now = new Date("2026-05-03T12:00:00.000Z");
    const run = await seedRun(db, { orchestrationState: "running", attemptCount: 1 });

    await scheduleRetry(
      db.em,
      { id: run.id, orgId: ORG_ID, orchestrationState: "running", attemptCount: 1 },
      { kind: "turn_failed" },
      DEFAULT_CONFIG,
      { now: () => now },
    );

    const updated = await db.em.fork().findOneOrFail(AgentRun, run.id);
    expect(updated.orchestrationState).toBe("retry_queued");
    expect(updated.attemptCount).toBe(2);
    expect(updated.lastErrorKind).toBe("turn_failed");
    expect(updated.nextRetryAt?.toISOString()).toBe("2026-05-03T12:00:20.000Z");
  });

  test("REQUIRED: stall detection uses mocked clock and queues stalled running runs for retry", async () => {
    const db = await testDb();
    const run = await seedRun(db, {
      orchestrationState: "running",
      startedAt: new Date("2026-05-03T12:00:00.000Z"),
    });
    const onStalled = mock(async () => undefined);

    const count = await scanForStalledRuns(
      db.em,
      ORG_ID,
      { ...DEFAULT_CONFIG, stallTimeoutMs: 1_000 },
      onStalled,
      { now: () => new Date("2026-05-03T12:00:01.001Z") },
    );

    expect(count).toBe(1);
    expect(onStalled).toHaveBeenCalledWith(
      db.em,
      expect.objectContaining({ id: run.id, orchestrationState: "running" }),
      { kind: "stall_timeout" },
      expect.objectContaining({ stallTimeoutMs: 1_000 }),
      expect.any(Object),
    );
  });

  test("REQUIRED: lifecycle hooks support before_remove and enforce hook timeout", async () => {
    const db = await testDb();
    const task = await seedTask(db);
    const run = await seedRun(db, { task });
    const em = db.em.fork();
    const managedRun = await em.findOneOrFail(AgentRun, run.id, { populate: ["task"] });
    const managedTask = managedRun.task!;

    await expect(
      dispatchLifecycleHook(
        em,
        "before_remove",
        { run: managedRun, task: managedTask, workspacePath: "/tmp/work", attempt: 1 },
        {
          before_remove: async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
          },
        },
        { hooks_timeout_ms: 1 },
      ),
    ).rejects.toThrow(HookTimeoutError);
  });

  test("REQUIRED: hook timeout resolution uses hooks_timeout_ms and defaults to 60000", () => {
    expect(resolveHookTimeoutMs("before_run", {})).toBe(60_000);
    expect(resolveHookTimeoutMs("after_run", { hooks_timeout_ms: 123 })).toBe(123);
    expect(resolveHookTimeoutMs("before_remove", {
      hooks_timeout_ms: 123,
      before_remove_timeout_ms: 456,
    })).toBe(456);
  });

  test("REQUIRED: workspace key replaces unsafe characters and default root is deterministic", () => {
    expect(sanitizeWorkspaceKey("FUL 14/conformance:test", "12345678-aaaa")).toBe(
      "FUL_14_conformance_test",
    );
    expect(workspaceRoot("")).toContain(join(".fulcrum", "workspaces"));
  });
});
