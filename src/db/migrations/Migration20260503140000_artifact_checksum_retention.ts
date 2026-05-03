/**
 * Migration: add checksum_sha256 and retention_until to artifacts (P4#12).
 *
 * checksum_sha256 enables dedup during harvest; retention_until
 * supports project-level artifact retention policy.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260503140000_artifact_checksum_retention extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "artifacts" add column "checksum_sha256" varchar(64) null`,
    );
    this.addSql(
      `alter table "artifacts" add column "retention_until" timestamptz null`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "artifacts" drop column if exists "checksum_sha256"`,
    );
    this.addSql(
      `alter table "artifacts" drop column if exists "retention_until"`,
    );
  }
}
