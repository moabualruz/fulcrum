import { describe, expect, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import { createTask, setDependencies } from "@work-management/application/work-item-commands.ts";
import {
  dispatchDependencyRunForTasks,
  previewDependencyRunForTasks,
} from "@execution-orchestration/application/dependency-run-actions.ts";
import {
  loadDependencyRunLiveFeedbackForTasks,
  recordDependencyRunLifecycleEventForTasks,
  runNextDependencyRunWorkerTickForTasks,
} from "@execution-orchestration/application/dependency-run-live-feedback.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

describe("dependency orchestration dependency run actions", () => {
  test("builds a trace-linked dependency disclosure preview from persisted Fulcrum tasks", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Run Preview Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const prerequisite = await createTask(em, ctx, {
        title: "Provision database",
        status: "completed",
        projectId: PROJECT_ID,
      });
      const implementation = await createTask(em, ctx, {
        title: "Implement dependency runner",
        status: "in_progress",
        projectId: PROJECT_ID,
      });
      const release = await createTask(em, ctx, {
        title: "Run release board",
        status: "pending",
        projectId: PROJECT_ID,
      });
      await createTask(em, ctx, {
        title: "Other project task",
        status: "pending",
      });
      em.clear();

      await setDependencies(em, ctx, implementation.id, {
        blocks: [release.id],
        blocked_by: [prerequisite.id],
      });
      await setDependencies(em, ctx, release.id, {
        blocks: [],
        blocked_by: [implementation.id],
      });

      const preview = await previewDependencyRunForTasks(em, { orgId: ORG_ID, userId: USER_ID }, {
        mode: "task",
        targetTaskIds: [release.id],
        projectId: PROJECT_ID,
        traceId: "trace-dependency-preview",
      });

      expect(preview.requiresDisclosure).toBe(true);
      expect(preview.traceId).toBe("trace-dependency-preview");
      expect(preview.targetTaskIds).toEqual([release.id]);
      expect(preview.orderedTaskIds).toEqual([prerequisite.id, implementation.id, release.id]);
      expect(preview.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        column: task.column,
        selected: task.selected,
        dependencyDepth: task.dependencyDepth,
      }))).toEqual([
        {
          id: prerequisite.id,
          title: "Provision database",
          column: "done",
          selected: false,
          dependencyDepth: 2,
        },
        {
          id: implementation.id,
          title: "Implement dependency runner",
          column: "in-progress",
          selected: false,
          dependencyDepth: 1,
        },
        {
          id: release.id,
          title: "Run release board",
          column: "todo",
          selected: true,
          dependencyDepth: 0,
        },
      ]);
      expect(preview.omittedTaskIds).not.toContain("Other project task");
      expect(preview.warnings).toContain(`Target ${release.id} requires 2 prerequisite task(s) before it runs.`);
      expect(preview.blocked).toBe(false);
    } finally {
      await db.close();
    }
  });

  test("dispatches dependency-tree runs in preview order while skipping satisfied tasks", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Dependency Dispatch Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const satisfied = await createTask(em, ctx, {
        title: "Provision database",
        status: "completed",
        projectId: PROJECT_ID,
      });
      const implementation = await createTask(em, ctx, {
        title: "Implement runner",
        status: "pending",
        projectId: PROJECT_ID,
      });
      const release = await createTask(em, ctx, {
        title: "Run release board",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();

      await setDependencies(em, ctx, implementation.id, {
        blocks: [release.id],
        blocked_by: [satisfied.id],
      });
      await setDependencies(em, ctx, release.id, {
        blocks: [],
        blocked_by: [implementation.id],
      });

      const result = await dispatchDependencyRunForTasks(em, { orgId: ORG_ID, userId: USER_ID }, {
        mode: "task",
        targetTaskIds: [release.id],
        projectId: PROJECT_ID,
        traceId: "trace-dependency-dispatch",
        agent: "codex",
        model: "gpt-dependency",
        prompt: "Ship this dependency tree",
      });

      expect(result.preview.orderedTaskIds).toEqual([satisfied.id, implementation.id, release.id]);
      expect(result.scheduledRuns.map((run) => run.taskId)).toEqual([implementation.id, release.id]);
      expect(result.skippedTasks).toEqual([
        {
          id: satisfied.id,
          title: "Provision database",
          column: "done",
          reason: "already satisfied",
        },
      ]);
      expect(result.runGroupId).toBe("trace-dependency-dispatch");

      const runRows = await em.getConnection().execute<Array<{
        id: string;
        task_id: string;
        agent_name: string;
        agent_version: string | null;
        thread_id: string | null;
        status: string;
      }>>(
        `select id, task_id, agent_name, agent_version, thread_id, status
           from agent_runs
          where org_id = ?
          order by started_at asc, id asc`,
        [ORG_ID],);
      expect(runRows.map((row) => row.task_id)).toEqual([implementation.id, release.id]);
      expect(runRows.every((row) => row.agent_name === "codex" && row.agent_version === "gpt-dependency")).toBe(true);
      expect(runRows.every((row) => row.status === "queued" && row.thread_id?.includes("trace-dependency-dispatch"))).toBe(true);

      const jobRows = await em.getConnection().execute<Array<{ payload: { run_id: string } }>>(
        `select payload from jobs where queue = 'agent-runs' order by available_at asc, id asc`,);
      expect(jobRows.map((row) => row.payload.run_id)).toEqual(runRows.map((row) => row.id));

      const eventRows = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload
           from events
          where subject_kind = 'task'
            and subject_id = ?
            and verb = 'dependency_tree_dispatched'
          order by created_at asc`,
        [release.id],);
      expect(eventRows).toEqual([
        expect.objectContaining({
          verb: "dependency_tree_dispatched",
          payload: expect.objectContaining({
            traceId: "trace-dependency-dispatch",
            targetTaskIds: [release.id],
            orderedTaskIds: [satisfied.id, implementation.id, release.id],
            scheduledTaskIds: [implementation.id, release.id],
            skippedTaskIds: [satisfied.id],
          }),
        }),
      ]);
    } finally {
      await db.close();
    }
  });

  test("records and loads run-audit live dependency-run feedback from current agent runs and events", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Dependency Live Feedback Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const prerequisite = await createTask(em, ctx, {
        title: "Prepare live feedback",
        status: "pending",
        projectId: PROJECT_ID,
      });
      const release = await createTask(em, ctx, {
        title: "Run live feedback target",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, release.id, {
        blocks: [],
        blocked_by: [prerequisite.id],
      });

      await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [release.id],
        projectId: PROJECT_ID,
        traceId: "trace-dependency-live",
        agent: "codex",
        model: "gpt-live",
        prompt: "Run with feedback",
      });
      const runRows = await em.getConnection().execute<Array<{
        id: string;
        task_id: string;
      }>>(
        `select id, task_id
           from agent_runs
          where org_id = ?
          order by started_at asc, id asc`,
        [ORG_ID],);

      await recordDependencyRunLifecycleEventForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-dependency-live",
        runId: runRows[0]!.id,
        taskId: prerequisite.id,
        status: "running",
        domain: "executor",
        mutationType: "agent_run_started",
        targetKind: "task",
        targetId: prerequisite.id,
        agentId: "codex",
        summary: "Started live dependency",
        output: "booting executor",
      });
      await recordDependencyRunLifecycleEventForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-dependency-live",
        runId: runRows[0]!.id,
        taskId: prerequisite.id,
        status: "succeeded",
        domain: "executor",
        mutationType: "agent_run_completed",
        targetKind: "task",
        targetId: prerequisite.id,
        agentId: "codex",
        summary: "Completed live dependency",
        output: "dependency ready",
      });

      const feedback = await loadDependencyRunLiveFeedbackForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-dependency-live",
      });

      expect(feedback).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-dependency-live",
        runGroupId: "trace-dependency-live",
        executorStatus: {
          queuedTaskCount: 1,
          runningTaskCount: 0,
          succeededTaskCount: 1,
          failedTaskCount: 0,
          blockedTaskCount: 0,
          inReviewCount: 0,
          active: true,
        },
      });
      expect(feedback.runs.map((run) => ({
        id: run.id,
        taskId: run.taskId,
        status: run.status,
        queuePosition: run.queuePosition,
        dependencyIds: run.dependencyIds,
        latestEventSummary: run.latestEventSummary,
      }))).toEqual([
        {
          id: runRows[0]!.id,
          taskId: prerequisite.id,
          status: "succeeded",
          queuePosition: 1,
          dependencyIds: [],
          latestEventSummary: "Completed live dependency",
        },
        {
          id: runRows[1]!.id,
          taskId: release.id,
          status: "queued",
          queuePosition: 2,
          dependencyIds: [prerequisite.id],
          latestEventSummary: null,
        },
      ]);
      expect(feedback.events.map((event) => ({
        runId: event.runId,
        mutationType: event.mutationType,
        summary: event.summary,
        output: event.output,
      }))).toEqual([
        {
          runId: runRows[0]!.id,
          mutationType: "dependency_tree_dispatched",
          summary: "Dependency tree dispatched",
          output: null,
        },
        {
          runId: runRows[0]!.id,
          mutationType: "agent_run_started",
          summary: "Started live dependency",
          output: "booting executor",
        },
        {
          runId: runRows[0]!.id,
          mutationType: "agent_run_completed",
          summary: "Completed live dependency",
          output: "dependency ready",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  test("does not dispatch when an included dependency is already in progress", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Blocked Dependency Dispatch Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const active = await createTask(em, ctx, {
        title: "Active prerequisite",
        status: "in_progress",
        projectId: PROJECT_ID,
      });
      const release = await createTask(em, ctx, {
        title: "Release target",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, release.id, {
        blocks: [],
        blocked_by: [active.id],
      });

      await expect(dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [release.id],
        projectId: PROJECT_ID,
        traceId: "trace-blocked-dispatch",
        agent: "codex",
      })).rejects.toThrow(/cannot dispatch dependency run/i);

      const runRows = await em.getConnection().execute<Array<{ id: string }>>(
        `select id from agent_runs where org_id = ?`,
        [ORG_ID],);
      expect(runRows).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("worker tick executes queued dependency runs in dependency order and records live output", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `insert into projects (id, org_id, name) values (?, ?, ?)`,
        [PROJECT_ID, ORG_ID, "Dependency Worker Project"],);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      const prerequisite = await createTask(em, ctx, {
        title: "Prepare worker dependency",
        status: "pending",
        projectId: PROJECT_ID,
      });
      const release = await createTask(em, ctx, {
        title: "Run worker target",
        status: "pending",
        projectId: PROJECT_ID,
      });
      em.clear();
      await setDependencies(em, ctx, release.id, {
        blocks: [],
        blocked_by: [prerequisite.id],
      });

      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [release.id],
        projectId: PROJECT_ID,
        traceId: "trace-worker-runner",
        agent: "codex",
        model: "gpt-worker",
        prompt: "Run actual dependency worker",
      });

      const runnerCalls: unknown[] = [];
      const firstTick = await runNextDependencyRunWorkerTickForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
        workerId: "worker-1",
      }, {
        runAgent: async (request) => {
          runnerCalls.push(request);
          return {
            transcript: "Prepared dependency\nCOMPLETE\n",
            exitCode: 0,
            filesChanged: [],
            artifacts: [],
            durationMs: 12,
            iterationCount: 1,
            exitReason: "complete",
            tokenUsed: 2,
          };
        },
      });

      expect(firstTick.processedRun).toMatchObject({
        taskId: prerequisite.id,
        status: "succeeded",
        agent: "codex",
      });
      expect(firstTick.processedRun).not.toBeNull;
      const firstProcessedRun = firstTick.processedRun!;
      expect(firstTick.feedback.executorStatus).toMatchObject({
        queuedTaskCount: 1,
        succeededTaskCount: 1,
        active: true,
      });

      const secondTick = await runNextDependencyRunWorkerTickForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
        workerId: "worker-1",
      }, {
        runAgent: async (request) => {
          runnerCalls.push(request);
          return {
            transcript: "Ran target\nCOMPLETE\n",
            exitCode: 0,
            filesChanged: [],
            artifacts: [],
            durationMs: 18,
            iterationCount: 1,
            exitReason: "complete",
            tokenUsed: 2,
          };
        },
      });

      expect(secondTick.processedRun).toMatchObject({
        taskId: release.id,
        status: "succeeded",
        agent: "codex",
      });
      expect(secondTick.processedRun).not.toBeNull;
      const secondProcessedRun = secondTick.processedRun!;
      expect(runnerCalls).toHaveLength(2);
      expect(runnerCalls[0]).toMatchObject({
        runId: firstProcessedRun.id,
        prompt: expect.stringContaining("trace-worker-runner"),
        contextBundle: expect.objectContaining({
          traceId: "trace-worker-runner",
          taskId: prerequisite.id,
          dependencyIds: [],
          queuePosition: 1,
        }),
      });
      expect(runnerCalls[1]).toMatchObject({
        contextBundle: expect.objectContaining({
          taskId: release.id,
          dependencyIds: [prerequisite.id],
          queuePosition: 2,
        }),
      });

      const feedback = await loadDependencyRunLiveFeedbackForTasks(em, ctx, {
        projectId: PROJECT_ID,
        traceId: dispatch.runGroupId,
      });
      expect(feedback.executorStatus).toMatchObject({
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 2,
        failedTaskCount: 0,
        active: false,
      });
      expect(feedback.events.map((event) => event.mutationType)).toEqual([
        "dependency_tree_dispatched",
        "agent_run_started",
        "agent_run_completed",
        "agent_run_started",
        "agent_run_completed",
      ]);
      const jobRows = await em.getConnection().execute<Array<{ status: string; payload: { run_id: string } }>>(
        `select status, payload from jobs where queue = 'agent-runs' order by available_at asc, id asc`,);
      expect(jobRows).toEqual([
        { status: "succeeded", payload: { run_id: firstProcessedRun.id } },
        { status: "succeeded", payload: { run_id: secondProcessedRun.id } },
      ]);
    } finally {
      await db.close();
    }
  });
});
