import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  WORK_MANAGEMENT_ENTITIES,
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
  WorkManagementFieldDependencyRuleEntity,
  WorkManagementIntakeEntity,
  WorkManagementLabelEntity,
  WorkManagementModuleEntity,
  WorkManagementModuleTaskEntity,
  WorkManagementNotificationEntity,
  WorkManagementSavedViewEntity,
  WorkManagementStateEntity,
  WorkManagementTaskLabelEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
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

async function assertWorkManagementRoundTrip(
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
      migrations: [WorkflowSpine1778623200001, WorkManagement1778623200003],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "WorkflowSpine1778623200001",
      "WorkManagement1778623200003",
    ]);

    const tables = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    ) as Array<{ table_name: string }>;
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "fulcrum_cycles",
        "fulcrum_cycle_tasks",
        "fulcrum_field_dependency_rules",
        "fulcrum_intake_requests",
        "fulcrum_modules",
        "fulcrum_module_tasks",
        "fulcrum_notifications",
        "fulcrum_saved_views",
        "fulcrum_task_label_assignments",
        "fulcrum_task_labels",
        "fulcrum_task_states",
      ]),
    );

    await dataSource.getRepository(FulcrumWorkspaceEntity).save({
      id: `workspace-work-${source}`,
      slug: `work-${source}`,
      name: "work management workspace",
    });
    await dataSource.getRepository(FulcrumProjectEntity).save({
      id: `project-work-${source}`,
      workspaceId: `workspace-work-${source}`,
      slug: "work-management",
      name: "work management parity",
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(FulcrumTaskEntity).save({
      id: `task-work-${source}`,
      projectId: `project-work-${source}`,
      title: "Manual PM task",
      status: "triage",
      successCriteria: ["usable without AI"],
      traceId: `trace-work-${source}`,
    });

    await dataSource.getRepository(WorkManagementStateEntity).save({
      id: `state-triage-${source}`,
      projectId: `project-work-${source}`,
      name: "Triage",
      group: "unstarted",
      color: "#94a3b8",
      sequence: 10,
      isDefault: true,
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementLabelEntity).save({
      id: `label-ux-${source}`,
      projectId: `project-work-${source}`,
      name: "UX",
      color: "#2563eb",
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementTaskLabelEntity).save({
      id: `task-label-ux-${source}`,
      projectId: `project-work-${source}`,
      taskId: `task-work-${source}`,
      labelId: `label-ux-${source}`,
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementCycleEntity).save({
      id: `cycle-alpha-${source}`,
      projectId: `project-work-${source}`,
      name: "Alpha cycle",
      status: "current",
      startsAt: new Date("2026-05-13T00:00:00.000Z"),
      endsAt: new Date("2026-05-27T00:00:00.000Z"),
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementCycleTaskEntity).save({
      id: `cycle-task-${source}`,
      projectId: `project-work-${source}`,
      cycleId: `cycle-alpha-${source}`,
      taskId: `task-work-${source}`,
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementModuleEntity).save({
      id: `module-workflows-${source}`,
      projectId: `project-work-${source}`,
      name: "Workflow replacement",
      status: "in_progress",
      leadUserId: "local-admin",
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementModuleTaskEntity).save({
      id: `module-task-${source}`,
      projectId: `project-work-${source}`,
      moduleId: `module-workflows-${source}`,
      taskId: `task-work-${source}`,
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementSavedViewEntity).save({
      id: `view-manual-${source}`,
      projectId: `project-work-${source}`,
      name: "Manual PM board",
      layout: "kanban",
      filters: { labels: ["UX"], stateGroups: ["unstarted"] },
      groupBy: "state",
      sortBy: "-updated_at",
      displayProperties: { showAssignee: true, showCycle: true, showModule: true },
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementIntakeEntity).save({
      id: `intake-request-${source}`,
      projectId: `project-work-${source}`,
      title: "Improve UX workflow",
      description: "Manual request captured before AI execution.",
      status: "accepted",
      source: "manual",
      taskId: `task-work-${source}`,
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementNotificationEntity).save({
      id: `notification-${source}`,
      workspaceId: `workspace-work-${source}`,
      projectId: `project-work-${source}`,
      taskId: `task-work-${source}`,
      type: "task_assigned",
      actorId: "local-admin",
      recipientId: "local-admin",
      readAt: null,
      payload: { title: "Manual PM task", state: "Triage" },
      traceId: `trace-work-${source}`,
    });
    await dataSource.getRepository(WorkManagementFieldDependencyRuleEntity).save({
      id: `field-dependency-${source}`,
      orgId: `workspace-work-${source}`,
      projectId: `project-work-${source}`,
      sourceFieldId: "type",
      sourceValue: "bug",
      targetFieldId: "severity",
      action: "require",
    });

    const view = await dataSource.getRepository(WorkManagementSavedViewEntity).findOneByOrFail({
      id: `view-manual-${source}`,
    });
    expect(view).toMatchObject({
      layout: "kanban",
      filters: { labels: ["UX"], stateGroups: ["unstarted"] },
      displayProperties: { showAssignee: true, showCycle: true, showModule: true },
      traceId: `trace-work-${source}`,
    });

    const notification = await dataSource.getRepository(WorkManagementNotificationEntity).findOneByOrFail({
      id: `notification-${source}`,
    });
    expect(notification).toMatchObject({
      recipientId: "local-admin",
      payload: { title: "Manual PM task", state: "Triage" },
    });

    const dependency = await dataSource.getRepository(WorkManagementFieldDependencyRuleEntity).findOneByOrFail({
      id: `field-dependency-${source}`,
    });
    expect(dependency).toMatchObject({
      sourceFieldId: "type",
      sourceValue: "bug",
      targetFieldId: "severity",
      action: "require",
    });
  } finally {
    await dataSource.destroy();
  }
}

describe("TypeORM work management migration", () => {
  test("persists work cycle/module/view/intake/label/state/notification mirrors through PGlite socket", async () => {
    await assertWorkManagementRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("persists work cycle/module/view/intake/label/state/notification mirrors through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertWorkManagementRoundTrip("postgres", postgres.url);
  });
});
