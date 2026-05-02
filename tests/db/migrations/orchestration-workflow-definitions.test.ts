/**
 * TDD — WorkflowDefinition schema migration round-trip.
 *
 * Verifies P3#02: workflow_definitions table + tasks eligibility columns.
 *
 * Test strategy follows the events-backfill pattern:
 *   - Single ORM instance with real migrator (transactional:false for PGlite savepoint workaround).
 *   - PHASE 1: run all prerequisite migrations up to composite_indexes.
 *   - PHASE 2: run the P3#02 workflow-definitions migration.
 *   - PHASE 3: assert schema state — table, columns, indexes.
 *   - PHASE 4: assert migration DOWN reverts cleanly.
 *
 * Per C6: No hand-written DDL in this file. Schema state verified via ORM
 *          metadata + pg_indexes system catalog queries (read-only planner calls).
 * Per C7: MikroORM v7 @Entity ES Stage-3 decorator pattern.
 * Per C2: org_id composite indexes verified present after UP.
 *
 * Closes (issue): .scratch/agent-os-vision/03-symphony-orchestration/issues/02-schema-workflow-definitions.md
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";

// Auth entities (needed for prerequisite migrations)
import { Org } from "../../../src/db/entities/auth/Org.ts";
import { User } from "../../../src/db/entities/auth/User.ts";
import { Session } from "../../../src/db/entities/auth/Session.ts";
import { Invitation } from "../../../src/db/entities/auth/Invitation.ts";
import { OrgMember } from "../../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlag } from "../../../src/db/entities/auth/FeatureFlag.ts";
import { Account } from "../../../src/db/entities/auth/Account.ts";
import { Verification } from "../../../src/db/entities/auth/Verification.ts";
import { Event } from "../../../src/db/entities/core/Event.ts";

// Stub tenant-scoped entities (needed for prerequisite migrations)
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { Document } from "../../../src/db/entities/docs/Document.ts";
import { Memory } from "../../../src/db/entities/memory/Memory.ts";
import { AgentRun } from "../../../src/db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../../src/db/entities/artifacts/Artifact.ts";
import { Repo } from "../../../src/db/entities/repos/Repo.ts";
import { Job } from "../../../src/db/entities/jobs/Job.ts";
import { SearchDocument } from "../../../src/db/entities/search/SearchDocument.ts";
import { CasbinRule } from "../../../src/db/entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "../../../src/db/entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "../../../src/db/entities/flags/NotificationRule.ts";
import { SchemaMigration } from "../../../src/db/entities/SchemaMigration.ts";

// P3#02 entities under test
import { WorkflowDefinition } from "../../../src/db/entities/orchestration/WorkflowDefinition.ts";
import { WorkflowDefinitionRepository } from "../../../src/db/repositories/orchestration/WorkflowDefinitionRepository.ts";

const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";
const MIGRATION_PATH = new URL(
  "../../../src/db/migrations",
  import.meta.url,
).pathname;
const P3_02_MIGRATION = "Migration20260502000001_orchestration_workflow_definitions";

function makeOrmConfig(pglite: PGlite) {
  const dialect = new PGliteKyselyDialect(() => pglite);
  return {
    dbName: "postgres",
    driverOptions: dialect,
    multipleStatements: false,
    entities: [
      SchemaMigration,
      Org,
      User,
      Session,
      Account,
      Verification,
      Invitation,
      OrgMember,
      FeatureFlag,
      Event,
      Task,
      Document,
      Memory,
      AgentRun,
      Artifact,
      Repo,
      Job,
      SearchDocument,
      CasbinRule,
      WebhookSubscription,
      NotificationRule,
      WorkflowDefinition,
    ],
    migrations: {
      path: MIGRATION_PATH,
      pathTs: MIGRATION_PATH,
      // transactional:false / allOrNothing:false — test-only PGlite savepoint workaround.
      // PGliteKyselyDialect does not support savepoints; migrations must run outside
      // a wrapping transaction. This setting MUST NOT appear in src/db/mikro-orm.config.ts.
      transactional: false,
      allOrNothing: false,
    },
    extensions: [Migrator],
    debug: false,
  };
}

let orm: MikroORM;
let pglite: PGlite;

beforeAll(async () => {
  pglite = new PGlite();
  orm = await MikroORM.init(makeOrmConfig(pglite));

  // PHASE 1: run all prerequisite migrations (auth, events, composite_indexes, flag_stubs,
  //          schema_ledger, account_verification) — leaves tasks/agent_runs stub tables in place.
  await orm.migrator.up({
    to: "Migration20260501150000_account_verification",
  });

  // Seed well-known org row needed for FK constraints in subsequent data operations.
  const conn = orm.em.getConnection();
  // C6 carve-out: raw INSERT for well-known org — required before FK-constrained tables
  // can be queried. No entity-class path exists at this pre-seeding stage.
  await conn.execute(
    `insert into "orgs" ("id", "name", "slug", "created_at", "updated_at") values ('${WELL_KNOWN_ORG_ID}', 'Local', 'local', now(), now()) on conflict do nothing`,
  );

  // PHASE 2: run the P3#02 workflow-definitions migration.
  await orm.migrator.up({ to: P3_02_MIGRATION });
});

afterAll(async () => {
  if (orm) await orm.close(true);
  await (pglite as { close?: () => Promise<void> }).close?.();
});

// ──────────────────────────────────────────────
// 1. WorkflowDefinition entity metadata
// ──────────────────────────────────────────────

describe("WorkflowDefinition entity metadata", () => {
  it("is registered with tableName=workflow_definitions", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    expect(meta).toBeDefined();
    expect(meta.tableName).toBe("workflow_definitions");
  });

  it("has UUID primary key", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    const idProp = meta.properties["id"];
    expect(idProp).toBeDefined();
    expect(idProp!.primary).toBe(true);
    expect(idProp!.type).toMatch(/uuid/i);
  });

  it("has ManyToOne org FK (non-nullable)", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    const orgProp = meta.properties["org"];
    expect(orgProp).toBeDefined();
    expect(orgProp!.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(orgProp!.nullable).not.toBe(true);
  });

  it("has nullable projectId (org-wide when null)", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    const proj = meta.properties["projectId"];
    expect(proj).toBeDefined();
    expect(proj!.nullable).toBe(true);
  });

  it("has name, configYaml, promptMd properties", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    expect(meta.properties["name"]).toBeDefined();
    expect(meta.properties["configYaml"]).toBeDefined();
    expect(meta.properties["promptMd"]).toBeDefined();
  });

  it("has createdAt and updatedAt properties", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    expect(meta.properties["createdAt"]).toBeDefined();
    expect(meta.properties["updatedAt"]).toBeDefined();
  });

  it("has list index idx_wf_def_org_project on (org, projectId)", () => {
    const meta = orm.getMetadata().get(WorkflowDefinition);
    const idx = meta.indexes?.find((i) => i.name === "idx_wf_def_org_project");
    expect(idx).toBeDefined();
    const props = Array.isArray(idx!.properties)
      ? idx!.properties
      : [idx!.properties];
    expect(props).toContain("org");
  });
});

// ──────────────────────────────────────────────
// 2. WorkflowDefinitionRepository class
// ──────────────────────────────────────────────

describe("WorkflowDefinitionRepository", () => {
  it("class is defined and is a function", () => {
    expect(WorkflowDefinitionRepository).toBeDefined();
    expect(typeof WorkflowDefinitionRepository).toBe("function");
  });

  it("em.getRepository(WorkflowDefinition) returns WorkflowDefinitionRepository", () => {
    const repo = orm.em.getRepository(WorkflowDefinition);
    expect(repo).toBeInstanceOf(WorkflowDefinitionRepository);
  });

  it("count() === 0 on fresh schema", async () => {
    const em = orm.em.fork();
    const repo = em.getRepository(WorkflowDefinition) as WorkflowDefinitionRepository;
    const count = await repo.count();
    expect(count).toBe(0);
  });
});

// ──────────────────────────────────────────────
// 3. Migration UP — pg_indexes catalog
// ──────────────────────────────────────────────

describe("Migration UP — pg_indexes for workflow_definitions", () => {
  it("idx_wf_def_org_project list index is present in pg_indexes", async () => {
    // C6 carve-out: pg_indexes system catalog query — read-only planner introspection,
    // not application SQL. No DDL/DML. Sanctioned for index existence verification.
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select indexname from pg_indexes where tablename = 'workflow_definitions' and indexname = 'idx_wf_def_org_project'`,
    ) as Array<{ indexname: string }>;
    const names = result.map((r) => r.indexname);
    expect(names).toContain("idx_wf_def_org_project");
  });

  it("idx_wf_def_org_project_name_unique COALESCE index is present in pg_indexes", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select indexname from pg_indexes where tablename = 'workflow_definitions' and indexname = 'idx_wf_def_org_project_name_unique'`,
    ) as Array<{ indexname: string }>;
    const names = result.map((r) => r.indexname);
    expect(names).toContain("idx_wf_def_org_project_name_unique");
  });

  it("workflow_definitions table has all required columns via information_schema", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select column_name from information_schema.columns where table_name = 'workflow_definitions' order by ordinal_position`,
    ) as Array<{ column_name: string }>;
    const cols = result.map((r) => r.column_name);
    for (const col of ["id", "org_id", "project_id", "name", "config_yaml", "prompt_md", "created_at", "updated_at"]) {
      expect(cols).toContain(col);
    }
  });
});

// ──────────────────────────────────────────────
// 4. Migration UP — tasks eligibility columns
// ──────────────────────────────────────────────

describe("Migration UP — tasks eligibility columns", () => {
  it("tasks.blocked_by_ids column exists after migration", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'blocked_by_ids'`,
    ) as Array<{ column_name: string }>;
    expect(result.length).toBe(1);
  });

  it("tasks.workflow_id column exists after migration", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'workflow_id'`,
    ) as Array<{ column_name: string }>;
    expect(result.length).toBe(1);
  });

  it("tasks.priority is numeric for dispatch ordering", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select data_type from information_schema.columns where table_name = 'tasks' and column_name = 'priority'`,
    ) as Array<{ data_type: string }>;
    expect(result).toHaveLength(1);
    expect(result[0]!.data_type).toBe("integer");
  });

  it("tasks_dispatch_eligible partial index is present in pg_indexes", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select indexname from pg_indexes where tablename = 'tasks' and indexname = 'tasks_dispatch_eligible'`,
    ) as Array<{ indexname: string }>;
    const names = result.map((r) => r.indexname);
    expect(names).toContain("tasks_dispatch_eligible");
  });
});

// ──────────────────────────────────────────────
// 5. CRUD round-trip — WorkflowDefinition
// ──────────────────────────────────────────────

describe("CRUD round-trip — WorkflowDefinition", () => {
  it("creates and retrieves a WorkflowDefinition (org-wide, no project)", async () => {
    const em = orm.em.fork();
    const orgRef = em.getReference(Org, WELL_KNOWN_ORG_ID);
    em.create(WorkflowDefinition, {
      org: orgRef,
      projectId: null,
      name: "default-workflow",
      configYaml: "version: 1\nsteps: []",
      promptMd: "# Default\nRun this workflow for all tasks.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await em.flush();

    const em2 = orm.em.fork();
    const found = await em2
      .getRepository(WorkflowDefinition)
      .findOne({ name: "default-workflow" });
    expect(found).toBeDefined();
    expect(found!.name).toBe("default-workflow");
    expect(found!.projectId).toBeNull();
  });

  it("unique index prevents duplicate (org, project=null, name)", async () => {
    const em = orm.em.fork();
    const orgRef = em.getReference(Org, WELL_KNOWN_ORG_ID);
    // First insert (already done above); second insert should violate unique index.
    em.create(WorkflowDefinition, {
      org: orgRef,
      projectId: null,
      name: "default-workflow",
      configYaml: "version: 1",
      promptMd: "duplicate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(em.flush()).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// 6. Migration recorded in mikro_orm_migrations
// ──────────────────────────────────────────────

describe("Migration recording", () => {
  it("P3#02 migration is recorded in mikro_orm_migrations", async () => {
    const storage = (orm.migrator as Migrator).getStorage();
    const executed = await storage.executed();
    expect(executed).toContain(P3_02_MIGRATION);
  });
});

// ──────────────────────────────────────────────
// 7. Migration DOWN — reverts cleanly
// ──────────────────────────────────────────────

describe("Migration DOWN — reverts cleanly", () => {
  it("down() removes workflow_definitions table", async () => {
    await orm.migrator.down({ to: "Migration20260501150000_account_verification" });

    const conn = orm.em.getConnection();
    // C6 carve-out: information_schema read — existence check, no DDL/DML.
    const result = await conn.execute(
      `select table_name from information_schema.tables where table_name = 'workflow_definitions'`,
    ) as Array<{ table_name: string }>;
    expect(result.length).toBe(0);
  });

  it("down() removes tasks.blocked_by_ids column", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'blocked_by_ids'`,
    ) as Array<{ column_name: string }>;
    expect(result.length).toBe(0);
  });

  it("down() removes tasks.workflow_id column", async () => {
    const conn = orm.em.getConnection();
    const result = await conn.execute(
      `select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'workflow_id'`,
    ) as Array<{ column_name: string }>;
    expect(result.length).toBe(0);
  });
});
