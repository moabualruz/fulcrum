import { Migration } from "@mikro-orm/migrations";

export class Migration20260502110500_connector_sync_log extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "connector_sync_log" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"org_id" uuid not null, ` +
        `"connector" text not null, ` +
        `"status" text not null, ` +
        `"last_run_at" timestamptz not null default now(), ` +
        `"error" text null, ` +
        `constraint "connector_sync_log_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade, ` +
        `primary key ("id")` +
        `)`,
    );

    this.addSql(
      `create index if not exists "connector_sync_log_org_connector" on "connector_sync_log" ("org_id", "connector")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "connector_sync_log_org_connector"`);
    this.addSql(`drop table if exists "connector_sync_log" cascade`);
  }
}
