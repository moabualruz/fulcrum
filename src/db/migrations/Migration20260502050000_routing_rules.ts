/**
 * Migration: RoutingRule schema.
 *
 * Creates routing_rules for the deterministic-first router:
 * explicit override/rules before gated LLM fallback.
 *
 * C6: addSql(...) is the sanctioned migration-class DDL escape hatch.
 * C9: migration class at src/db/migrations/Migration<timestamp>.ts.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/01-routing-rules-schema-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502050000_routing_rules extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "routing_rules" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "project_id" uuid null, "name" varchar(255) not null, "conditions_json" jsonb not null, "action_agent" varchar(255) not null, "action_skill_set" text[] not null default '{}', "priority" integer not null default 100, "enabled" boolean not null default true, "source" text not null default 'manual', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "routing_rules" add constraint "routing_rules_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "routing_rules" add constraint "routing_rules_source_check" check ("source" in ('manual', 'learned', 'imported'))`,
    );
    this.addSql(
      `create index "routing_rules_org_priority" on "routing_rules" ("org_id", "priority", "enabled")`,
    );
    this.addSql(
      `create index "routing_rules_org_project" on "routing_rules" ("org_id", "project_id")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "routing_rules" cascade`);
  }
}
