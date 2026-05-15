/**
 * Migration: Pillar 5 skills registry.
 *
 * Creates:
 *   - fulcrum_skills — canonical per-org installed skill registry
 *   - skill_versions — version/hash rows for install, upgrade, rollback
 *
 * C6: addSql(...) strings stay inside Migration class bodies.
 * Q22: fulcrum_skills has composite UNIQUE(org_id, slug).
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502050200_skills_registry extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table "fulcrum_skills" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null,
        "name" varchar(255) not null,
        "slug" varchar(255) not null,
        "source" varchar(255) not null,
        "upstream_repo" varchar(255) null,
        "upstream_ref" varchar(255) null,
        "enabled_agents" jsonb not null default '[]'::jsonb,
        primary key ("id")
      )`,
    );
    this.addSql(
      `alter table "fulcrum_skills" add constraint "fulcrum_skills_source_check" check ("source" in ('upstream', 'local', 'package'))`,
    );
    this.addSql(
      `create unique index "fulcrum_skills_org_slug" on "fulcrum_skills" ("org_id", "slug")`,
    );
    this.addSql(
      `alter table "fulcrum_skills" add constraint "fulcrum_skills_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );

    this.addSql(
      `create table "skill_versions" (
        "id" uuid not null default gen_random_uuid(),
        "skill_id" uuid not null,
        "version" varchar(255) not null,
        "hash_verified" varchar(255) null,
        primary key ("id")
      )`,
    );
    this.addSql(
      `alter table "skill_versions" add constraint "skill_versions_skill_id_foreign" foreign key ("skill_id") references "fulcrum_skills" ("id") on delete cascade`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "skill_versions" cascade`);
    this.addSql(`drop table if exists "fulcrum_skills" cascade`);
  }
}
