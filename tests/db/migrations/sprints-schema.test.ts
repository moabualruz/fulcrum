import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createTestOrm } from "@test-support/application-database.ts";
import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import {
  CreateSprintInput,
  Sprint,
  SPRINT_STATUSES,
  SprintStatus,
} from "@platform-core/infrastructure/application-database/entities/tasks/index.ts";

const PRE_SPRINT_MIGRATION = "Migration20260502090200_memory_context_core";
const SPRINT_MIGRATION = "Migration20260502090300_sprints_schema";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

interface FileBackedOrm {
  orm: MikroORM;
  pglite: PGlite;
  root: string;
  close: () => Promise<void>;
}

async function createFileBackedOrm(): Promise<FileBackedOrm> {
  const root = await mkdtemp(join(tmpdir(), "fulcrum-sprints-schema-"));
  const pglite = new PGlite(join(root, "db"));
  const config = createOrmConfig({ pglite });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
  };
  config.extensions = [Migrator];
  const orm = await MikroORMRuntime.init(config);

  return {
    orm,
    pglite,
    root,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function createOrmWithProjectsBeforeSprintMigration(): Promise<FileBackedOrm> {
  const db = await createFileBackedOrm();
  await db.orm.migrator.up({ to: PRE_SPRINT_MIGRATION });
  await new SeedService(db.orm.em).run();
  await db.pglite.query(
    `create table "projects" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "name" varchar(255) not null, primary key ("id"))`,
  );
  await db.pglite.query(
    `alter table "projects" add constraint "projects_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
  );
  await db.pglite.query(
    `insert into "projects" ("id", "org_id", "name") values ('${PROJECT_ID}', '${DEFAULT_ORG_ID}', 'Sprint Project')`,
  );
  await db.orm.migrator.up({ to: SPRINT_MIGRATION });
  return db;
}

describe("Sprint entity metadata and input schema", () => {
  it("exports Sprint, SprintStatus, and CreateSprintInput with date ordering", async () => {
    expect(Sprint).toBeDefined();
    expect(String(SprintStatus.active)).toBe(SPRINT_STATUSES[1]);
    expect(SPRINT_STATUSES).toEqual(["planned", "active", "completed"]);

    const valid = CreateSprintInput.parse({
      orgId: DEFAULT_ORG_ID,
      projectId: PROJECT_ID,
      name: "Sprint 1",
      startDate: "2026-05-04",
      endDate: "2026-05-18",
    });
    expect(valid.status).toBe("planned");

    expect(() =>
      CreateSprintInput.parse({
        orgId: DEFAULT_ORG_ID,
        projectId: PROJECT_ID,
        name: "Bad Sprint",
        startDate: "2026-05-18",
        endDate: "2026-05-18",
      })
    ).toThrow();

    const db = await createTestOrm();
    try {
      const meta = db.orm.getMetadata().get(Sprint);
      expect(meta.tableName).toBe("sprints");
      expect(meta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(meta.properties["projectId"]?.fieldNames).toEqual(["project_id"]);
      expect(meta.properties["startDate"]?.fieldNames).toEqual(["start_date"]);
      expect(meta.properties["endDate"]?.fieldNames).toEqual(["end_date"]);
      expect(meta.indexes?.map((index) => index.name)).toContain(
        "sprints_org_project_status",
      );
      expect(meta.indexes?.map((index) => index.name)).toContain(
        "sprints_one_active_per_project",
      );
    } finally {
      await db.close();
    }
  });
});

describe("Sprint migration constraints", () => {
  it("creates table, check constraint, indexes, and is idempotent", async () => {
    const db = await createTestOrm();
    try {
      const columns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'sprints' order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "capacity_points",
        "closed_at",
        "closed_summary",
        "created_at",
        "end_date",
        "goal",
        "id",
        "metrics_snapshot",
        "name",
        "org_id",
        "project_id",
        "retro_doc_id",
        "retrospective_notes",
        "start_date",
        "status",
        "updated_at",
      ]);

      const constraints = await db.pglite.query<{ conname: string }>(
        `select conname from pg_constraint where conrelid = 'sprints'::regclass order by conname`,
      );
      const constraintNames = constraints.rows.map((row) => row.conname);
      expect(constraintNames).toContain("sprints_org_id_foreign");
      expect(constraintNames).toContain("sprints_status_check");

      const indexes = await db.pglite.query<{ indexname: string; indexdef: string }>(
        `select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'sprints'`,
      );
      const indexNames = indexes.rows.map((row) => row.indexname);
      expect(indexNames).toContain("sprints_org_project_status");
      expect(indexNames).toContain("sprints_one_active_per_project");
      expect(indexes.rows.find((row) => row.indexname === "sprints_one_active_per_project")?.indexdef)
        .toContain("WHERE ((status)::text = 'active'::text)");

      const second = await db.orm.migrator.up();
      expect(second).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("rejects invalid status at the database boundary", async () => {
    const db = await createTestOrm();
    try {
      const em = db.orm.em.fork();
      await expect(
        em.getRepository(Sprint).insert({
          org: em.getReference(Org, DEFAULT_ORG_ID),
          projectId: PROJECT_ID,
          name: "Invalid",
          startDate: new Date("2026-05-04"),
          endDate: new Date("2026-05-18"),
          status: "cancelled",
        } as never),
      ).rejects.toThrow("sprints_status_check");
    } finally {
      await db.close();
    }
  });

  it("allows one active sprint per project and multiple planned sprints", async () => {
    const db = await createTestOrm();
    try {
      const insertSprint = async (status: SprintStatus, name: string) => {
        const em = db.orm.em.fork();
        return em.getRepository(Sprint).insert({
          org: em.getReference(Org, DEFAULT_ORG_ID),
          projectId: PROJECT_ID,
          name,
          startDate: new Date("2026-05-04"),
          endDate: new Date("2026-05-18"),
          status,
        });
      };

      await insertSprint(SprintStatus.active, "Active");
      await insertSprint(SprintStatus.planned, "Planned");
      await expect(insertSprint(SprintStatus.active, "Second Active")).rejects
        .toThrow();
    } finally {
      await db.close();
    }
  });

  it("cascades sprint rows when a project table exists and project is deleted", async () => {
    const db = await createOrmWithProjectsBeforeSprintMigration();
    try {
      await db.pglite.query(
        `insert into "sprints" ("org_id", "project_id", "name", "start_date", "end_date") values ('${DEFAULT_ORG_ID}', '${PROJECT_ID}', 'Cascade Sprint', '2026-05-04', '2026-05-18')`,
      );
      await db.pglite.query(`delete from "projects" where "id" = '${PROJECT_ID}'`);

      const rows = await db.pglite.query<{ count: string }>(
        `select count(*)::text from "sprints" where "project_id" = '${PROJECT_ID}'`,
      );
      expect(rows.rows[0]?.count).toBe("0");
    } finally {
      await db.close();
    }
  });
});
