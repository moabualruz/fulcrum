/**
 * Migration: add yjs_state bytea column to doc_versions.
 *
 * P7#21: stores Yjs binary state alongside existing snapshot/delta path.
 * Both coexist — yjs_state written by Hocuspocus persistence adapter when
 * real-time-collab-server flag is ON; snapshot/delta path continues unchanged.
 *
 * Column is nullable: only populated when collab server writes Yjs state.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260503120000_doc_versions_yjs_state extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      'ALTER TABLE "doc_versions" ADD COLUMN IF NOT EXISTS "yjs_state" bytea DEFAULT NULL;',
    );
    this.addSql(
      'COMMENT ON COLUMN "doc_versions"."yjs_state" IS \'Yjs binary state vector; written by Hocuspocus persistence when real-time-collab-server flag ON.\';',
    );
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE "doc_versions" DROP COLUMN IF EXISTS "yjs_state";');
  }
}
