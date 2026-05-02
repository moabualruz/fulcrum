/**
 * Migration: unique constraints for idempotent heuristic memory upserts.
 *
 * Pillar 8, Issue 05: AfterDocSaveMemoryHook needs ON CONFLICT support so that
 * re-saving the same doc body does not produce duplicate Memory or MemoryLink rows.
 *
 * memories_heuristic_dedup     → unique (org_id, project_id, kind, body, source)
 * memory_links_memory_target_dedup → unique (memory_id, target_kind, target_id)
 *
 * Both constraints allow NULL project_id (NULLS NOT DISTINCT so two rows with
 * the same body but project_id=NULL do not collide when project differs).
 * PGlite supports NULLS NOT DISTINCT (PostgreSQL 15+).
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502100000_memory_heuristic_dedup_constraints extends Migration {
  override async up(): Promise<void> {
    // Unique constraint on memories for heuristic dedup.
    // NULLS NOT DISTINCT: two rows with project_id IS NULL but different org/kind/body/source
    // are still distinct; rows that match on ALL five fields (including both NULL) conflict.
    this.addSql(
      `create unique index "memories_heuristic_dedup" on "memories" ("org_id", "project_id", "kind", "body", "source") nulls not distinct`,
    );

    // Unique constraint on memory_links so (memory_id, target_kind, target_id) is unique.
    this.addSql(
      `create unique index "memory_links_memory_target_dedup" on "memory_links" ("memory_id", "target_kind", "target_id")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "memory_links_memory_target_dedup"`);
    this.addSql(`drop index if exists "memories_heuristic_dedup"`);
  }
}
