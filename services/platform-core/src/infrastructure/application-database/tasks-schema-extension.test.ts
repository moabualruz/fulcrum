import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { DEFAULT_ORG_ID } from "./seed.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import * as taskEntities from "@work-management/infrastructure/database/entities/tasks/index.ts";

function metadataFor(ds: import("typeorm").DataSource, entity: Function) {
  const meta = ds.getMetadata(entity);
  return {
    tableName: meta.tableName,
    properties: Object.fromEntries(
      meta.columns.map((col) => [
        col.propertyName,
        {
          fieldNames: [col.databaseName],
          nullable: col.isNullable,
          default: col.default,
        },
      ]),
    ),
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
      const taskMeta = metadataFor(db.ds, Task);
      expectField(taskMeta, "sprint", "sprint_id");
      expectField(taskMeta, "customFields", "custom_fields");
      expect(taskMeta.properties["customFields"]?.nullable).not.toBe(true);
      expectField(taskMeta, "points", "points");
      expectField(taskMeta, "parent", "parent_id");
      expectField(taskMeta, "dependencies", "dependencies");
      expect(taskMeta.properties["dependencies"]?.nullable).not.toBe(true);
      expectField(taskMeta, "externalId", "external_id");

      const statusMeta = metadataFor(db.ds, taskEntities.TaskStatus);
      expect(statusMeta.tableName).toBe("task_statuses");
      expectField(statusMeta, "projectId", "project_id");
      expectField(statusMeta, "category", "category");
    } finally {
      await db.close();
    }
  });

  test("migration creates task columns, TaskStatus table, and required indexes idempotently", async () => {
    const db = await createTestOrm();
    try {
      const columns = await db.ds.query(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name in ('sprint_id', 'custom_fields', 'points', 'parent_id', 'dependencies', 'external_id') order by column_name`,
      );
      expect(columns.map((row: { column_name: string }) => row.column_name)).toEqual([
        "custom_fields",
        "dependencies",
        "external_id",
        "parent_id",
        "points",
        "sprint_id",
      ]);

      const statusTable = await db.ds.query(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name = 'task_statuses'`,
      );
      expect(statusTable).toEqual([{ table_name: "task_statuses" }]);

      const indexes = await db.ds.query(
        `select indexname from pg_indexes where schemaname = 'public' and tablename in ('tasks', 'task_statuses')`,
      );
      const indexNames = indexes.map((row: { indexname: string }) => row.indexname).sort();
      expect(indexNames).toContain("task_statuses_org_project");
      expect(indexNames).toContain("task_statuses_project_name_unique");
      expect(indexNames).toContain("tasks_custom_fields_gin");
      expect(indexNames).toContain("tasks_org_external_id");
      expect(indexNames).toContain("tasks_org_parent");
      expect(indexNames).toContain("tasks_org_sprint_status");

      const constraints = await db.ds.query(
        `select conname from pg_constraint where conrelid = 'task_statuses'::regclass`,
      );
      expect(constraints.map((row: { conname: string }) => row.conname)).toContain(
        "task_statuses_category_check",
      );
    } finally {
      await db.close();
    }
  });

  test("database constraints reject invalid statuses", async () => {
    const db = await createTestOrm();
    try {
      await expect(db.ds.query(
        `insert into "task_statuses" ("org_id", "project_id", "name", "category") values ('${DEFAULT_ORG_ID}', '${randomUUID()}', 'Bad', 'unknown')`,
      )).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("database constraints reject cross-org task parents", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const now = new Date();
      const otherOrg = em.create(Org, {
        name: "Other Task Org",
        slug: `other-task-org-${randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      });
      const parent = em.create(Task, { org: otherOrg } as any);
      await em.save([otherOrg, parent]);

      await expect(
        db.ds.query(
          `insert into "tasks" ("id", "org_id", "parent_id") values ($1, $2, $3)`,
          [randomUUID(), DEFAULT_ORG_ID, parent.id],
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
