import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BadRequestException, NotFoundException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "@fulcrum/server/app.module.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";
import { RoutingPublicStore } from "@execution-orchestration/infrastructure/database/routing-store.ts";
import {
  FULCRUM_ROUTING_ENTITIES,
  FulcrumRoutingDraftEntity,
} from "@execution-orchestration/infrastructure/database/routing.entities.ts";
import { Routing1778623200008 } from "@execution-orchestration/infrastructure/database/routing.migration.ts";
import {
  RoutingPublicApiController,
  RoutingPublicApiModule,
  RoutingPublicApiService,
} from "@execution-orchestration/interface/http/routing-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";

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

async function assertRoutingRoundTrip(source: FulcrumTypeOrmConnectionSource, url: string): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...FULCRUM_ROUTING_ENTITIES],
      migrations: [WorkflowSpine1778623200001, Routing1778623200008],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await seedRoutingProject(dataSource, source);
    const controller = new RoutingPublicApiController(
      new RoutingPublicApiService(
        { featuresEnv: "public-api" },
        new RoutingPublicStore(dataSource),
      ),
    );

    const created = await controller.createRule({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      projectId: `project-routing-${source}`,
      name: "Bug routing",
      conditionsJson: { all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }] },
      actionAgent: "codex",
      actionSkillSet: ["test-driven-development"],
      priority: 10,
      enabled: true,
      source: "manual",
    });
    expect(created).toMatchObject({
      orgId: `workspace-routing-${source}`,
      projectId: `project-routing-${source}`,
      name: "Bug routing",
      actionAgent: "codex",
      source: "manual",
    });

    await expect(controller.listRules({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      projectId: `project-routing-${source}`,
    })).resolves.toEqual([expect.objectContaining({ id: created.id, actionAgent: "codex" })]);
    await expect(controller.getRule(
      { id: created.id },
      { orgId: `workspace-routing-${source}`, userId: `user-routing-${source}` },
    )).resolves.toEqual(expect.objectContaining({ id: created.id, name: "Bug routing" }));
    await expect(controller.updateRule(
      { id: created.id },
      {
        orgId: `workspace-routing-${source}`,
        userId: `user-routing-${source}`,
        actionAgent: "claude",
        priority: 20,
      },
    )).resolves.toEqual(expect.objectContaining({ id: created.id, actionAgent: "claude", priority: 20 }));
    await expect(controller.dryRun({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      taskJson: {
        title: "Fix login",
        kind: "bug",
        priority: "high",
        tags: ["auth"],
        connectorContext: { provider: "github", repository: "fulcrum" },
      },
    })).resolves.toEqual(expect.objectContaining({
      status: "matched",
      matchedRuleId: created.id,
      confidence: 1,
      requestContext: expect.objectContaining({
        orgId: `workspace-routing-${source}`,
        userId: `user-routing-${source}`,
        connectorContext: { provider: "github", repository: "fulcrum" },
      }),
      evidence: expect.arrayContaining(["connector-context: included in routing facts"]),
    }));
    await expect(controller.testTask({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      taskId: `task-routing-${source}`,
    })).resolves.toEqual(expect.objectContaining({
      status: "matched",
      matchedRuleId: created.id,
      factsUsed: expect.objectContaining({ task: expect.objectContaining({ kind: "bug" }) }),
    }));
    const noMatch = await controller.testTask({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      taskId: `task-routing-unmatched-${source}`,
    });
    expect(noMatch).toEqual(expect.objectContaining({
      status: "draft_created",
      matchedRuleId: null,
      draftId: expect.any(String),
      requestContext: expect.objectContaining({
        orgId: `workspace-routing-${source}`,
        userId: `user-routing-${source}`,
      }),
      evidence: expect.arrayContaining([
        "llm-fallback: disabled unless router-llm feature is enabled",
        expect.stringContaining("draft-created:"),
      ]),
    }));
    await expect(dataSource.getRepository(FulcrumRoutingDraftEntity).findOneBy({
      id: noMatch.draftId ?? "",
      orgId: `workspace-routing-${source}`,
    })).resolves.toEqual(expect.objectContaining({
      enabled: false,
      status: "review_needed",
      source: "no_match",
    }));
    await dataSource.getRepository(FulcrumRoutingDraftEntity).save({
      id: `draft-routing-${source}`,
      orgId: `workspace-routing-${source}`,
      projectId: `project-routing-${source}`,
      status: "review_needed",
      enabled: false,
      taskFactsJson: { task: { kind: "chore", priority: "normal", tags: [], title: "Draft" } },
      noMatchReason: "No rule matched.",
      proposedConditionsJson: { all: [{ fact: "task", path: "$.kind", operator: "equal", value: "chore" }] },
      proposedActionsJson: { actionAgent: "codex", actionSkillSet: [] },
      source: "no_match",
      confidence: 0.7,
      backend: null,
      model: null,
      matchingActiveRuleIdsJson: [],
    });
    await expect(controller.listDrafts({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      status: "review_needed",
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ draftId: `draft-routing-${source}`, status: "review_needed" }),
    ]));
    await expect(controller.updateDraft(
      { id: `draft-routing-${source}` },
      { orgId: `workspace-routing-${source}`, userId: `user-routing-${source}`, actionAgent: "claude" },
    )).resolves.toEqual({ ok: true });
    await expect(controller.approveDraft(
      { id: `draft-routing-${source}` },
      { orgId: `workspace-routing-${source}`, userId: `user-routing-${source}` },
    )).resolves.toEqual({ ok: true });
    await expect(controller.updateLlmGate({
      orgId: `workspace-routing-${source}`,
      userId: `user-routing-${source}`,
      enabled: true,
      inputMode: "task_facts",
    })).resolves.toEqual({ ok: true, enabled: true, inputMode: "task_facts" });
    await expect(controller.deleteRule(
      { id: created.id },
      { orgId: `workspace-routing-${source}`, userId: `user-routing-${source}` },
    )).resolves.toEqual({ ok: true });
  } finally {
    await dataSource.destroy();
  }
}

