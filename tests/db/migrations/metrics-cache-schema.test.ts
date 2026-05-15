import { describe, expect, it } from "bun:test";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import {
  MetricsCache,
  Sprint,
} from "@platform-core/infrastructure/application-database/entities/tasks/index.ts";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

interface MetricsCacheTestOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function createMetricsCacheTestOrm(): Promise<MetricsCacheTestOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });
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

async function insertSprint(db: MetricsCacheTestOrm): Promise<string> {
  const result = await db.pglite.query<{ id: string }>(
    `insert into "sprints" ("org_id", "project_id", "name", "start_date", "end_date") values ('${DEFAULT_ORG_ID}', '${PROJECT_ID}', 'Metrics Sprint', '2026-05-04', '2026-05-18') returning "id"`,
  );
  return result.rows[0]!.id;
}

describe("MetricsCache entity metadata", () => {
  it("exports MetricsCache with project, sprint, date, and rollup counters", async () => {
    expect(MetricsCache).toBeDefined();

    const db = await createMetricsCacheTestOrm();
    try {
      const meta = db.orm.getMetadata().get(MetricsCache);
      expect(meta.tableName).toBe("metrics_cache");
      expect(meta.properties["projectId"]?.fieldNames).toEqual(["project_id"]);
      expect(meta.properties["sprint"]?.fieldNames).toEqual(["sprint_id"]);
      expect(meta.properties["startedCount"]?.fieldNames).toEqual(["started_count"]);
      expect(meta.properties["completedCount"]?.fieldNames).toEqual(["completed_count"]);
      expect(meta.properties["blockedCount"]?.fieldNames).toEqual(["blocked_count"]);
      expect(meta.properties["pointsCompleted"]?.fieldNames).toEqual(["points_completed"]);
      expect(meta.properties["pointsRemaining"]?.fieldNames).toEqual(["points_remaining"]);
      expect(meta.properties["wipCount"]?.fieldNames).toEqual(["wip_count"]);
      expect(meta.indexes?.map((index) => index.name)).toContain(
        "metrics_cache_project_sprint_date",
      );
      expect(meta.uniques?.map((unique) => unique.name)).toContain(
        "metrics_cache_project_sprint_date_unique",
      );
    } finally {
      await db.close();
    }
  });
});

describe("MetricsCache migration constraints", () => {
  it("creates table, unique constraint, composite index, FK, and is idempotent", async () => {
    const db = await createMetricsCacheTestOrm();
    try {
      const columns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'metrics_cache' order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "blocked_count",
        "completed_count",
        "date",
        "id",
        "points_completed",
        "points_remaining",
        "points_total",
        "project_id",
        "scope_type",
        "sprint_id",
        "started_count",
        "status_counts",
        "tasks_total",
        "updated_at",
        "wip_count",
      ]);

      const constraints = await db.pglite.query<{ conname: string }>(
        `select conname from pg_constraint where conrelid = 'metrics_cache'::regclass order by conname`,
      );
      const constraintNames = constraints.rows.map((row) => row.conname);
      expect(constraintNames).toContain("metrics_cache_sprint_id_foreign");
      expect(constraintNames).toContain("metrics_cache_project_sprint_date_unique");

      const indexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename = 'metrics_cache'`,
      );
      const indexNames = indexes.rows.map((row) => row.indexname);
      expect(indexNames).toContain("metrics_cache_project_sprint_date");

      const second = await db.orm.migrator.up();
      expect(second).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("rejects duplicate rows for a project, sprint, and date", async () => {
    const db = await createMetricsCacheTestOrm();
    try {
      const sprintId = await insertSprint(db);
      const insertRow = () =>
        db.pglite.query(
          `insert into "metrics_cache" ("project_id", "sprint_id", "date", "points_remaining") values ('${PROJECT_ID}', '${sprintId}', '2026-05-04', 8)`,
        );

      await insertRow();
      await expect(insertRow()).rejects.toThrow(
        "metrics_cache_project_sprint_date_unique",
      );
    } finally {
      await db.close();
    }
  });

  it("cascades metrics rows when a sprint is deleted", async () => {
    const db = await createMetricsCacheTestOrm();
    try {
      const sprintId = await insertSprint(db);
      await db.pglite.query(
        `insert into "metrics_cache" ("project_id", "sprint_id", "date", "points_remaining") values ('${PROJECT_ID}', '${sprintId}', '2026-05-04', 8)`,
      );
      await db.pglite.query(`delete from "sprints" where "id" = '${sprintId}'`);

      const rows = await db.pglite.query<{ count: string }>(
        `select count(*)::text from "metrics_cache" where "sprint_id" = '${sprintId}'`,
      );
      expect(rows.rows[0]?.count).toBe("0");
    } finally {
      await db.close();
    }
  });
});
