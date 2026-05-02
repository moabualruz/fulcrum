/**
 * Migration: Artifact payload columns + Edge relationship graph.
 *
 * Adds Sandcastle artifact metadata and Q32 graph edges while preserving the
 * Pillar 1 artifacts stub table. Static SQL is limited to migration bodies per
 * C6; no user input reaches these statements.
 *
 * Closes (issue): .scratch/agent-os-vision/04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502070500_artifacts_edges extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "artifacts" drop constraint if exists "artifacts_org_id_foreign"`,
    );
    this.addSql(
      `alter table "artifacts" add constraint "artifacts_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(`alter table "artifacts" add column "run_id" uuid null`);
    this.addSql(`alter table "artifacts" add column "task_id" uuid null`);
    this.addSql(
      `alter table "artifacts" add column "filename" varchar(255) null`,
    );
    this.addSql(`alter table "artifacts" add column "mime" varchar(255) null`);
    this.addSql(`alter table "artifacts" add column "size_bytes" bigint null`);
    this.addSql(`alter table "artifacts" add column "metadata_json" jsonb null`);
    this.addSql(
      `alter table "artifacts" add column "created_at" timestamptz not null default now()`,
    );
    this.addSql(
      `insert into "agent_runs" ("org_id", "status", "agent_name") select distinct "org_id", 'succeeded', 'artifact-migration' from "artifacts" where "run_id" is null`,
    );
    this.addSql(
      `update "artifacts" set "run_id" = (select "id" from "agent_runs" where "agent_runs"."org_id" = "artifacts"."org_id" and "agent_runs"."agent_name" = 'artifact-migration' order by "created_at" desc limit 1) where "run_id" is null`,
    );
    this.addSql(
      `update "artifacts" set "filename" = coalesce(nullif("filename", ''), nullif("path", ''), "id"::text) where "filename" is null or "filename" = ''`,
    );
    this.addSql(`alter table "artifacts" alter column "run_id" set not null`);
    this.addSql(`alter table "artifacts" alter column "filename" set not null`);
    this.addSql(
      `alter table "artifacts" add constraint "artifacts_run_id_foreign" foreign key ("run_id") references "agent_runs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "artifacts" add constraint "artifacts_task_id_foreign" foreign key ("task_id") references "tasks" ("id") on delete set null`,
    );
    this.addSql(`create index "artifacts_run_fk" on "artifacts" ("run_id")`);
    this.addSql(`create index "artifacts_task_fk" on "artifacts" ("task_id")`);
    this.addSql(
      `create index "artifacts_org_run" on "artifacts" ("org_id", "run_id")`,
    );
    this.addSql(
      `create index "artifacts_org_task" on "artifacts" ("org_id", "task_id")`,
    );

    this.addSql(
      `create table "edges" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "from_kind" varchar(255) not null, "from_id" uuid not null, "to_kind" varchar(255) not null, "to_id" uuid not null, "kind" varchar(255) not null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "edges" add constraint "edges_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "edges" add constraint "edges_from_to_kind" unique ("org_id", "from_kind", "from_id", "to_kind", "to_id", "kind")`,
    );
    this.addSql(
      `create index "edges_to_lookup" on "edges" ("org_id", "to_kind", "to_id", "kind")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "edges" cascade`);
    this.addSql(`drop index if exists "artifacts_task_fk"`);
    this.addSql(`drop index if exists "artifacts_run_fk"`);
    this.addSql(`drop index if exists "artifacts_org_task"`);
    this.addSql(`drop index if exists "artifacts_org_run"`);
    this.addSql(
      `alter table "artifacts" drop constraint if exists "artifacts_task_id_foreign"`,
    );
    this.addSql(
      `alter table "artifacts" drop constraint if exists "artifacts_run_id_foreign"`,
    );
    this.addSql(
      `delete from "agent_runs" where "agent_name" = 'artifact-migration' and "id" in (select "run_id" from "artifacts" where "run_id" is not null)`,
    );
    this.addSql(`alter table "artifacts" drop column if exists "created_at"`);
    this.addSql(`alter table "artifacts" drop column if exists "metadata_json"`);
    this.addSql(`alter table "artifacts" drop column if exists "size_bytes"`);
    this.addSql(`alter table "artifacts" drop column if exists "mime"`);
    this.addSql(`alter table "artifacts" drop column if exists "filename"`);
    this.addSql(`alter table "artifacts" drop column if exists "task_id"`);
    this.addSql(`alter table "artifacts" drop column if exists "run_id"`);
    this.addSql(
      `alter table "artifacts" drop constraint if exists "artifacts_org_id_foreign"`,
    );
    this.addSql(
      `alter table "artifacts" add constraint "artifacts_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );
  }
}
