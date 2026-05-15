import { describe, expect, it } from "bun:test";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import {
  CustomFieldConfigSchema,
  CustomFieldDef,
  CUSTOM_FIELD_TYPES,
  seedDefaultFields,
} from "@platform-core/infrastructure/application-database/entities/tasks/index.ts";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

interface CustomFieldDefTestOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function createCustomFieldDefTestOrm(): Promise<CustomFieldDefTestOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite, entities: [CustomFieldDef] });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    snapshot: false,
  };
  config.extensions = [Migrator];

  const orm = await MikroORMRuntime.init(config);
  await orm.migrator.up();
  await new SeedService(orm.em).run();

  return {
    orm,
    pglite,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

describe("CustomFieldDef entity metadata and config schema", () => {
  it("exports CustomFieldDef and validates per-type config JSON", async () => {
    expect(CustomFieldDef).toBeDefined();
    expect(CUSTOM_FIELD_TYPES).toEqual([
      "text",
      "select",
      "multi_select",
      "number",
      "date",
      "user",
      "url",
      "json",
    ]);

    expect(
      CustomFieldConfigSchema.parse({ type: "select", options: [
        { value: "high", label: "High", color: "#EF4444" },
      ] }),
    ).toEqual({ type: "select", options: [
      { value: "high", label: "High", color: "#EF4444" },
    ] });
    expect(
      CustomFieldConfigSchema.parse({
        type: "number",
        unit: "pts",
        decimals: 1,
        min: 0,
        max: 100,
      }),
    ).toEqual({
      type: "number",
      unit: "pts",
      decimals: 1,
      min: 0,
      max: 100,
    });
    expect(() =>
      CustomFieldConfigSchema.parse({ type: "select", options: [] })
    ).toThrow();
    expect(() =>
      CustomFieldConfigSchema.parse({ type: "number", decimals: -1 })
    ).toThrow();

    const db = await createCustomFieldDefTestOrm();
    try {
      const meta = db.orm.getMetadata().get(CustomFieldDef);
      expect(meta.tableName).toBe("custom_field_defs");
      expect(meta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(meta.properties["projectId"]?.fieldNames).toEqual(["project_id"]);
      expect(meta.properties["configJson"]?.fieldNames).toEqual(["config_json"]);
      expect(meta.indexes?.map((index) => index.name)).toContain(
        "custom_field_defs_org_project",
      );
      expect(meta.uniques?.map((unique) => unique.name)).toContain(
        "custom_field_defs_project_slug_unique",
      );
    } finally {
      await db.close();
    }
  });
});

describe("CustomFieldDef migration constraints", () => {
  it("creates table, check constraint, unique slug index, composite index, and is idempotent", async () => {
    const db = await createCustomFieldDefTestOrm();
    try {
      const columns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'custom_field_defs' order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "archived",
        "config_json",
        "id",
        "name",
        "org_id",
        "position",
        "project_id",
        "required",
        "slug",
        "type",
      ]);

      const constraints = await db.pglite.query<{ conname: string }>(
        `select conname from pg_constraint where conrelid = 'custom_field_defs'::regclass order by conname`,
      );
      const constraintNames = constraints.rows.map((row) => row.conname);
      expect(constraintNames).toContain("custom_field_defs_org_id_foreign");
      expect(constraintNames).toContain("custom_field_defs_type_check");
      expect(constraintNames).toContain("custom_field_defs_project_slug_unique");

      const indexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename = 'custom_field_defs'`,
      );
      const indexNames = indexes.rows.map((row) => row.indexname);
      expect(indexNames).toContain("custom_field_defs_org_project");

      const second = await db.orm.migrator.up();
      expect(second).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("rejects invalid field type at the database boundary", async () => {
    const db = await createCustomFieldDefTestOrm();
    try {
      const em = db.orm.em.fork();
      await expect(
        em.getRepository(CustomFieldDef).insert({
          org: em.getReference(Org, DEFAULT_ORG_ID),
          projectId: PROJECT_ID,
          name: "Bad",
          slug: "bad",
          type: "currency",
        } as never),
      ).rejects.toThrow("custom_field_defs_type_check");
    } finally {
      await db.close();
    }
  });

  it("rejects duplicate slugs within a project", async () => {
    const db = await createCustomFieldDefTestOrm();
    try {
      const em = db.orm.em.fork();
      const repo = em.getRepository(CustomFieldDef);
      const base = {
        org: em.getReference(Org, DEFAULT_ORG_ID),
        projectId: PROJECT_ID,
        name: "Priority",
        slug: "priority",
        type: "select",
      } as never;

      await repo.insert(base);
      await expect(repo.insert(base)).rejects.toThrow(
        "custom_field_defs_project_slug_unique",
      );
    } finally {
      await db.close();
    }
  });

  it("seeds the nine default fields idempotently", async () => {
    const db = await createCustomFieldDefTestOrm();
    try {
      await seedDefaultFields(db.orm.em.fork(), PROJECT_ID, DEFAULT_ORG_ID);
      await seedDefaultFields(db.orm.em.fork(), PROJECT_ID, DEFAULT_ORG_ID);

      const rows = await db.pglite.query<{ slug: string }>(
        `select slug from "custom_field_defs" where "project_id" = '${PROJECT_ID}' order by "position"`,
      );
      expect(rows.rows.map((row) => row.slug)).toEqual([
        "status",
        "priority",
        "assignee",
        "due_date",
        "estimate",
        "parent",
        "tags",
        "repo",
        "sprint",
      ]);
    } finally {
      await db.close();
    }
  });
});
