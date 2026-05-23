import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import {
  FULCRUM_JOB_QUEUE_ENTITIES,
  FulcrumJobEntity,
} from "@platform-core/infrastructure/database/job-queue.entities.ts";
import { JobQueue1778751000000 } from "@platform-core/infrastructure/database/job-queue.migration.ts";
import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { AgentRunPublicStore } from "@execution-orchestration/infrastructure/database/agent-run-public-store.ts";
import {
  AgentRunPublicApiController,
  AgentRunPublicApiService,
  AgentRunPublicRunsController,
} from "@execution-orchestration/interface/http/agent-run-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumAgentRunEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const TASK_ID = "77777777-7777-4777-8777-777777777777";
const BLOCKER_TASK_ID = "88888888-8888-4888-8888-888888888888";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertAgentRunPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ...FULCRUM_JOB_QUEUE_ENTITIES,
      ],
      migrations: [
        WorkflowSpine1778623200001,
        RunContext1778623200005,
        JobQueue1778751000000,
      ],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "RunContext1778623200005",
      "JobQueue1778751000000",
    ]);

    await dataSource.getRepository(FulcrumWorkspaceEntity).save([
      { id: ORG_ID, slug: `workspace-${source}`, name: "Workspace" },
      { id: OTHER_ORG_ID, slug: `other-workspace-${source}`, name: "Other Workspace" },
    ]);
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `project-${source}`,
        name: "Project",
        traceId: `trace-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: OTHER_ORG_ID,
        slug: `other-project-${source}`,
        name: "Other Project",
        traceId: `trace-other-project-${source}`,
      },
    ]);
    await dataSource.getRepository(FulcrumTaskEntity).save([
      {
        id: TASK_ID,
        projectId: PROJECT_ID,
        externalId: "TASK-1",
        title: "Run task",
        description: null,
        descriptionText: null,
        tiptapContent: {},
        status: "ready",
        priority: 3,
        points: null,
        assigneeId: null,
        successCriteria: ["Run completes"],
        traceId: `trace-task-${source}`,
        deletedAt: null,
      },
      {
        id: BLOCKER_TASK_ID,
        projectId: PROJECT_ID,
        externalId: "TASK-0",
        title: "Resolved prerequisite",
        description: null,
        descriptionText: null,
        tiptapContent: {},
        status: "done",
        priority: 1,
        points: null,
        assigneeId: null,
        successCriteria: [],
        traceId: `trace-blocker-${source}`,
        deletedAt: null,
      },
    ]);
    await dataSource.getRepository(FulcrumTaskDependencyEntity).save({
      id: `99999999-9999-4999-8999-${source === "postgres" ? "999999999999" : "999999999998"}`,
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      dependsOnTaskId: BLOCKER_TASK_ID,
      dependencyKind: "task_dependency",
      traceId: `trace-dependency-${source}`,
    });
    await dataSource.getRepository(FulcrumAgentRunEntity).save([
      {
        id: RUN_ID,
        projectId: PROJECT_ID,
        taskId: null,
        traceId: `trace-run-${source}`,
        status: "queued",
        dependencyTree: ["task-1", "task-2"],
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        projectId: OTHER_PROJECT_ID,
        taskId: null,
        traceId: `trace-other-run-${source}`,
        status: "queued",
        dependencyTree: [],
      },
    ]);

    const service = new AgentRunPublicApiService(
      { featuresEnv: "public-api" },
      new AgentRunPublicStore(dataSource),
    );
    const statusController = new AgentRunPublicApiController(service);
    const runsController = new AgentRunPublicRunsController(service);

    await expect(statusController.loadStatus({ orgId: ORG_ID })).resolves.toEqual(expect.objectContaining({
      queued: 1,
      running: 0,
      completed: 0,
      failed: 0,
      total: 1,
    }));
    await expect(statusController.loadRun({ identifier: RUN_ID }, { orgId: ORG_ID })).resolves.toEqual(expect.objectContaining({
      id: RUN_ID,
      projectId: PROJECT_ID,
      status: "queued",
      state: "queued",
      traceId: `trace-run-${source}`,
    }));
    await expect(statusController.refreshRuns({ orgId: ORG_ID })).resolves.toEqual({
      runs: [
        expect.objectContaining({ id: RUN_ID, status: "queued" }),
      ],
      count: 1,
    });
    await expect(statusController.listCandidateIssues({ orgId: ORG_ID, limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        id: TASK_ID,
        identifier: "TASK-1",
        title: "Run task",
        status: "ready",
        priority: 3,
        blockedByIds: [BLOCKER_TASK_ID],
      }),
    ]);
    await expect(statusController.listRunIssuesByStates({
      orgId: ORG_ID,
      states: "queued",
      limit: 10,
    })).resolves.toEqual([
      expect.objectContaining({
        id: RUN_ID,
        state: "queued",
        orchestrationState: "queued",
        task: null,
        attemptCount: 1,
        nextRetryAt: null,
        workspacePath: null,
        lastErrorKind: null,
      }),
    ]);
    await expect(runsController.listRuns({ orgId: ORG_ID, status: "queued" })).resolves.toEqual([
      expect.objectContaining({ id: RUN_ID, status: "queued" }),
    ]);
    await expect(runsController.listRuns({ orgId: ORG_ID, status: "completed" })).resolves.toEqual([]);

    const dispatchedRun = await runsController.dispatchRun({ orgId: ORG_ID }, {
      taskId: TASK_ID,
      agent: "codex",
      cwd: "/workspace/project",
      agentConfigJson: { model: "gpt-5.4", sandbox: "workspace-write" },
      traceId: `trace-dispatched-${source}`,
      dependencyTree: ["task-prerequisite"],
    });
    expect(dispatchedRun).toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      traceId: `trace-dispatched-${source}`,
      status: "queued",
      agent: "codex",
      cwd: "/workspace/project",
      agentConfig: { model: "gpt-5.4", sandbox: "workspace-write" },
      dependencyTree: ["task-prerequisite"],
    }));
    const dispatchedRunId = String((dispatchedRun as { id: string }).id);
    await expect(dataSource.getRepository(FulcrumJobEntity).findOneByOrFail({
      orgId: ORG_ID,
      queue: "agent-runs",
      kind: "agent_run",
      status: "queued",
    })).resolves.toMatchObject({
      projectId: PROJECT_ID,
      payload: {
        run_id: dispatchedRunId,
        runId: dispatchedRunId,
        task_id: TASK_ID,
        taskId: TASK_ID,
        traceId: `trace-dispatched-${source}`,
        agent: "codex",
        cwd: "/workspace/project",
        agentConfig: { model: "gpt-5.4", sandbox: "workspace-write" },
      },
      attempts: 0,
      maxAttempts: 3,
    });
    await expect(runsController.cancelRun({ identifier: dispatchedRunId }, { orgId: ORG_ID })).resolves.toEqual({ ok: true });
    await expect(runsController.cancelRun({ identifier: dispatchedRunId }, { orgId: ORG_ID })).resolves.toEqual({ ok: true });
    await expect(dataSource.getRepository(FulcrumJobEntity).findOneByOrFail({
      orgId: ORG_ID,
      queue: "agent-runs",
      kind: "agent_run",
      status: "cancelled",
    })).resolves.toMatchObject({
      payload: expect.objectContaining({ run_id: dispatchedRunId }),
    });
    await expect(runsController.cancelRun({ identifier: RUN_ID }, { orgId: ORG_ID })).resolves.toEqual({ ok: true });
    await expect(runsController.loadRun({ identifier: RUN_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: RUN_ID, status: "cancelled" }),
    );
    const retriedRun = await runsController.retryRun({ identifier: RUN_ID }, { orgId: ORG_ID });
    expect(retriedRun).toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      taskId: null,
      traceId: `trace-run-${source}`,
      status: "queued",
    }));
    await expect(runsController.retryRun({ identifier: RUN_ID }, { orgId: ORG_ID })).resolves.toEqual(
      expect.objectContaining({ id: (retriedRun as { id: string }).id }),
    );
    const jobs = await dataSource.getRepository(FulcrumJobEntity).find({
      where: { orgId: ORG_ID, queue: "agent-runs", kind: "agent_run" },
      order: { createdAt: "ASC", id: "ASC" },
    });
    expect(jobs.map((job) => job.payload)).toEqual([
      expect.objectContaining({ run_id: dispatchedRunId, agent: "codex" }),
      expect.objectContaining({ run_id: (retriedRun as { id: string }).id, agent: null }),
    ]);
    const events = await dataSource.getRepository(FulcrumRunEventEntity).find({
      order: { runId: "ASC", sequence: "ASC" },
    });
    expect(events).toContainEqual(expect.objectContaining({
      runId: dispatchedRunId,
      traceId: `trace-dispatched-${source}`,
      mutationType: "agent_run.dispatched",
      agentId: "codex",
      payload: expect.objectContaining({
        cwd: "/workspace/project",
        agentConfig: { model: "gpt-5.4", sandbox: "workspace-write" },
      }),
    }));
    expect(events.filter((event) => event.runId === dispatchedRunId).map((event) => event.mutationType)).toEqual([
      "agent_run.dispatched",
      "agent_run.cancelled",
    ]);
    expect(events.filter((event) => event.runId === RUN_ID).map((event) => event.mutationType)).toEqual([
      "agent_run.cancelled",
      "agent_run.retried",
    ]);
    await expect(statusController.loadRun({ identifier: "missing" }, { orgId: ORG_ID })).rejects.toBeInstanceOf(NotFoundException);
  } finally {
    await dataSource.destroy();
  }
}

describe("agent-run public API TypeORM persistence", () => {
  test("serves status, lookup, refresh, and list through PGlite socket", async () => {
    await assertAgentRunPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves status, lookup, refresh, and list through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertAgentRunPublicApiRoundTrip("postgres", postgres.url);
  });
});
