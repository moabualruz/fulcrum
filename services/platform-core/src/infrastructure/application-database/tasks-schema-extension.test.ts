import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { EntityName } from "typeorm";
import type { EntityManager, MikroORM, Options } from "typeorm";
import { MikroORM as MikroORMRuntime } from "typeorm";
import { PGlite } from "@electric-sql/pglite";

import { createTestOrm } from "@test-support/application-database.ts";
import { createOrmConfig } from "./mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "./seed.ts";
import { Org } from "./entities/auth/Org.ts";
import { Task } from "./entities/tasks/Task.ts";
import * as taskEntities from "./entities/tasks/index.ts";

const PRE_TASK_SCHEMA_MIGRATION = "Migration20260502080000_inference_cache_schema";
const TASK_SCHEMA_MIGRATION = "Migration20260502090000_tasks_schema_extension";

function metadataFor(em: EntityManager, entity: EntityName<unknown>) {
  return em.getMetadata().get(entity) as unknown as {
    tableName: string;
    properties: Record<string, {
      fieldNames?: string[];
      nullable?: boolean;
      default?: unknown;
      defaultRaw?: string;
    }>;
  };
}

function expectField(
  meta: ReturnType<typeof metadataFor>,
  property: string,
  fieldName: string,
) {
  expect(meta.properties[property]).toBeDefined();
  expect(meta.properties[property]?.fieldNames).toEqual([fieldName]);
}

