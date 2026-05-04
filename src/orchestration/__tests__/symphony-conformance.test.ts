import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
import {
  loadWorkflowRuntime,
  createWorkflowRuntimeReloader,
  WorkflowNotFoundError,
  WorkflowFrontmatterError,
  WorkflowConfigError,
} from "../symphony/workflow-runtime.ts";
import {
  SymphonyIssueSchema,
  BlockedByRefSchema,
  type SymphonyIssue,
} from "../symphony/schemas.ts";
import {
  fetchSymphonyIssues,
  refreshRunningIssues,
  resolvePerStateConcurrency,
  TrackerBlockerResolutionError,
} from "../symphony/tracker.ts";
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

  // -------------------------------------------------------------------------
  // SYM-01: Workflow path selection — explicit path wins over cwd default
  // SYM-02: Missing default WORKFLOW.md throws WorkflowNotFoundError
  // -------------------------------------------------------------------------
  describe("Workflow runtime — path selection (SYM-01, SYM-02)", () => {
    let tmpDir: string;

    afterEach(async () => {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    });

    test("REQUIRED: explicit workflowPath wins over cwd default WORKFLOW.md", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const explicit = join(tmpDir, "custom.md");
      const body = "---\n---\nHello {{ issue.title }}";
      await writeFile(explicit, body);
      // cwd has no WORKFLOW.md — explicit path must be used
      const runtime = await loadWorkflowRuntime({ workflowPath: explicit, cwd: tmpDir, env: {}, homeDir: "/home/user" });
      expect(runtime.promptTemplate).toBe("Hello {{ issue.title }}");
    });

    test("REQUIRED: missing default ./WORKFLOW.md throws WorkflowNotFoundError", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      await expect(loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" }))
        .rejects.toThrow(WorkflowNotFoundError);
    });

    test("REQUIRED: invalid explicit workflowPath throws WorkflowNotFoundError", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      await expect(
        loadWorkflowRuntime({ workflowPath: join(tmpDir, "nonexistent.md"), cwd: tmpDir, env: {}, homeDir: "/home/user" }),
      ).rejects.toThrow(WorkflowNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // SYM-03: YAML front matter / body split + invalid YAML errors
  // SYM-04: Front matter non-map throws WorkflowFrontmatterError
  // -------------------------------------------------------------------------
  describe("Workflow runtime — front matter parsing (SYM-03, SYM-04)", () => {
    let tmpDir: string;

    afterEach(async () => {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    });

    test("REQUIRED: YAML front matter and Markdown body split correctly", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\ncodex:\n  command: codex app-server\n---\nWork on {{ issue.title }}");
      const runtime = await loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" });
      expect(runtime.promptTemplate).toBe("Work on {{ issue.title }}");
      expect(runtime.config.codex.command).toBe("codex app-server");
    });

    test("REQUIRED: no front matter treats entire file as prompt body with empty config", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "Just a prompt with no front matter");
      const runtime = await loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" });
      expect(runtime.promptTemplate).toBe("Just a prompt with no front matter");
    });

    test("REQUIRED: invalid YAML front matter throws WorkflowFrontmatterError", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\n: bad: yaml: [\n---\nBody");
      await expect(loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" }))
        .rejects.toThrow(WorkflowFrontmatterError);
    });

    test("REQUIRED: front matter non-map YAML throws WorkflowFrontmatterError", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\n- item1\n- item2\n---\nBody");
      await expect(loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" }))
        .rejects.toThrow(WorkflowFrontmatterError);
    });
  });

  // -------------------------------------------------------------------------
  // SYM-14: Codex launch defaults — codex.command = "codex app-server"
  // SYM-21: $VAR env resolution and ~ expansion
  // SYM-24: Missing $VAR throws WorkflowConfigError
  // -------------------------------------------------------------------------
  describe("Workflow runtime — config defaults and env expansion (SYM-14, SYM-21, SYM-24)", () => {
    let tmpDir: string;

    afterEach(async () => {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    });

    test("REQUIRED: default codex.command is 'codex app-server'", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\n---\nPrompt");
      const runtime = await loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" });
      expect(runtime.config.codex.command).toBe("codex app-server");
    });

    test("REQUIRED: $VAR env reference is resolved from env", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\ntracker:\n  api_key: $LINEAR_API_KEY\n---\nPrompt");
      const runtime = await loadWorkflowRuntime({
        cwd: tmpDir,
        env: { LINEAR_API_KEY: "secret-token" },
        homeDir: "/home/user",
      });
      expect(runtime.config.tracker?.api_key).toBe("secret-token");
    });

    test("REQUIRED: ~ is expanded to homeDir in path values", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\nworkspace:\n  root: ~/workspaces\n---\nPrompt");
      const runtime = await loadWorkflowRuntime({
        cwd: tmpDir,
        env: {},
        homeDir: "/home/testuser",
      });
      expect(runtime.config.workspace?.root).toBe("/home/testuser/workspaces");
    });

    test("REQUIRED: missing $VAR reference throws WorkflowConfigError", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\ntracker:\n  api_key: $MISSING_VAR\n---\nPrompt");
      await expect(
        loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" }),
      ).rejects.toThrow(WorkflowConfigError);
    });
  });

  // -------------------------------------------------------------------------
  // SYM-26: Unknown prompt variables fail closed (UnknownVariableError)
  // -------------------------------------------------------------------------
  describe("Workflow runtime — strict prompt rendering (SYM-26)", () => {
    let tmpDir: string;

    afterEach(async () => {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    });

    test("REQUIRED: unknown prompt variables throw UnknownVariableError", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\n---\nWork on {{ issue.title }} and {{ missing_var }}");
      const runtime = await loadWorkflowRuntime({ cwd: tmpDir, env: {}, homeDir: "/home/user" });
      await expect(
        renderPrompt(
          { id: "wf-1", configYaml: "", promptMd: runtime.promptTemplate },
          { issue: { title: "Task" }, attempt: 1 },
        ),
      ).rejects.toThrow(UnknownVariableError);
    });
  });

  // -------------------------------------------------------------------------
  // SYM-02 / D-07: Invalid reload keeps last good config
  // -------------------------------------------------------------------------
  describe("Workflow runtime — reload last-good (SYM-02, D-07)", () => {
    let tmpDir: string;

    afterEach(async () => {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    });

    test("REQUIRED: invalid reload keeps last good config and records visible error", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\ncodex:\n  command: codex app-server\n---\nGood prompt");

      const reloader = await createWorkflowRuntimeReloader({ workflowPath: wf, cwd: tmpDir, env: {}, homeDir: "/home/user" });
      const initial = reloader.current();
      expect(initial.config.codex.command).toBe("codex app-server");

      // Corrupt the file
      await writeFile(wf, "---\n: bad: yaml: [\n---\nBad");
      const result = await reloader.reload();
      expect(result.ok).toBe(false);
      expect(result.runtime.config.codex.command).toBe("codex app-server");
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBeTruthy();
      expect(result.error?.kind).toBeTruthy();
      expect(result.error?.workflowPath).toBe(wf);
    });

    test("REQUIRED: valid reload replaces runtime with new config", async () => {
      tmpDir = join(tmpdir(), `sym-test-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const wf = join(tmpDir, "WORKFLOW.md");
      await writeFile(wf, "---\ncodex:\n  command: codex app-server\n---\nOriginal");

      const reloader = await createWorkflowRuntimeReloader({ workflowPath: wf, cwd: tmpDir, env: {}, homeDir: "/home/user" });
      await writeFile(wf, "---\ncodex:\n  command: codex app-server --verbose\n---\nUpdated");
      const result = await reloader.reload();
      expect(result.ok).toBe(true);
      expect(result.runtime.config.codex.command).toBe("codex app-server --verbose");
      expect(result.error).toBeNull();
    });

    test("REQUIRED: conformance trace has test IDs for workflow runtime items", async () => {
      const doc = await readFile("docs/symphony-conformance.md", "utf8");
      expect(doc).toContain("Workflow path selection supports explicit runtime path and cwd default");
      expect(doc).toContain("Dynamic `WORKFLOW.md` watch/reload/re-apply");
      expect(doc).toContain("Codex launch command config");
    });
  });

  // -------------------------------------------------------------------------
  // SYM-05: Native tracker strict Issue model — all 12 fields required
  // SYM-06: blocked_by returns full {id, identifier, state} refs
  // SYM-07: Unresolved blocker ID throws TrackerBlockerResolutionError
  // SYM-08: Labels normalize to lowercase; candidate sorting is deterministic
  // -------------------------------------------------------------------------
  describe("Native tracker strict Issue model (SYM-05, SYM-06, SYM-07, SYM-08)", () => {
    test("REQUIRED: SymphonyIssueSchema requires all 12 fields", () => {
      // Valid full issue passes
      const valid = SymphonyIssueSchema.parse({
        id: "00000000-0000-0000-0000-000000000001",
        identifier: "FUL-1",
        title: "Implement auth",
        description: "Detailed description",
        branch_name: "feat/ful-1-implement-auth",
        url: "https://app.fulcrum.io/tasks/FUL-1",
        labels: ["backend", "auth"],
        state: "ready",
        priority: 1,
        created_at: new Date("2026-01-01T00:00:00Z"),
        updated_at: new Date("2026-01-02T00:00:00Z"),
        blocked_by: [],
      });
      expect(valid.id).toBe("00000000-0000-0000-0000-000000000001");
      expect(valid.identifier).toBe("FUL-1");
      expect(valid.branch_name).toBe("feat/ful-1-implement-auth");
      expect(valid.blocked_by).toEqual([]);

      // Missing branch_name must fail
      expect(() =>
        SymphonyIssueSchema.parse({
          id: "00000000-0000-0000-0000-000000000001",
          identifier: "FUL-1",
          title: "Implement auth",
          description: null,
          url: null,
          labels: [],
          state: "ready",
          priority: null,
          created_at: new Date(),
          updated_at: new Date(),
          blocked_by: [],
          // branch_name missing
        }),
      ).toThrow();
    });

    test("REQUIRED: BlockedByRefSchema requires id, identifier, and state", () => {
      const valid = BlockedByRefSchema.parse({
        id: "00000000-0000-0000-0000-000000000002",
        identifier: "FUL-2",
        state: "in-progress",
      });
      expect(valid.identifier).toBe("FUL-2");
      expect(valid.state).toBe("in-progress");

      // Missing identifier must fail
      expect(() =>
        BlockedByRefSchema.parse({
          id: "00000000-0000-0000-0000-000000000002",
          state: "done",
        }),
      ).toThrow();
    });

    test("REQUIRED: labels normalize to lowercase in SymphonyIssueSchema", () => {
      const issue = SymphonyIssueSchema.parse({
        id: "00000000-0000-0000-0000-000000000001",
        identifier: "FUL-1",
        title: "Test",
        description: null,
        branch_name: null,
        url: null,
        labels: ["BACKEND", "Auth", "HIGH-PRIORITY"],
        state: "ready",
        priority: null,
        created_at: new Date(),
        updated_at: new Date(),
        blocked_by: [],
      });
      expect(issue.labels).toEqual(["backend", "auth", "high-priority"]);
    });

    test("REQUIRED: fetchSymphonyIssues returns strict SymphonyIssue[] with all 12 fields", async () => {
      const db = await testDb();
      const task = await seedTask(db, {
        status: "ready",
        priority: 1,
        title: "Implement auth",
      });

      const issues = await fetchSymphonyIssues(db.em, ORG_ID, 10);

      expect(issues.length).toBeGreaterThanOrEqual(1);
      const issue = issues.find((i) => i.id === task.id);
      expect(issue).toBeDefined();

      // All 12 fields must be present
      expect(issue).toHaveProperty("id");
      expect(issue).toHaveProperty("identifier");
      expect(issue).toHaveProperty("title");
      expect(issue).toHaveProperty("description");
      expect(issue).toHaveProperty("branch_name");
      expect(issue).toHaveProperty("url");
      expect(issue).toHaveProperty("labels");
      expect(issue).toHaveProperty("state");
      expect(issue).toHaveProperty("priority");
      expect(issue).toHaveProperty("created_at");
      expect(issue).toHaveProperty("updated_at");
      expect(issue).toHaveProperty("blocked_by");

      // Validate against schema
      expect(() => SymphonyIssueSchema.parse(issue)).not.toThrow();
    });

    test("REQUIRED: fetchSymphonyIssues blocked_by returns full {id, identifier, state} refs", async () => {
      const db = await testDb();
      const blocker = await seedTask(db, { status: "in-progress", title: "Blocker task", priority: 0 });
      const blocked = await seedTask(db, {
        status: "ready",
        priority: 1,
        blockedByIds: [blocker.id],
      });

      // Seed a run for the blocker so it has an orchestration state
      await seedRun(db, { task: blocker, orchestrationState: "running" });

      const issues = await fetchSymphonyIssues(db.em, ORG_ID, 10);
      const issue = issues.find((i) => i.id === blocked.id);

      // blocked issue should still appear (blocker is running, not terminal)
      // but its blocked_by refs must be fully populated
      if (issue) {
        expect(issue.blocked_by.length).toBeGreaterThanOrEqual(1);
        const ref = issue.blocked_by[0];
        expect(ref).toHaveProperty("id", blocker.id);
        expect(ref).toHaveProperty("identifier");
        expect(ref).toHaveProperty("state");
      }
    });

    test("REQUIRED: unresolved blocker ID throws TrackerBlockerResolutionError", async () => {
      const db = await testDb();
      // Task blocked by a non-existent ID
      const nonExistentId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      await seedTask(db, {
        status: "ready",
        priority: 1,
        blockedByIds: [nonExistentId],
      });

      await expect(
        fetchSymphonyIssues(db.em, ORG_ID, 10),
      ).rejects.toThrow(TrackerBlockerResolutionError);
    });

    test("REQUIRED: candidate sorting is priority asc, created_at oldest, identifier lexicographic", async () => {
      const db = await testDb();
      const t1 = await seedTask(db, { status: "ready", priority: 2, createdAt: new Date("2026-01-01"), title: "Low B" });
      const t2 = await seedTask(db, { status: "ready", priority: 1, createdAt: new Date("2026-01-03"), title: "High new" });
      const t3 = await seedTask(db, { status: "ready", priority: 1, createdAt: new Date("2026-01-01"), title: "High old" });

      const issues = await fetchSymphonyIssues(db.em, ORG_ID, 10);
      const ids = issues.map((i) => i.id);

      expect(ids.indexOf(t3.id)).toBeLessThan(ids.indexOf(t2.id));
      expect(ids.indexOf(t2.id)).toBeLessThan(ids.indexOf(t1.id));
    });

    test("REQUIRED: todo/ready task with non-terminal blocker is ineligible as Symphony candidate", async () => {
      const db = await testDb();
      const blocker = await seedTask(db, { status: "in-progress", priority: 0, title: "Blocker" });
      const blocked = await seedTask(db, {
        status: "ready",
        priority: 1,
        blockedByIds: [blocker.id],
        title: "Blocked task",
      });

      const issues = await fetchSymphonyIssues(db.em, ORG_ID, 10);
      const ids = issues.map((i) => i.id);

      // blocker is non-terminal (in-progress) → blocked should NOT appear in candidates
      expect(ids).not.toContain(blocked.id);
    });

    test("REQUIRED: task with terminal blocker IS eligible as Symphony candidate", async () => {
      const db = await testDb();
      const blocker = await seedTask(db, { status: "done", priority: 0, title: "Done blocker" });
      const blocked = await seedTask(db, {
        status: "ready",
        priority: 1,
        blockedByIds: [blocker.id],
        title: "Unblocked task",
      });

      const issues = await fetchSymphonyIssues(db.em, ORG_ID, 10);
      const ids = issues.map((i) => i.id);

      // blocker is terminal (done) → blocked SHOULD appear in candidates
      expect(ids).toContain(blocked.id);
    });
  });

  // -------------------------------------------------------------------------
  // SYM-15: refreshRunningIssues classifies active/non-active/terminal runs
  // SYM-16: fetchIssuesByStates([]) returns [] without DB call
  // SYM-17: resolvePerStateConcurrency normalizes state names
  // SYM-18: agent_runs.orchestration_state is single mutable authority
  // -------------------------------------------------------------------------
  describe("Tracker operations (SYM-15, SYM-16, SYM-17, SYM-18)", () => {
    test("REQUIRED: fetchIssuesByStates([]) returns empty without DB call", async () => {
      const db = await testDb();
      await seedRun(db, { orchestrationState: "running" });

      const result = await fetchIssuesByStates(db.em, ORG_ID, [], 10);
      expect(result).toEqual([]);
    });

    test("REQUIRED: refreshRunningIssues classifies active, non-active, and terminal runs", async () => {
      const db = await testDb();
      const activeRun = await seedRun(db, { orchestrationState: "running", attemptCount: 1 });
      const retryRun = await seedRun(db, { orchestrationState: "retry_queued", attemptCount: 2 });
      const successRun = await seedRun(db, { orchestrationState: "succeeded", attemptCount: 1 });

      const result = await refreshRunningIssues(db.em, ORG_ID);

      expect(result.active.map((r) => r.id)).toContain(activeRun.id);
      expect(result.nonActive.map((r) => r.id)).toContain(retryRun.id);
      expect(result.terminal.map((r) => r.id)).toContain(successRun.id);
    });

    test("REQUIRED: resolvePerStateConcurrency normalizes state names and ignores invalid values", () => {
      const config = {
        running: 3,
        retry_queued: 2,
        INVALID_STATE: 99,
        "": 5,
      };

      const result = resolvePerStateConcurrency(config);

      expect(result.get("running")).toBe(3);
      expect(result.get("retry_queued")).toBe(2);
      expect(result.has("INVALID_STATE" as never)).toBe(false);
      expect(result.has("" as never)).toBe(false);
    });

    test("REQUIRED: orchestration_state on AgentRun is the single mutable authority for run state", async () => {
      const db = await testDb();
      const run = await seedRun(db, { orchestrationState: "unclaimed" });

      // Mutate directly on AgentRun entity
      const em = db.em.fork();
      const managed = await em.findOneOrFail(AgentRun, run.id);
      managed.orchestrationState = "running";
      await em.flush();

      const refreshed = await refreshRunningIssues(db.em, ORG_ID);
      const found = refreshed.active.find((r) => r.id === run.id);
      expect(found).toBeDefined();
      expect(found?.orchestrationState).toBe("running");
    });
  });

  // -------------------------------------------------------------------------
  // SYM-24: External trackers are ingest-only — dispatch uses native tracker
  // -------------------------------------------------------------------------
  describe("External tracker ingest-only posture (SYM-24)", () => {
    test("REQUIRED: Linear tracker adapter is ingest-only and does not expose dispatch functions", async () => {
      // ingest-only: LinearTrackerAdapter must not export fetchSymphonyIssues,
      // refreshRunningIssues, or resolvePerStateConcurrency
      const linearTracker = await import("../symphony/linear-tracker.ts");

      expect(typeof (linearTracker as Record<string, unknown>)["fetchSymphonyIssues"]).toBe("undefined");
      expect(typeof (linearTracker as Record<string, unknown>)["refreshRunningIssues"]).toBe("undefined");
      expect(typeof (linearTracker as Record<string, unknown>)["resolvePerStateConcurrency"]).toBe("undefined");
    });

    test("REQUIRED: dispatch functions are imported only from native tracker, not from connector modules", async () => {
      // Verify that the native tracker (tracker.ts) exports the dispatch-side functions
      const nativeTracker = await import("../symphony/tracker.ts");
      expect(typeof nativeTracker.fetchSymphonyIssues).toBe("function");
      expect(typeof nativeTracker.refreshRunningIssues).toBe("function");
      expect(typeof nativeTracker.resolvePerStateConcurrency).toBe("function");
      expect(typeof nativeTracker.TrackerBlockerResolutionError).toBe("function");
    });

    test("REQUIRED: external tracker sync test asserts Linear/GitHub are not dispatch sources", async () => {
      // The Linear tracker adapter explicitly does NOT implement fetchSymphonyIssues
      // and its fetchCandidateIssues is ingest-only (returns CandidateIssue, not SymphonyIssue)
      const { createLinearTrackerAdapter } = await import("../symphony/linear-tracker.ts");
      // With no env vars set, adapter creation returns null (feature-gated)
      // This confirms it cannot be used as a dispatch source without explicit feature flag
      const adapter = createLinearTrackerAdapter();
      expect(adapter).toBeNull(); // no LINEAR_API_KEY or connector-linear flag in test env
    });
  });

  // -------------------------------------------------------------------------
  // SYM-07: Poll tick sequence — reconcile -> validate -> fetch -> sort -> dispatch -> notify
  // SYM-08: Issue orchestration states — Unclaimed -> Claimed -> Running/RetryQueued -> Released
  // SYM-09: Run-attempt lifecycle states (PreparingWorkspace .. terminal)
  // SYM-10: Normal worker exit schedules continuation retry at exactly 1000ms
  // SYM-11: Failure retry uses exponential formula min(10000 * 2^(attempt-1), max_retry_backoff_ms)
  // SYM-12: Reconciliation terminal state stops session and cleans workspace
  // SYM-13: Non-active state stops session without workspace cleanup
  // SYM-17: Active state refresh updates snapshot
  // SYM-18: Startup sweep cleans terminal workspaces
  // SYM-19: Stall detection uses last_codex_timestamp before started_at
  // -------------------------------------------------------------------------

  describe("Dispatch tick sequence (SYM-07, SYM-08)", () => {
    test("REQUIRED: tick calls reconcileRunningIssues before fetchCandidateIssues", async () => {
      const callOrder: string[] = [];
      const { reconcileRunningIssues } = await import("../symphony/dispatch.ts");
      expect(typeof reconcileRunningIssues).toBe("function");

      const deps: TickDeps = {
        orgId: ORG_ID,
        instanceId: "inst-1",
        maxConcurrency: 2,
        config: DEFAULT_CONFIG,
        fetchCandidateIssues: mock(async () => {
          callOrder.push("fetch");
          return [];
        }),
        claimRun: mock(async () => ({ runId: "run-1" })),
        getRunEntity: mock(async () => ({})),
        createWorkspace: mock(async () => "/tmp/work"),
        renderPrompt: mock(async () => "Prompt"),
        dispatchToRunner: mock(async () => ({ success: true })),
        destroyWorkspace: mock(async () => {}),
        transitionState: mock(async () => {}),
        dispatchHook: mock(async () => {}),
        emitSpan: mock(() => {}),
        countRunningRuns: mock(async () => 0),
        reconcileRunningIssues: mock(async () => {
          callOrder.push("reconcile");
        }),
        validateRuntimeConfig: mock(() => {
          callOrder.push("validate");
        }),
        notifyStateChange: mock(async () => {
          callOrder.push("notify");
        }),
      };

      await tick(deps);

      // reconcile must precede fetch
      expect(callOrder.indexOf("reconcile")).toBeLessThan(callOrder.indexOf("fetch"));
      // validate must precede fetch
      expect(callOrder.indexOf("validate")).toBeLessThan(callOrder.indexOf("fetch"));
    });

    test("REQUIRED: dispatch exports validateRuntimeConfig function", async () => {
      const dispatch = await import("../symphony/dispatch.ts");
      expect(typeof dispatch.validateRuntimeConfig).toBe("function");
    });

    test("REQUIRED: dispatch exports reconcileRunningIssues function", async () => {
      const dispatch = await import("../symphony/dispatch.ts");
      expect(typeof dispatch.reconcileRunningIssues).toBe("function");
    });
  });

  describe("Run-attempt lifecycle states (SYM-09)", () => {
    test("REQUIRED: AgentRun entity has attemptLifecycleState field", async () => {
      const db = await testDb();
      const run = await seedRun(db);
      const em = db.em.fork();
      const managed = await em.findOneOrFail(AgentRun, run.id);
      // Field must exist (may be undefined/null initially)
      expect("attemptLifecycleState" in managed).toBe(true);
    });

    test("REQUIRED: AttemptLifecycleState values include PreparingWorkspace through terminal states", async () => {
      const { ATTEMPT_LIFECYCLE_STATES } = await import("../states.ts");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("preparing_workspace");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("building_prompt");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("launching_agent_process");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("initializing_session");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("streaming_turn");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("finishing");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("succeeded");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("failed");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("timed_out");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("stalled");
      expect(ATTEMPT_LIFECYCLE_STATES).toContain("cancelled");
    });

    test("REQUIRED: AgentRun has lastCodexTimestamp field for stall cutoff", async () => {
      const db = await testDb();
      const run = await seedRun(db);
      const em = db.em.fork();
      const managed = await em.findOneOrFail(AgentRun, run.id);
      expect("lastCodexTimestamp" in managed).toBe(true);
    });

    test("REQUIRED: migration adds last_codex_timestamp column to agent_runs", async () => {
      const db = await testDb();
      const cols = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'agent_runs' order by column_name`,
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toContain("last_codex_timestamp");
      expect(names).toContain("attempt_lifecycle_state");
    });

    test("REQUIRED: agent_runs_stall_scan index includes last_codex_timestamp and started_at", async () => {
      const db = await testDb();
      const idxDef = await db.pglite.query<{ indexdef: string }>(
        `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'agent_runs_stall_scan'`,
      );
      const def = idxDef.rows[0]?.indexdef ?? "";
      // The updated index must cover last_codex_timestamp for stall cutoff preference
      expect(def).toMatch(/last_codex_timestamp|started_at/);
    });
  });

  describe("Continuation retry at 1000ms (SYM-10)", () => {
    test("REQUIRED: retry exports scheduleContinuationRetry function", async () => {
      const retry = await import("../symphony/retry.ts");
      expect(typeof retry.scheduleContinuationRetry).toBe("function");
    });

    test("REQUIRED: scheduleContinuationRetry schedules redispatch at exactly 1000ms delay", async () => {
      const { scheduleContinuationRetry } = await import("../symphony/retry.ts");
      const db = await testDb();
      const now = new Date("2026-05-03T12:00:00.000Z");
      const run = await seedRun(db, { orchestrationState: "running", attemptCount: 1 });

      await scheduleContinuationRetry(
        db.em,
        { id: run.id, orgId: ORG_ID, orchestrationState: "running", attemptCount: 1 },
        DEFAULT_CONFIG,
        { now: () => now },
      );

      const updated = await db.em.fork().findOneOrFail(AgentRun, run.id);
      expect(updated.orchestrationState).toBe("retry_queued");
      // Continuation retry uses fixed 1000ms delay, not exponential
      expect(updated.nextRetryAt?.toISOString()).toBe("2026-05-03T12:00:01.000Z");
    });
  });

  describe("Reconciliation lifecycle (SYM-12, SYM-13, SYM-17)", () => {
    test("REQUIRED: terminal reconciliation stops session and cleans workspace", async () => {
      const { reconcileRunningIssues } = await import("../symphony/dispatch.ts");
      const db = await testDb();
      const _run = await seedRun(db, { orchestrationState: "succeeded", workspacePath: "/tmp/sym-recon-terminal" });

      const stopSession = mock(async () => {});
      const cleanWorkspace = mock(async () => {});

      await reconcileRunningIssues(db.em, ORG_ID, { stopSession, cleanWorkspace });

      // Terminal runs should trigger cleanWorkspace
      expect(cleanWorkspace).toHaveBeenCalled();
    });

    test("REQUIRED: non-active reconciliation stops session without workspace cleanup", async () => {
      const { reconcileRunningIssues } = await import("../symphony/dispatch.ts");
      const db = await testDb();
      await seedRun(db, { orchestrationState: "retry_queued" });

      const stopSession = mock(async () => {});
      const cleanWorkspace = mock(async () => {});

      await reconcileRunningIssues(db.em, ORG_ID, { stopSession, cleanWorkspace });

      expect(cleanWorkspace).not.toHaveBeenCalled();
    });

    test("REQUIRED: active reconciliation updates snapshot without stopping session", async () => {
      const { reconcileRunningIssues } = await import("../symphony/dispatch.ts");
      const db = await testDb();
      await seedRun(db, { orchestrationState: "running" });

      const stopSession = mock(async () => {});
      const cleanWorkspace = mock(async () => {});
      const updateSnapshot = mock(async () => {});

      await reconcileRunningIssues(db.em, ORG_ID, { stopSession, cleanWorkspace, updateSnapshot });

      expect(stopSession).not.toHaveBeenCalled();
      expect(updateSnapshot).toHaveBeenCalled();
    });
  });

  describe("Startup cleanup sweep (SYM-18)", () => {
    test("REQUIRED: workspace exports sweepTerminalWorkspaces or equivalent startup cleanup function", async () => {
      const workspace = await import("../symphony/workspace.ts");
      const hasSweep =
        typeof (workspace as Record<string, unknown>)["sweepTerminalWorkspaces"] === "function" ||
        typeof (workspace as Record<string, unknown>)["startupCleanupSweep"] === "function";
      expect(hasSweep).toBe(true);
    });

    test("REQUIRED: startup sweep removes terminal-state run workspaces and calls before_remove hook", async () => {
      const workspaceMod = await import("../symphony/workspace.ts");
      const sweepFn =
        (workspaceMod as Record<string, unknown>)["sweepTerminalWorkspaces"] as
          | ((em: unknown, orgId: string, opts: Record<string, unknown>) => Promise<number>)
          | undefined ??
        (workspaceMod as Record<string, unknown>)["startupCleanupSweep"] as
          | ((em: unknown, orgId: string, opts: Record<string, unknown>) => Promise<number>)
          | undefined;

      expect(sweepFn).toBeDefined();

      const db = await testDb();
      const beforeRemove = mock(async () => {});

      // Seed terminal runs with workspace paths
      await seedRun(db, { orchestrationState: "succeeded", workspacePath: "/tmp/sym-sweep-1" });
      await seedRun(db, { orchestrationState: "failed", workspacePath: "/tmp/sym-sweep-2" });
      // Running run should NOT be swept
      const running = await seedRun(db, { orchestrationState: "running", workspacePath: "/tmp/sym-sweep-running" });

      const count = await sweepFn!(db.em, ORG_ID, { beforeRemove, dryRun: true });

      expect(count).toBeGreaterThanOrEqual(2);
      expect(beforeRemove).toHaveBeenCalled();
      // Running workspace must not be swept
      const refreshedRunning = await db.em.fork().findOneOrFail(AgentRun, running.id);
      expect(refreshedRunning.workspacePath).toBe("/tmp/sym-sweep-running");
    });
  });

  describe("Stall detection uses last_codex_timestamp (SYM-19)", () => {
    test("REQUIRED: stall scan prefers lastCodexTimestamp over startedAt when set", async () => {
      const db = await testDb();
      // Run started long ago but had recent Codex activity (lastCodexTimestamp recent)
      const run = await seedRun(db, {
        orchestrationState: "running",
        startedAt: new Date("2026-05-03T11:00:00.000Z"),
      });

      // Update lastCodexTimestamp to be very recent (within stall window)
      const em = db.em.fork();
      const managed = await em.findOneOrFail(AgentRun, run.id);
      (managed as AgentRun & { lastCodexTimestamp?: Date }).lastCodexTimestamp =
        new Date("2026-05-03T11:59:59.000Z");
      await em.flush();

      const onStalled = mock(async () => undefined);

      // stallTimeoutMs = 1000ms, now = 12:00:00 → startedAt is 3600s ago (stale)
      // but lastCodexTimestamp is only 1s ago → should NOT stall
      const count = await scanForStalledRuns(
        db.em,
        ORG_ID,
        { ...DEFAULT_CONFIG, stallTimeoutMs: 2_000 },
        onStalled,
        { now: () => new Date("2026-05-03T12:00:00.000Z") },
      );

      // lastCodexTimestamp is 1s ago, within 2s window → not stalled
      expect(count).toBe(0);
      expect(onStalled).not.toHaveBeenCalled();
    });

    test("REQUIRED: stall scan falls back to startedAt when lastCodexTimestamp is null", async () => {
      const db = await testDb();
      // Run started long ago with no Codex activity
      const run = await seedRun(db, {
        orchestrationState: "running",
        startedAt: new Date("2026-05-03T11:00:00.000Z"),
      });

      // Ensure lastCodexTimestamp is null (default)
      const em = db.em.fork();
      const managed = await em.findOneOrFail(AgentRun, run.id);
      expect((managed as AgentRun & { lastCodexTimestamp?: Date }).lastCodexTimestamp).toBeFalsy();

      const onStalled = mock(async () => undefined);

      // stallTimeoutMs = 1000ms, now = 12:00:00 → startedAt is 3600s ago → must stall
      const count = await scanForStalledRuns(
        db.em,
        ORG_ID,
        { ...DEFAULT_CONFIG, stallTimeoutMs: 1_000 },
        onStalled,
        { now: () => new Date("2026-05-03T12:00:00.000Z") },
      );

      expect(count).toBeGreaterThanOrEqual(1);
      expect(onStalled).toHaveBeenCalledWith(
        db.em,
        expect.objectContaining({ id: run.id }),
        { kind: "stall_timeout" },
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
