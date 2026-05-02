/**
 * Migration: Inference model metadata + embedding properties.
 *
 * Rust owns $FULCRUM_HOME/inference-cache.db; these tables stay in Fulcrum DB.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502080000_inference_cache_schema extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "model_cache" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "model_id" varchar(255) not null, "kind" varchar(255) not null, "source" varchar(255) not null, "local_path" varchar(255) null, "size_bytes" bigint null, "sha256" varchar(255) null, "downloaded" boolean not null default false, "active" boolean not null default false, "created_at" timestamptz not null default now(), primary key ("id"))`,
    );
    this.addSql(
      `alter table "model_cache" add constraint "model_cache_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );
    this.addSql(
      `alter table "model_cache" add constraint "model_cache_kind_check" check ("kind" in ('embed', 'generate', 'classify'))`,
    );
    this.addSql(
      `alter table "model_cache" add constraint "model_cache_source_check" check ("source" in ('bundled', 'huggingface', 'local'))`,
    );
    this.addSql(
      `create unique index "model_cache_org_model_id" on "model_cache" ("org_id", "model_id")`,
    );
    this.addSql(
      `create index "model_cache_org_kind_active" on "model_cache" ("org_id", "kind", "active")`,
    );

    this.addSql(
      `create table "provider_credentials" ("id" uuid not null default gen_random_uuid(), "org_id" uuid not null, "provider" varchar(255) not null, "base_url" varchar(255) not null, "secret_ref" varchar(255) null, "active" boolean not null default false, primary key ("id"))`,
    );
    this.addSql(
      `alter table "provider_credentials" add constraint "provider_credentials_org_id_foreign" foreign key ("org_id") references "orgs" ("id")`,
    );
    this.addSql(
      `alter table "provider_credentials" add constraint "provider_credentials_provider_check" check ("provider" in ('ollama', 'lm-studio', 'openai-compatible'))`,
    );
    this.addSql(
      `create index "provider_credentials_org_provider_active" on "provider_credentials" ("org_id", "provider", "active")`,
    );

    this.addSql(`alter table "memories" add column "embedding" text null`);
    this.addSql(`alter table "search_documents" add column "embedding" text null`);
    this.addSql(`alter table "documents" add column "embedding" text null`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "documents" drop column if exists "embedding"`);
    this.addSql(`alter table "search_documents" drop column if exists "embedding"`);
    this.addSql(`alter table "memories" drop column if exists "embedding"`);
    this.addSql(`drop table if exists "provider_credentials" cascade`);
    this.addSql(`drop table if exists "model_cache" cascade`);
  }
}
