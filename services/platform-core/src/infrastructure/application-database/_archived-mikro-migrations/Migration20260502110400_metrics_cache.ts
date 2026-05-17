import { Migration } from "@mikro-orm/migrations";

export class Migration20260502110400_metrics_cache extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "metrics_cache" (` +
        `"id" uuid not null default gen_random_uuid(), ` +
        `"project_id" uuid not null, ` +
        `"sprint_id" uuid null, ` +
        `"date" date not null, ` +
        `"started_count" integer not null default 0, ` +
        `"completed_count" integer not null default 0, ` +
        `"blocked_count" integer not null default 0, ` +
        `"points_completed" integer not null default 0, ` +
        `"points_remaining" integer not null default 0, ` +
        `"wip_count" integer not null default 0, ` +
        `"updated_at" timestamptz not null default now(), ` +
        `constraint "metrics_cache_project_sprint_date_unique" unique ("project_id", "sprint_id", "date"), ` +
        `primary key ("id")` +
        `)`,
    );

    this.addSql(
      `do $$ begin ` +
        `if not exists (select 1 from pg_constraint where conname = 'metrics_cache_sprint_id_foreign') then ` +
        `alter table "metrics_cache" add constraint "metrics_cache_sprint_id_foreign" ` +
        `foreign key ("sprint_id") references "sprints" ("id") on delete cascade; ` +
        `end if; end $$`,
    );

    this.addSql(
      `create index if not exists "metrics_cache_project_sprint_date" on "metrics_cache" ("project_id", "sprint_id", "date")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "metrics_cache_project_sprint_date"`);
    this.addSql(`drop table if exists "metrics_cache" cascade`);
  }
}
