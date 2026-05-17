import { Migration } from "@mikro-orm/migrations";

export class Migration20260511120000_tenant_settings extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "tenant_settings" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"org_id" uuid not null, ` +
        `"key" varchar(255) not null, ` +
        `"value" jsonb not null default '{}'::jsonb, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `constraint "tenant_settings_pkey" primary key ("id"), ` +
        `constraint "uq_tenant_settings_org_key" unique ("org_id", "key")` +
        `)`,
    );
    this.addSql(`create index if not exists "tenant_settings_org_key_idx" on "tenant_settings" ("org_id", "key")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "tenant_settings_org_key_idx"`);
    this.addSql(`drop table if exists "tenant_settings" cascade`);
  }
}
