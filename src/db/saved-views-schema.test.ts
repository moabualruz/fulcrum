import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { EntityName } from "@mikro-orm/core";

import { createTestOrm } from "../test-utils/db.ts";
import { DEFAULT_ORG_ID } from "./seed.ts";
import { SavedView } from "./entities/tasks/SavedView.ts";

function metadataFor(em: EntityManager, entity: EntityName<unknown>) {
  return em.getMetadata().get(entity) as unknown as {
    tableName: string;
    properties: Record<string, {
      fieldNames?: string[];
      nullable?: boolean;
      default?: unknown;
    }>;
  };
}

describe("saved_views schema", () => {
  test("SavedView entity has correct table name and field mappings", async () => {
    const db = await createTestOrm();
    try {
      const meta = metadataFor(db.em, SavedView);
      expect(meta.tableName).toBe("saved_views");
      expect(meta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(meta.properties["projectId"]?.fieldNames).toEqual(["project_id"]);
      expect(meta.properties["scope"]?.fieldNames).toEqual(["scope"]);
      expect(meta.properties["name"]?.fieldNames).toEqual(["name"]);
      expect(meta.properties["viewType"]?.fieldNames).toEqual(["view_type"]);
      expect(meta.properties["createdById"]?.fieldNames).toEqual(["created_by"]);
      expect(meta.properties["queryJson"]?.fieldNames).toEqual(["query_json"]);
      expect(meta.properties["orderBy"]?.fieldNames).toEqual(["order_by"]);
      expect(meta.properties["sharedWithUsers"]?.fieldNames).toEqual(["shared_with_users"]);
      expect(meta.properties["sharedWithTeams"]?.fieldNames).toEqual(["shared_with_teams"]);
      expect(meta.properties["defaultFor"]?.fieldNames).toEqual(["default_for"]);
    } finally {
      await db.close();
    }
  });

  test("migration creates saved_views table with all required columns", async () => {
    const db = await createTestOrm();
    try {
      const columns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'saved_views' order by column_name`,
      );
      const colNames = columns.rows.map((r) => r.column_name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("org_id");
      expect(colNames).toContain("project_id");
      expect(colNames).toContain("scope");
      expect(colNames).toContain("name");
      expect(colNames).toContain("query_json");
      expect(colNames).toContain("order_by");
      expect(colNames).toContain("view_type");
      expect(colNames).toContain("created_by");
      expect(colNames).toContain("shared_with_users");
      expect(colNames).toContain("shared_with_teams");
      expect(colNames).toContain("default_for");
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("updated_at");
    } finally {
      await db.close();
    }
  });

  test("migration is idempotent — running up() twice preserves exactly one saved_views table", async () => {
    const db = await createTestOrm();
    try {
      await db.orm.migrator.up();
      const after = await db.pglite.query<{ count: string }>(
        `select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'saved_views'`,
      );
      expect(Number(after.rows[0]?.count)).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("scope CHECK constraint rejects values outside (private|project|org)", async () => {
    const db = await createTestOrm();
    try {
      const userId = db.seed.userId;
      await expect(
        db.pglite.query(
          `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${DEFAULT_ORG_ID}', 'Test', 'invalid', 'list', '${userId}')`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("view_type CHECK constraint rejects values outside (kanban|table|calendar|timeline|list|search)", async () => {
    const db = await createTestOrm();
    try {
      const userId = db.seed.userId;
      await expect(
        db.pglite.query(
          `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${DEFAULT_ORG_ID}', 'Test', 'private', 'grid', '${userId}')`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("indexes saved_views_org_project and saved_views_created_by are present", async () => {
    const db = await createTestOrm();
    try {
      const indexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename = 'saved_views'`,
      );
      const indexNames = indexes.rows.map((r) => r.indexname);
      expect(indexNames).toContain("saved_views_org_project");
      expect(indexNames).toContain("saved_views_created_by");
    } finally {
      await db.close();
    }
  });

  test("FK org_id → orgs(id) is enforced — non-existent org_id rejected", async () => {
    const db = await createTestOrm();
    try {
      const userId = db.seed.userId;
      await expect(
        db.pglite.query(
          `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${randomUUID()}', 'Test', 'private', 'list', '${userId}')`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("FK created_by → users(id) is enforced — non-existent user rejected", async () => {
    const db = await createTestOrm();
    try {
      await expect(
        db.pglite.query(
          `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${DEFAULT_ORG_ID}', 'Test', 'private', 'list', '${randomUUID()}')`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("project_id is nullable — insert without project_id succeeds", async () => {
    const db = await createTestOrm();
    try {
      const userId = db.seed.userId;
      const result = await db.pglite.query<{ id: string }>(
        `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${DEFAULT_ORG_ID}', 'Org-wide View', 'org', 'list', '${userId}') returning id`,
      );
      expect(result.rows[0]?.id).toBeDefined();
    } finally {
      await db.close();
    }
  });

  test("all valid scope values are accepted", async () => {
    const db = await createTestOrm();
    try {
      const userId = db.seed.userId;
      for (const scope of ["private", "project", "org"] as const) {
        const r = await db.pglite.query<{ id: string }>(
          `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${DEFAULT_ORG_ID}', 'View ${scope}', '${scope}', 'list', '${userId}') returning id`,
        );
        expect(r.rows[0]?.id).toBeDefined();
      }
    } finally {
      await db.close();
    }
  });

  test("all valid view_type values are accepted", async () => {
    const db = await createTestOrm();
    try {
      const userId = db.seed.userId;
      for (const vt of ["kanban", "table", "calendar", "timeline", "list", "search"] as const) {
        const r = await db.pglite.query<{ id: string }>(
          `insert into "saved_views" ("org_id", "name", "scope", "view_type", "created_by") values ('${DEFAULT_ORG_ID}', 'View ${vt}', 'private', '${vt}', '${userId}') returning id`,
        );
        expect(r.rows[0]?.id).toBeDefined();
      }
    } finally {
      await db.close();
    }
  });
});
