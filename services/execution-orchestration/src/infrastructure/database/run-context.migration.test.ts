import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
  FulcrumContextBundleEntity,
  FulcrumMemoryEntity,
  FulcrumMemoryLinkEntity,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

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

async function assertContextMemoryRunEventRoundTrip(
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
      ],
      migrations: [WorkflowSpine1778623200001, RunContext1778623200005],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "RunContext1778623200005",
    ]);

    const tables = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    ) as Array<{ table_name: string }>;
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "fulcrum_context_bundles",
        "fulcrum_memories",
        "fulcrum_memory_links",
        "fulcrum_run_events",
      ]),
    );

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: `workspace-context-${source}`,
      slug: `context-${source}`,
      name: "Context memory run workspace",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: `project-context-${source}`,
      workspaceId: `workspace-context-${source}`,
      slug: "context-memory-run",
      name: "Context memory run parity",
      traceId: `trace-context-${source}`,
    });
    await dataSource.getRepository(FulcrumTaskEntity).save({
      id: `task-context-${source}`,
      projectId: `project-context-${source}`,
      title: "Preserve context across ACP planning",
      status: "queued",
      successCriteria: ["Freeform docs are source refs", "Run events preserve lineage"],
      traceId: `trace-context-${source}`,
    });
    await dataSource.getRepository(FulcrumDocumentEntity).save({
      id: `doc-context-${source}`,
      projectId: `project-context-${source}`,
      title: "Freeform kickoff",
      bodyMd: "# Kickoff\nUse document workspace context in ACP planning.",
      sourceType: "freeform",
      traceId: `trace-context-${source}`,
    });
    await dataSource.getRepository(FulcrumAgentRunEntity).save({
      id: `run-context-${source}`,
      projectId: `project-context-${source}`,
      taskId: `task-context-${source}`,
      traceId: `trace-context-${source}`,
      status: "running",
      dependencyTree: [`task-context-${source}`],
    });

    await dataSource.getRepository(FulcrumMemoryEntity).save({
      id: `memory-context-${source}`,
      projectId: `project-context-${source}`,
      traceId: `trace-context-${source}`,
      scope: "project",
      kind: "decision",
      body: "Use cycle knowledge documents as deterministic ACP planning context.",
      tags: ["knowledge-base", "acp", "planning"],
      importance: "high",
      source: "manual",
      sourceRef: { kind: "user_prompt", path: "workflow-replacement-plan.md" },
      archived: false,
    });
    await dataSource.getRepository(FulcrumMemoryLinkEntity).save([
      {
        id: `memory-link-task-${source}`,
        projectId: `project-context-${source}`,
        memoryId: `memory-context-${source}`,
        targetKind: "task",
        targetId: `task-context-${source}`,
        traceId: `trace-context-${source}`,
      },
      {
        id: `memory-link-doc-${source}`,
        projectId: `project-context-${source}`,
        memoryId: `memory-context-${source}`,
        targetKind: "doc",
        targetId: `doc-context-${source}`,
        traceId: `trace-context-${source}`,
      },
    ]);
    await dataSource.getRepository(FulcrumContextBundleEntity).save({
      id: `context-bundle-${source}`,
      projectId: `project-context-${source}`,
      traceId: `trace-context-${source}`,
      taskId: `task-context-${source}`,
      runId: `run-context-${source}`,
      purpose: "acp_planning",
      sourceRefs: [
        { kind: "doc", id: `doc-context-${source}`, role: "freeform" },
        { kind: "task", id: `task-context-${source}`, role: "success_criteria" },
        { kind: "memory", id: `memory-context-${source}`, role: "durable_decision" },
      ],
      bundleJson: {
        prompt: "Create the next technical plan from freeform docs and durable memory.",
        sections: [
          { kind: "doc", id: `doc-context-${source}`, title: "Freeform kickoff" },
          { kind: "memory", id: `memory-context-${source}`, title: "Workflow decision" },
        ],
      },
      tokenCount: 512,
      sourceCounts: { docs: 1, tasks: 1, memories: 1, artifacts: 0 },
    });
    await dataSource.getRepository(FulcrumRunEventEntity).save([
      {
        id: `run-event-doc-${source}`,
        projectId: `project-context-${source}`,
        runId: `run-context-${source}`,
        taskId: `task-context-${source}`,
        traceId: `trace-context-${source}`,
        sequence: 1,
        domain: "database",
        mutationType: "document:write",
        targetKind: "doc",
        targetId: `doc-context-${source}`,
        agentId: "codex",
        taskLineageId: `lineage-context-${source}`,
        payload: { phase: "planning", source: "freeform" },
      },
      {
        id: `run-event-context-${source}`,
        projectId: `project-context-${source}`,
        runId: `run-context-${source}`,
        taskId: `task-context-${source}`,
        traceId: `trace-context-${source}`,
        sequence: 2,
        domain: "executor",
        mutationType: "context:bundle-created",
        targetKind: "context_bundle",
        targetId: `context-bundle-${source}`,
        agentId: "codex",
        taskLineageId: `lineage-context-${source}`,
        payload: { phase: "planning", tokenCount: 512 },
      },
    ]);

    const context = await dataSource.getRepository(FulcrumContextBundleEntity).findOneByOrFail({
      id: `context-bundle-${source}`,
    });
    expect(context).toMatchObject({
      purpose: "acp_planning",
      traceId: `trace-context-${source}`,
      sourceCounts: { docs: 1, tasks: 1, memories: 1, artifacts: 0 },
      tokenCount: 512,
    });
    expect(context.sourceRefs).toEqual([
      { kind: "doc", id: `doc-context-${source}`, role: "freeform" },
      { kind: "task", id: `task-context-${source}`, role: "success_criteria" },
      { kind: "memory", id: `memory-context-${source}`, role: "durable_decision" },
    ]);

    const memory = await dataSource.getRepository(FulcrumMemoryEntity).findOneByOrFail({
      id: `memory-context-${source}`,
    });
    expect(memory).toMatchObject({
      body: "Use cycle knowledge documents as deterministic ACP planning context.",
      importance: "high",
      tags: ["knowledge-base", "acp", "planning"],
      sourceRef: { kind: "user_prompt", path: "workflow-replacement-plan.md" },
    });

    const links = await dataSource.getRepository(FulcrumMemoryLinkEntity).find({
      where: { memoryId: `memory-context-${source}` },
      order: { targetKind: "ASC" },
    });
    expect(links.map((link) => ({
      targetKind: link.targetKind,
      targetId: link.targetId,
      traceId: link.traceId,
    }))).toEqual([
      { targetKind: "doc", targetId: `doc-context-${source}`, traceId: `trace-context-${source}` },
      { targetKind: "task", targetId: `task-context-${source}`, traceId: `trace-context-${source}` },
    ]);

    const runEvents = await dataSource.getRepository(FulcrumRunEventEntity).find({
      where: { runId: `run-context-${source}` },
      order: { sequence: "ASC" },
    });
    expect(runEvents.map((event) => ({
      domain: event.domain,
      mutationType: event.mutationType,
      targetKind: event.targetKind,
      taskLineageId: event.taskLineageId,
    }))).toEqual([
      {
        domain: "database",
        mutationType: "document:write",
        targetKind: "doc",
        taskLineageId: `lineage-context-${source}`,
      },
      {
        domain: "executor",
        mutationType: "context:bundle-created",
        targetKind: "context_bundle",
        taskLineageId: `lineage-context-${source}`,
      },
    ]);
  } finally {
    await dataSource.destroy();
  }
}

describe("TypeORM context, memory, and run-event migration", () => {
  test("persists deterministic context bundles, memories, links, and run events through PGlite socket", async () => {
    await assertContextMemoryRunEventRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists deterministic context bundles, memories, links, and run events through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertContextMemoryRunEventRoundTrip("postgres", postgres.url);
  });
});
