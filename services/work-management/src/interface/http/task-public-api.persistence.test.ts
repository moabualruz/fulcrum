import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";

import { TaskPublicStore } from "@work-management/infrastructure/database/task-public-store.ts";
import {
  WorkManagement1778623200003,
} from "@work-management/infrastructure/database/work-structure.migration.ts";
import {
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
  WorkManagementLabelEntity,
  WorkManagementModuleEntity,
  WorkManagementModuleTaskEntity,
  WorkManagementStateEntity,
  WorkManagementTaskLabelEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  TaskPublicApiController,
  TaskPublicApiService,
} from "@work-management/interface/http/task-public-api.controller.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnectionSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";
const TASK_BLOCKER_ID = "66666666-6666-4666-8666-666666666666";
const TASK_BLOCKED_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_TASK_ID = "88888888-8888-4888-8888-888888888888";

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

async function assertTaskPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: [
        ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
        ...WORK_MANAGEMENT_ENTITIES,
      ],
      migrations: [
        WorkflowSpine1778623200001,
        WorkManagement1778623200003,
      ],
    }),
  );

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: ORG_ID,
      slug: `tasks-${source}`,
      name: "Tasks",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save([
      {
        id: PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `task-project-${source}`,
        name: "Task Project",
        traceId: `trace-task-project-${source}`,
      },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: ORG_ID,
        slug: `other-task-project-${source}`,
        name: "Other Task Project",
        traceId: `trace-other-task-project-${source}`,
      },
    ]);
    await dataSource.getRepository(FulcrumTaskEntity).save({
      id: TASK_ID,
      projectId: PROJECT_ID,
      title: "Existing task",
      description: "Old description",
      descriptionText: "Old description",
      tiptapContent: { type: "doc", content: [] },
      status: "todo",
      priority: 3,
      points: 5,
      assigneeId: USER_ID,
      successCriteria: ["visible"],
      traceId: `trace-existing-task-${source}`,
    });

    const controller = new TaskPublicApiController(
      new TaskPublicApiService(
        { featuresEnv: "public-api,import-csv,export-csv" },
        new TaskPublicStore(dataSource),
      ),
    );

    await expect(controller.listTasks({
      orgId: ORG_ID,
      userId: USER_ID,
      project_id: PROJECT_ID,
    })).resolves.toEqual([
      expect.objectContaining({
        id: TASK_ID,
        title: "Existing task",
        status: "todo",
        priority: 3,
        points: 5,
        assigneeId: USER_ID,
      }),
    ]);
    await expect(controller.listTasks({
      orgId: ORG_ID,
      userId: USER_ID,
      project_id: OTHER_PROJECT_ID,
    })).resolves.toEqual([]);

    await dataSource.getRepository(FulcrumTaskEntity).save([
      {
        id: TASK_BLOCKER_ID,
        projectId: PROJECT_ID,
        title: "Blocking task",
        description: null,
        descriptionText: null,
        tiptapContent: {},
        status: "in_progress",
        priority: null,
        points: null,
        assigneeId: null,
        successCriteria: [],
        traceId: `trace-blocking-task-${source}`,
      },
      {
        id: TASK_BLOCKED_ID,
        projectId: PROJECT_ID,
        title: "Blocked task",
        description: null,
        descriptionText: null,
        tiptapContent: {},
        status: "todo",
        priority: null,
        points: null,
        assigneeId: null,
        successCriteria: [],
        traceId: `trace-blocked-task-${source}`,
      },
      {
        id: OTHER_TASK_ID,
        projectId: OTHER_PROJECT_ID,
        title: "Other project task",
        description: null,
        descriptionText: null,
        tiptapContent: {},
        status: "todo",
        priority: null,
        points: null,
        assigneeId: null,
        successCriteria: [],
        traceId: `trace-other-project-task-${source}`,
      },
    ]);
    await dataSource.getRepository(WorkManagementStateEntity).save({
      id: `state-started-${source}`,
      projectId: PROJECT_ID,
      name: "In Progress",
      group: "started",
      color: "#f59e0b",
      sequence: 30,
      isDefault: false,
      traceId: `trace-state-started-${source}`,
    });
    await dataSource.getRepository(WorkManagementLabelEntity).save({
      id: `label-agent-${source}`,
      projectId: PROJECT_ID,
      name: "agent",
      color: "#3f76ff",
      traceId: `trace-label-agent-${source}`,
    });
    await dataSource.getRepository(WorkManagementTaskLabelEntity).save({
      id: `task-label-agent-${source}`,
      projectId: PROJECT_ID,
      taskId: TASK_BLOCKER_ID,
      labelId: `label-agent-${source}`,
      traceId: `trace-task-label-agent-${source}`,
    });
    await dataSource.getRepository(WorkManagementCycleEntity).save({
      id: `cycle-foundation-${source}`,
      projectId: PROJECT_ID,
      name: "Foundation",
      status: "active",
      startsAt: null,
      endsAt: null,
      traceId: `trace-cycle-foundation-${source}`,
    });
    await dataSource.getRepository(WorkManagementCycleTaskEntity).save({
      id: `cycle-task-foundation-${source}`,
      projectId: PROJECT_ID,
      cycleId: `cycle-foundation-${source}`,
      taskId: TASK_BLOCKER_ID,
      traceId: `trace-cycle-task-foundation-${source}`,
    });
    await dataSource.getRepository(WorkManagementModuleEntity).save({
      id: `module-workbench-${source}`,
      projectId: PROJECT_ID,
      name: "Workbench",
      status: "active",
      leadUserId: null,
      traceId: `trace-module-workbench-${source}`,
    });
    await dataSource.getRepository(WorkManagementModuleTaskEntity).save({
      id: `module-task-workbench-${source}`,
      projectId: PROJECT_ID,
      moduleId: `module-workbench-${source}`,
      taskId: TASK_BLOCKER_ID,
      traceId: `trace-module-task-workbench-${source}`,
    });

    const manualWorkbench = await controller.manualTaskWorkbench({
      orgId: ORG_ID,
      userId: USER_ID,
      project_id: PROJECT_ID,
      traceId: `trace-workbench-${source}`,
      viewMode: "board",
      stateGroups: "started",
      labels: "agent",
      priorities: "",
      projectCapabilitiesEstimateEnabled: "true",
    });
    expect(manualWorkbench).toEqual(expect.objectContaining({
      projectId: PROJECT_ID,
      traceId: `trace-workbench-${source}`,
      layout: "kanban",
      filtersApplied: 2,
      listRows: [
        expect.objectContaining({
          id: TASK_BLOCKER_ID,
          labels: ["agent"],
          cycleId: `cycle-foundation-${source}`,
          moduleId: `module-workbench-${source}`,
        }),
      ],
      table: expect.objectContaining({
        visibleColumns: expect.arrayContaining([expect.objectContaining({ key: "estimate" })]),
      }),
    }));

    await expect(controller.setTaskParent(
      { id: TASK_BLOCKED_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID, parentId: TASK_ID },
    )).resolves.toEqual(expect.objectContaining({ id: TASK_BLOCKED_ID, parentId: TASK_ID }));
    await expect(controller.listTaskChildren(
      { id: TASK_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID },
    )).resolves.toEqual([expect.objectContaining({ id: TASK_BLOCKED_ID, parentId: TASK_ID })]);
    await expect(controller.setTaskParent(
      { id: TASK_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID, parentId: TASK_BLOCKED_ID },
    )).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(controller.setTaskParent(
      { id: TASK_BLOCKED_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID, parentId: null },
    )).resolves.toEqual(expect.objectContaining({ id: TASK_BLOCKED_ID, parentId: null }));

    const created = await controller.createTask({
      orgId: ORG_ID,
      userId: USER_ID,
      project_id: PROJECT_ID,
      title: "Created task",
      description: "New description",
      status: "in_progress",
      priority: 1,
      points: 8,
      assigneeId: USER_ID,
      traceId: `trace-created-task-${source}`,
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.traceId).toBe(`trace-created-task-${source}`);

    await expect(controller.getTask(
      { id: created.id },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID },
    )).resolves.toEqual(expect.objectContaining({
      id: created.id,
      title: "Created task",
      description: "New description",
      status: "in_progress",
      priority: 1,
      points: 8,
      assigneeId: USER_ID,
      traceId: `trace-created-task-${source}`,
    }));

    await expect(controller.patchTask(
      { id: created.id },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID, title: "Patched task", status: "done" },
    )).resolves.toEqual({ ok: true });
    await expect(controller.getTask(
      { id: created.id },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID },
    )).resolves.toEqual(expect.objectContaining({ title: "Patched task", status: "done" }));

    await expect(controller.setTaskDependencies(
      { id: TASK_ID },
      {
        orgId: ORG_ID,
        userId: USER_ID,
        project_id: PROJECT_ID,
        blocked_by: [TASK_BLOCKER_ID],
        blocks: [TASK_BLOCKED_ID],
      },
    )).resolves.toEqual({
      id: TASK_ID,
      projectId: PROJECT_ID,
      dependencies: {
        blocked_by: [TASK_BLOCKER_ID],
        blocks: [TASK_BLOCKED_ID],
      },
    });
    const dependencyRows = await dataSource.getRepository(FulcrumTaskDependencyEntity).find({
      where: { projectId: PROJECT_ID },
      order: { taskId: "ASC", dependsOnTaskId: "ASC" },
    });
    expect(dependencyRows.map((row) => [row.taskId, row.dependsOnTaskId])).toEqual([
      [TASK_ID, TASK_BLOCKER_ID],
      [TASK_BLOCKED_ID, TASK_ID],
    ]);
    await expect(controller.setTaskDependencies(
      { id: TASK_ID },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID, blocked_by: [OTHER_TASK_ID] },
    )).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(controller.deleteTask(
      { id: created.id },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID },
    )).resolves.toBeUndefined();
    await expect(controller.getTask(
      { id: created.id },
      { orgId: ORG_ID, userId: USER_ID, project_id: PROJECT_ID },
    )).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.listTasks({
      orgId: ORG_ID,
      userId: USER_ID,
      project_id: PROJECT_ID,
      include_deleted: "true",
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, deletedAt: expect.any(String) }),
    ]));

    const imported = await controller.importTasksCsv({
      entity: "tasks",
      projectId: PROJECT_ID,
      csv: "external_id,title,status\nEXT-1,CSV imported,todo",
    });
    expect(imported).toEqual({ created: 1, skipped: 0, errors: [] });

    const duplicate = await controller.importTasksCsv({
      entity: "tasks",
      projectId: PROJECT_ID,
      csv: "external_id,title,status\nEXT-1,CSV imported,todo",
    });
    expect(duplicate).toEqual({ created: 0, skipped: 1, errors: [] });

    const exported = await controller.exportTasksCsv({ entity: "tasks", projectId: PROJECT_ID });
    expect(exported.split("\n")[0]).toBe("id,external_id,title,status,created_at");
    expect(exported).toContain("EXT-1");
    expect(exported).toContain("CSV imported");

    await expect(controller.importTasksCsv({
      entity: "tasks",
      projectId: PROJECT_ID,
      csv: "external_id,status\nEXT-2,todo",
    })).rejects.toBeInstanceOf(UnprocessableEntityException);
  } finally {
    await dataSource.destroy();
  }
}

describe("task public API TypeORM persistence", () => {
  test("serves task CRUD through PGlite socket", async () => {
    await assertTaskPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  }, 60_000);

  test("serves task CRUD through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertTaskPublicApiRoundTrip("postgres", postgres.url);
  });
});