async function createOrmWithSprintsBeforeTaskMigration(): Promise<{
  orm: MikroORM;
  em: EntityManager;
  pglite: PGlite;
  close: () => Promise<void>;
}> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    snapshot: false,
  };
  const orm = await MikroORMRuntime.init(config);
  await orm.migrator.up({ to: PRE_TASK_SCHEMA_MIGRATION });
  await pglite.query(
    `create table "sprints" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "name" varchar(255) not null, primary key ("id"))`,
  );
  await pglite.query(
    `alter table "sprints" add constraint "sprints_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
  );
  await orm.migrator.up({ to: TASK_SCHEMA_MIGRATION });
  await new SeedService(orm.em).run();

  return {
    orm,
    em: orm.em,
    pglite,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

describe("tasks schema extension", () => {
  test("exports TaskStatus and task schema validators", async () => {
    expect(taskEntities.DependenciesSchema.parse({
      blocks: [],
      blocked_by: [],
    })).toEqual({ blocks: [], blocked_by: [] });
    expect(() =>
      taskEntities.DependenciesSchema.parse({ blocks: [], blockedBy: [] })
    ).toThrow();
    expect(taskEntities.ExternalTaskIdSchema.parse("jira:FUL-123")).toBe(
      "jira:FUL-123",
    );
    expect(taskEntities.ExternalTaskIdSchema.parse(`linear:${randomUUID()}`))
      .toMatch(/^linear:/);
    expect(taskEntities.ExternalTaskIdSchema.parse("github:42")).toBe(
      "github:42",
    );
    expect(() => taskEntities.ExternalTaskIdSchema.parse("slack:42")).toThrow();
    expect(taskEntities.TaskStatusCategorySchema.parse("started")).toBe(
      "started",
    );
    expect(taskEntities.TASK_STATUS_CATEGORIES).toEqual([
      "backlog",
      "unstarted",
      "started",
      "completed",
      "canceled",
    ]);
    expect(taskEntities.TaskStatus).toBeDefined();

    const db = await createTestOrm();
    try {
      const taskMeta = metadataFor(db.em, Task);
      expectField(taskMeta, "sprint", "sprint_id");
      expectField(taskMeta, "customFields", "custom_fields");
      expect(taskMeta.properties["customFields"]?.nullable).not.toBe(true);
      expectField(taskMeta, "points", "points");
      expectField(taskMeta, "parent", "parent_id");
      expectField(taskMeta, "dependencies", "dependencies");
      expect(taskMeta.properties["dependencies"]?.nullable).not.toBe(true);
      expectField(taskMeta, "externalId", "external_id");

      const statusMeta = metadataFor(db.em, taskEntities.TaskStatus);
      expect(statusMeta.tableName).toBe("task_statuses");
      expectField(statusMeta, "org", "org_id");
      expectField(statusMeta, "projectId", "project_id");
      expectField(statusMeta, "category", "category");
    } finally {
      await db.close();
    }
  });

  test("migration creates task columns, TaskStatus table, and required indexes idempotently", async () => {
    const db = await createTestOrm();
    try {
      const columns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name in ('sprint_id', 'custom_fields', 'points', 'parent_id', 'dependencies', 'external_id') order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "custom_fields",
        "dependencies",
        "external_id",
        "parent_id",
        "points",
        "sprint_id",
      ]);

      const statusTable = await db.pglite.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name = 'task_statuses'`,
      );
      expect(statusTable.rows).toEqual([{ table_name: "task_statuses" }]);

      const indexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename in ('tasks', 'task_statuses')`,
      );
      const indexNames = indexes.rows.map((row) => row.indexname).sort();
      expect(indexNames).toContain("task_statuses_org_project");
      expect(indexNames).toContain("task_statuses_project_name_unique");
      expect(indexNames).toContain("tasks_custom_fields_gin");
      expect(indexNames).toContain("tasks_org_external_id");
      expect(indexNames).toContain("tasks_org_parent");
      expect(indexNames).toContain("tasks_org_sprint_status");

      const constraints = await db.pglite.query<{ conname: string }>(
        `select conname from pg_constraint where conrelid = 'task_statuses'::regclass`,
      );
      expect(constraints.rows.map((row) => row.conname)).toContain(
        "task_statuses_category_check",
      );

      await db.orm.migrator.up();
      const after = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename in ('tasks', 'task_statuses')`,
      );
      expect(after.rows.length).toBe(indexes.rows.length);
    } finally {
      await db.close();
    }
  });

  test("database constraints reject invalid statuses and duplicate external task ids", async () => {
    const db = await createTestOrm();
    try {
      await expect(db.pglite.query(
        `insert into "task_statuses" ("org_id", "project_id", "name", "category") values ('${DEFAULT_ORG_ID}', '${randomUUID()}', 'Bad', 'unknown')`,
      )).rejects.toThrow();

      const em = db.em.fork();
      const org = await em.findOneOrFail(Org, { id: DEFAULT_ORG_ID });
      em.persist(em.create(Task, {
        org,
        externalId: "jira:FUL-1",
      }));
      await em.flush();
      em.persist(em.create(Task, {
        org,
        externalId: "jira:FUL-1",
      }));
      await expect(em.flush()).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("database constraints reject cross-org task parents", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const now = new Date();
      const otherOrg = em.create(Org, {
        name: "Other Task Org",
        slug: `other-task-org-${randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      });
      const parent = em.create(Task, { org: otherOrg });
      em.persist([otherOrg, parent]);
      await em.flush();

      await expect(
        db.pglite.query(
          `insert into "tasks" ("id", "org_id", "parent_id") values ($1, $2, $3)`,
          [randomUUID(), DEFAULT_ORG_ID, parent.id],
        ),
      ).rejects.toThrow("tasks_parent_org_foreign");
    } finally {
      await db.close();
    }
  });

  test("sprint foreign key nulls tasks on sprint delete when the sprints table exists first", async () => {
    const db = await createOrmWithSprintsBeforeTaskMigration();
    try {
      const sprintId = randomUUID();
      const taskId = randomUUID();
      await db.pglite.query(
        `insert into "sprints" ("id", "org_id", "name") values ('${sprintId}', '${DEFAULT_ORG_ID}', 'Sprint 1')`,
      );
      await db.pglite.query(
        `insert into "tasks" ("id", "org_id", "sprint_id") values ('${taskId}', '${DEFAULT_ORG_ID}', '${sprintId}')`,
      );
      await db.pglite.query(`delete from "sprints" where "id" = '${sprintId}'`);

      const em = db.em.fork();
      const saved = await em.findOneOrFail(
        Task,
        { id: taskId },
        { fields: ["id", "sprint"] },
      );
      expect(saved.sprint).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("planner can use tasks_org_sprint_status for sprint status lookups", async () => {
    const db = await createOrmWithSprintsBeforeTaskMigration();
    try {
      const sprintId = randomUUID();
      await db.pglite.query(
        `insert into "sprints" ("id", "org_id", "name") values ('${sprintId}', '${DEFAULT_ORG_ID}', 'Sprint 1')`,
      );
      await db.pglite.query(
        `insert into "tasks" ("org_id", "sprint_id", "status", "priority") select '${DEFAULT_ORG_ID}', '${sprintId}', case when i % 2 = 0 then 'ready' else 'done' end, i from generate_series(1, 500) as i`,
      );
      await db.pglite.query(`analyze "tasks"`);
      await db.pglite.query(`set enable_seqscan = off`);

      const planRows = await db.pglite.query<{ "QUERY PLAN": string }>(
        `explain select * from "tasks" where "org_id" = '${DEFAULT_ORG_ID}' and "sprint_id" = '${sprintId}' and "status" = 'ready'`,
      );
      const plan = planRows.rows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(plan).toContain("tasks_org_sprint_status");
    } finally {
      await db.close();
    }
  });
});
