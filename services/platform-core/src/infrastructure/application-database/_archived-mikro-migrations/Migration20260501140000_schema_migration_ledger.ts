/**
 * SchemaMigration ledger table migration.
 *
 * Creates the `schema_migrations` table used by Fulcrum's MigratorService
 * to record checksums + direction of every applied migration.
 *
 * This is conceptually the "meta-migration" — it tracks itself after first apply.
 * MikroORM's own `mikro_orm_migrations` table is separate and managed by getMigrator().
 *
 * C6: addSql(...) strings are the sanctioned escape hatch inside Migration class bodies.
 * C9: Migration class file at services/platform-core/src/infrastructure/application-database/migrations/Migration<timestamp>.ts.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/19-migration-up-down-versioning.md
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260501140000_schema_migration_ledger extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    // version: bigint PRIMARY KEY (caller-supplied timestamp, not serial).
    // name, checksum: text (not varchar — avoids length limit surprises).
    // direction: text check constraint — keeps DDL portable.
    this.addSql(
      `create table "schema_migrations" ("version" bigint not null, "name" text not null, "applied_at" timestamptz not null default now(), "checksum" text not null, "direction" text not null check ("direction" in ('up','down')), primary key ("version"))`,
    );
    this.addSql(
      `alter table "schema_migrations" add constraint "uq_schema_migrations_name" unique ("name")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "schema_migrations" cascade`);
  }
}
