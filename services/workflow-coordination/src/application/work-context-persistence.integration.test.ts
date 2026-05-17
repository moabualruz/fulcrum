import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
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
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import {
  WorkContextPersistenceService,
  type WorkContextTraceInput,
} from "@workflow-coordination/application/work-context-persistence.service.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

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
});

function validContextTrace(): WorkContextTraceInput {
  return {
    projectId: "project-context-service",
    traceId: "trace-context-service",
    taskId: "task-context-service",
    runId: "run-context-service",
    contextBundle: {
      id: "context-service",
      purpose: "acp_planning",
      sourceRefs: [
        { kind: "doc", id: "doc-context-service", role: "freeform" },
        { kind: "task", id: "task-context-service", role: "success_criteria" },
        { kind: "memory", id: "memory-context-service", role: "durable_decision" },
      ],
      bundleJson: {
        prompt: "Create plan from deterministic context.",
        sections: [{ kind: "doc", id: "doc-context-service" }],
      },
      tokenCount: 384,
      sourceCounts: { docs: 1, tasks: 1, memories: 1 },
    },
    memory: {
      id: "memory-context-service",
      scope: "project",
      kind: "decision",
      body: "Keep freeform docs, memory, and run lineage together for ACP planning.",
      tags: ["context", "memory", "run"],
      importance: "high",
      source: "manual",
      sourceRef: { plan: "cycle" },
    },
    memoryLinks: [
      { id: "memory-link-doc-service", targetKind: "doc", targetId: "doc-context-service" },
      { id: "memory-link-run-service", targetKind: "agent_run", targetId: "run-context-service" },
    ],
    runEvents: [
      {
        id: "run-event-doc-service",
        sequence: 1,
        domain: "database",
        mutationType: "document:write",
        targetKind: "doc",
        targetId: "doc-context-service",
        agentId: "codex",
        taskLineageId: "lineage-context-service",
        payload: { phase: "planning" },
      },
      {
        id: "run-event-bundle-service",
        sequence: 2,
        domain: "executor",
        mutationType: "context:bundle-created",
        targetKind: "context_bundle",
        targetId: "context-service",
        agentId: "codex",
        taskLineageId: "lineage-context-service",
        payload: { tokenCount: 384 },
      },
    ],
  };
}

describe("Work context TypeORM persistence service", () => {
  test("persists and reloads context bundle, memory, links, and run events", async () => {
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url: await startPgliteSocket(),
        entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES,...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
        ],
        migrations: [WorkflowSpine1778623200001, RunContext1778623200005],
      }),);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(FulcrumWorkspaceEntity).save({
        id: "workspace-context-service",
        slug: "context-service",
        name: "Context service workspace",
      });
      await dataSource.getRepository(FulcrumProjectEntity).save({
        id: "project-context-service",
        workspaceId: "workspace-context-service",
        slug: "context-service",
        name: "Context service project",
        traceId: "trace-context-service",
      });
      await dataSource.getRepository(FulcrumTaskEntity).save({
        id: "task-context-service",
        projectId: "project-context-service",
        title: "Context service task",
        status: "queued",
        successCriteria: ["Context and run lineage reload"],
        traceId: "trace-context-service",
      });
      await dataSource.getRepository(FulcrumDocumentEntity).save({
        id: "doc-context-service",
        projectId: "project-context-service",
        title: "Context source doc",
        bodyMd: "Source doc for ACP planning.",
        sourceType: "freeform",
        traceId: "trace-context-service",
      });
      await dataSource.getRepository(FulcrumAgentRunEntity).save({
        id: "run-context-service",
        projectId: "project-context-service",
        taskId: "task-context-service",
        traceId: "trace-context-service",
        status: "running",
        dependencyTree: ["task-context-service"],
      });

      const service = new WorkContextPersistenceService(dataSource);
      await service.persistContextTrace(validContextTrace());

      await expect(service.loadContextTrace("trace-context-service")).resolves.toEqual({
        traceId: "trace-context-service",
        projectId: "project-context-service",
        contextBundleIds: ["context-service"],
        memoryIds: ["memory-context-service"],
        memoryLinks: [
          { targetKind: "agent_run", targetId: "run-context-service" },
          { targetKind: "doc", targetId: "doc-context-service" },
        ],
        runEvents: [
          {
            id: "run-event-doc-service",
            runId: "run-context-service",
            sequence: 1,
            domain: "database",
            mutationType: "document:write",
            targetKind: "doc",
            targetId: "doc-context-service",
          },
          {
            id: "run-event-bundle-service",
            runId: "run-context-service",
            sequence: 2,
            domain: "executor",
            mutationType: "context:bundle-created",
            targetKind: "context_bundle",
            targetId: "context-service",
          },
        ],
      });
    } finally {
      await dataSource.destroy();
    }
  });
});
