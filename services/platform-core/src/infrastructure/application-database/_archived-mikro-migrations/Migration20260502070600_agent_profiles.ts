/**
 * Migration: Agent profiles registry + test result persistence columns.
 *
 * Creates the persisted Sandcastle agent profile table required by P4#04.
 * Static SQL is limited to migration bodies per C6; no user input reaches
 * these statements.
 *
 * Closes (issue): .scratch/agent-os-vision/04-sandcastle-wrapper/issues/04-agent-profiles-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502070600_agent_profiles extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table "agent_profiles" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "name" varchar(255) not null, "cli_path" varchar(255) null, "skill_folder" varchar(255) null, "default_flags" text[] null, "auth_env_vars" text[] null, "max_iterations" int not null default 10, "default_timeout" int not null default 600000, "last_tested_at" timestamptz null, "test_passed" boolean null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "agent_profiles" add constraint "agent_profiles_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "agent_profiles" add constraint "agent_profiles_org_name" unique ("org_id", "name")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "agent_profiles" cascade`);
  }
}
