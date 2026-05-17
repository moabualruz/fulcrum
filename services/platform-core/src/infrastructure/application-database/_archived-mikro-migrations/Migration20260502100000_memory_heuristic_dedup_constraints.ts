/**
 * Migration: unique constraints for idempotent heuristic memory upserts.
 *
 * Pillar 8, Issue 05: AfterDocSaveMemoryHook needs ON CONFLICT support so that
 * re-saving the same doc body does not produce duplicate Memory or MemoryLink rows.
 *
 * memories_heuristic_dedup (partial)
 *   → unique (org_id, project_id, kind, body) WHERE source = 'heuristic'
 *   Partial index: does not constrain manual/llm-sourced memories, which may
 *   legitimately share body text (e.g. retriever test seeds).
 *
 * memory_links_memory_target_dedup
 *   → unique (memory_id, target_kind, target_id)
 *   Prevents duplicate link rows when the same doc is re-saved.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260502100000_memory_heuristic_dedup_constraints extends Migration {
  override async up(): Promise<void> {
    // Partial unique index — only constrains heuristic-source memories.
    // NULLS NOT DISTINCT: project_id=NULL rows with same org/kind/body are still
    // considered duplicates (same document saved twice with no project context).
    this.addSql(
      `create unique index "memories_heuristic_dedup" on "memories" ("org_id", "project_id", "kind", "body") nulls not distinct where "source" = 'heuristic'`,
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
