/**
 * Migration: AgentRun Sandcastle payload columns + search document FK.
 *
 * Adds Pillar 4 execution metadata while keeping the Sandcastle/provider
 * surface behind feature flags. Static SQL is limited to migration bodies per
 * C6; no user input reaches these statements.
 *
 * Closes (issue): .scratch/agent-os-vision/04-sandcastle-wrapper/issues/02-agent-runs-schema-migration.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502070400_agent_runs_sandcastle_columns extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `alter table "agent_runs" add column "created_at" timestamptz not null default now()`,
    );
    this.addSql(
      `alter table "agent_runs" add column "status" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "sandbox_mode" varchar(255) not null default 'host'`,
    );
    this.addSql(
      `alter table "agent_runs" add column "iteration_count" int not null default 0`,
    );
    this.addSql(
      `alter table "agent_runs" add column "token_used" int null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "transcript_path" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "transcript_truncated" boolean not null default false`,
    );
    this.addSql(
      `alter table "agent_runs" add column "workspace_diff_path" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "agent_name" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "agent_version" varchar(255) null`,
    );
    this.addSql(
      `alter table "agent_runs" add column "search_doc_id" uuid null`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_sandbox_mode_check" check ("sandbox_mode" in ('host', 'docker', 'podman'))`,
    );
    this.addSql(
      `alter table "agent_runs" add constraint "agent_runs_search_doc_id_foreign" foreign key ("search_doc_id") references "search_documents" ("id")`,
    );
    this.addSql(
      `create index "agent_runs_agent_org" on "agent_runs" ("org_id", "agent_name", "status", "created_at")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "agent_runs_agent_org"`);
    this.addSql(
      `alter table "agent_runs" drop constraint if exists "agent_runs_search_doc_id_foreign"`,
    );
    this.addSql(
      `alter table "agent_runs" drop constraint if exists "agent_runs_sandbox_mode_check"`,
    );
    this.addSql(`alter table "agent_runs" drop column if exists "search_doc_id"`);
    this.addSql(`alter table "agent_runs" drop column if exists "agent_version"`);
    this.addSql(`alter table "agent_runs" drop column if exists "agent_name"`);
    this.addSql(
      `alter table "agent_runs" drop column if exists "workspace_diff_path"`,
    );
    this.addSql(`alter table "agent_runs" drop column if exists "transcript_path"`);
    this.addSql(`alter table "agent_runs" drop column if exists "transcript_truncated"`);
    this.addSql(`alter table "agent_runs" drop column if exists "token_used"`);
    this.addSql(`alter table "agent_runs" drop column if exists "iteration_count"`);
    this.addSql(`alter table "agent_runs" drop column if exists "sandbox_mode"`);
    this.addSql(`alter table "agent_runs" drop column if exists "status"`);
    this.addSql(`alter table "agent_runs" drop column if exists "created_at"`);
  }
}