describe("routing public Nest API", () => {
  test("is wired as a Nest controller and composed by the server app module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RoutingPublicApiModule) as unknown[];
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(controllers).toContain(RoutingPublicApiController);
    expect(appImports).toContain(RoutingPublicApiModule);
    expect(Reflect.getMetadata(PATH_METADATA, RoutingPublicApiController)).toBe("api/v1/routing");
    for (const method of ["createRule", "updateRule", "deleteRule", "dryRun", "testTask", "updateLlmGate"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(RoutingPublicApiController.prototype, method);
      expect(descriptor).toBeDefined();
      expect(Reflect.getMetadata(METHOD_METADATA, RoutingPublicApiController.prototype[method])).toBe(RequestMethod.POST);
    }
  });

  test("hides the default unconfigured route when the public API feature is off", async () => {
    const controller = new RoutingPublicApiController(new RoutingPublicApiService());

    await expect(controller.listRules({ orgId: "workspace-1", userId: "user-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test("rejects incomplete routing request context before public store dispatch", async () => {
    const controller = new RoutingPublicApiController(new RoutingPublicApiService(
      { featuresEnv: "public-api" },
      null,
    ));

    await expect(controller.dryRun({
      orgId: "",
      userId: "user-1",
      taskJson: { title: "Fix login", kind: "bug", priority: "high", tags: [], connectorContext: "github" },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  test("persists routing rules and decisions through PGlite socket", async () => {
    await assertRoutingRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists routing rules and decisions through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertRoutingRoundTrip("postgres", postgres.url);
  });
});

async function seedRoutingProject(
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>,
  source: FulcrumTypeOrmConnectionSource,
): Promise<void> {
  await dataSource.getRepository(FulcrumWorkspaceEntity).save({
    id: `workspace-routing-${source}`,
    slug: `routing-${source}`,
    name: "Routing",
  });
  await dataSource.getRepository(FulcrumProjectEntity).save({
    id: `project-routing-${source}`,
    workspaceId: `workspace-routing-${source}`,
    slug: `routing-${source}`,
    name: "Routing",
    traceId: `trace-routing-${source}`,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save({
    id: `task-routing-${source}`,
    projectId: `project-routing-${source}`,
    externalId: null,
    title: "Bug task",
    description: null,
    descriptionText: null,
    tiptapContent: {},
    status: "bug",
    priority: 3,
    points: null,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: [],
    traceId: `trace-task-routing-${source}`,
    deletedAt: null,
  });
  await dataSource.getRepository(FulcrumTaskEntity).save({
    id: `task-routing-unmatched-${source}`,
    projectId: `project-routing-${source}`,
    externalId: null,
    title: "Unmatched task",
    description: null,
    descriptionText: null,
    tiptapContent: {},
    status: "incident",
    priority: 2,
    points: null,
    assigneeId: null,
    parentTaskId: null,
    successCriteria: [],
    traceId: `trace-task-routing-unmatched-${source}`,
    deletedAt: null,
  });
}
