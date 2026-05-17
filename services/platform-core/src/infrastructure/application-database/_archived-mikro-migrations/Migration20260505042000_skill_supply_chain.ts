/**
 * Migration: Skill supply-chain safety tables.
 *
 * Creates:
 *   - mcp_virtual_skills — MCP virtual skill descriptors (source=mcp)
 *   - skill_conflicts — structured sync/lock conflict records
 *
 * D-17: MCP servers appear as first-class virtual skills.
 * D-19: Pinned by descriptor hash and tool manifest hash.
 * D-21: Lock SHA mismatch fails closed.
 * D-22: Upstream sync conflicts produce structured artifacts.
 * D-23: Conflicts stored as structured records, not inline markers.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260505042000_skill_supply_chain extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table "mcp_virtual_skills" (
        "id" uuid not null default gen_random_uuid(),
        "slug" varchar(255) not null,
        "server_name" varchar(255) not null,
        "command_or_url" varchar(1024) not null,
        "package_name" varchar(255) null,
        "version" varchar(255) null,
        "env_hints_json" jsonb null,
        "tool_names_json" jsonb not null default '[]'::jsonb,
        "descriptor_sha256" varchar(255) not null,
        "tool_manifest_hash" varchar(255) null,
        "source" varchar(255) not null default 'mcp',
        "invokable_by_fulcrum" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "description" varchar(1024) null,
        "vendor" varchar(255) null,
        primary key ("id")
      )`,
    );
    this.addSql(
      `create unique index "mcp_virtual_skills_slug" on "mcp_virtual_skills" ("slug")`,
    );
    this.addSql(
      `alter table "mcp_virtual_skills" add constraint "mcp_virtual_skills_source_check" check ("source" = 'mcp')`,
    );

    this.addSql(
      `create table "skill_conflicts" (
        "id" uuid not null default gen_random_uuid(),
        "slug" varchar(255) not null,
        "kind" varchar(50) not null,
        "status" varchar(50) not null default 'open',
        "local_hash" varchar(255) null,
        "upstream_hash" varchar(255) null,
        "base_hash" varchar(255) null,
        "expected_sha256" varchar(255) null,
        "actual_sha256" varchar(255) null,
        "suggested_resolution" text null,
        "audit_note" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )`,
    );
    this.addSql(
      `alter table "skill_conflicts" add constraint "skill_conflicts_kind_check" check ("kind" in ('upstream_conflict', 'sha_mismatch'))`,
    );
    this.addSql(
      `alter table "skill_conflicts" add constraint "skill_conflicts_status_check" check ("status" in ('open', 'overridden', 'resolved'))`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mcp_virtual_skills" cascade`);
    this.addSql(`drop table if exists "skill_conflicts" cascade`);
  }
}
