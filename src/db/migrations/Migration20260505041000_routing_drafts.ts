/**
 * Migration: RoutingDraft and RoutingAudit schema.
 *
 * Creates routing_drafts (disabled learned drafts) and
 * routing_audit_events (audit trail for routing operations).
 *
 * C6: addSql(...) is the sanctioned migration-class DDL escape hatch.
 * D-09: drafts always disabled (enabled=false).
 * D-10: full decision evidence stored in JSON columns.
 * D-12: matching_active_rule_ids_json for overlap tracking.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260505041000_routing_drafts extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table "routing_drafts" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "project_id" uuid null, "status" text not null default 'review_needed', "enabled" boolean not null default false, "task_facts_json" jsonb not null, "no_match_reason" text not null, "proposed_conditions_json" jsonb not null, "proposed_actions_json" jsonb not null, "source" text not null default 'no_match', "confidence" real not null default 0, "backend" varchar(255) null, "model" varchar(255) null, "matching_active_rule_ids_json" jsonb not null default '[]', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "routing_drafts" add constraint "routing_drafts_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `alter table "routing_drafts" add constraint "idx_routing_drafts_status_check" check ("status" in ('review_needed', 'conflict', 'abstained'))`,
    );
    this.addSql(
      `alter table "routing_drafts" add constraint "idx_routing_drafts_source_check" check ("source" in ('no_match', 'llm'))`,
    );
    this.addSql(
      `create index "idx_routing_drafts_org_status" on "routing_drafts" ("org_id", "status")`,
    );
    this.addSql(
      `create index "idx_routing_drafts_org_created" on "routing_drafts" ("org_id", "created_at")`,
    );

    this.addSql(
      `create table "routing_audit_events" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "event_type" varchar(255) not null, "subject_type" varchar(255) not null, "subject_id" varchar(255) not null, "payload_json" jsonb not null, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "routing_audit_events" add constraint "routing_audit_events_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`,
    );
    this.addSql(
      `create index "idx_routing_audit_org_created" on "routing_audit_events" ("org_id", "created_at")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "routing_drafts" cascade`);
    this.addSql(`drop table if exists "routing_audit_events" cascade`);
  }
}
