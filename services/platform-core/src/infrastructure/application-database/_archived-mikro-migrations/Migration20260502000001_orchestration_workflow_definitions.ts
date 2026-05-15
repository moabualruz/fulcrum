/**
 * P3#02 migration — workflow_definitions table + tasks eligibility columns.
 *
 * UP creates:
 *   - workflow_definitions table (id, org_id, project_id nullable, name,
 *     config_yaml, prompt_md, created_at, updated_at) with:
 *       - FK: workflow_definitions.org_id → orgs.id
 *       - List index: idx_wf_def_org_project (org_id, project_id)
 *       - COALESCE unique index: idx_wf_def_org_project_name_unique
 *           (org_id, COALESCE(project_id, nil_uuid), name)
 *           Handles NULL project_id for org-wide default workflows.
 *   - tasks.blocked_by_ids  text[] NOT NULL DEFAULT '{}'
 *   - tasks.workflow_id     uuid NULL
 *   - tasks.status          varchar(255) NULL
   *   - tasks.priority        integer NULL
   *   - Partial index: tasks_dispatch_eligible
 *       (org_id, status, priority, created_at) WHERE status = 'ready'
 *
 * DOWN reverts:
   *   - Drops tasks_dispatch_eligible
 *   - Drops tasks.workflow_id, tasks.blocked_by_ids, tasks.status, tasks.priority
 *   - Drops workflow_definitions CASCADE
 *
 * COALESCE note: The unique index uses COALESCE to treat NULL project_id as a
 * sentinel UUID so that (org, NULL, name) pairs have unique-constraint semantics.
 * MikroORM does not support expression arguments in @Unique({ properties }),
 * so this index is emitted via addSql() — sanctioned C6 escape hatch for
 * ORM-generated migration class bodies.
 *
 * C6: addSql() is the only sanctioned escape hatch for migration DDL strings.
 *     No .sql files, no tagged-template SQL, no pool.query() calls.
 * C7: Auto-generated migration class skeleton (mikro-orm migration:create).
 * C9: services/platform-core/src/infrastructure/application-database/migrations/Migration<timestamp>.ts.
 *
 * Closes (issue): .scratch/agent-os-vision/03-symphony-orchestration/issues/02-schema-workflow-definitions.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502000001_orchestration_workflow_definitions extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // ── workflow_definitions table ─────────────────────────────────────────
    this.addSql(
      `create table "workflow_definitions" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "project_id" uuid null, "name" varchar(255) not null, "config_yaml" text not null, "prompt_md" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "workflow_definitions" add constraint "workflow_definitions_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );

    // List index: covers (org_id, project_id) tenant-scoped queries.
    this.addSql(
      `create index "idx_wf_def_org_project" on "workflow_definitions" ("org_id", "project_id")`,
    );

    // COALESCE unique index: ensures (org, project, name) uniqueness with NULL project_id
    // treated as the nil UUID sentinel so NULL != NULL comparison is bypassed.
    this.addSql(
      `create unique index "idx_wf_def_org_project_name_unique" on "workflow_definitions" ("org_id", COALESCE("project_id", '00000000-0000-0000-0000-000000000000'), "name")`,
    );

    // ── tasks eligibility columns (additive) ──────────────────────────────
    // blocked_by_ids: IDs of tasks that block this task from Symphony dispatch.
    this.addSql(
      `alter table "tasks" add column "blocked_by_ids" text[] not null default '{}'`,
    );
    // workflow_id: FK-by-value to workflow_definitions.id (nullable).
    this.addSql(
      `alter table "tasks" add column "workflow_id" uuid null`,
    );
    // status + priority: needed by the dispatch-eligibility partial index.
    // Pillar 6 (Task management) will refine constraints/defaults on these columns.
    this.addSql(
      `alter table "tasks" add column "status" varchar(255) null`,
    );
    this.addSql(
      `alter table "tasks" add column "priority" integer null`,
    );

    // Partial index for Symphony dispatch polling: only 'ready' tasks are eligible.
    this.addSql(
      `create index "tasks_dispatch_eligible" on "tasks" ("org_id", "status", "priority", "created_at") where status = 'ready'`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "tasks_dispatch_eligible"`,
    );
    this.addSql(
      `alter table "tasks" drop column if exists "priority"`,
    );
    this.addSql(
      `alter table "tasks" drop column if exists "status"`,
    );
    this.addSql(
      `alter table "tasks" drop column if exists "workflow_id"`,
    );
    this.addSql(
      `alter table "tasks" drop column if exists "blocked_by_ids"`,
    );
    this.addSql(
      `drop table if exists "workflow_definitions" cascade`,
    );
  }
}
