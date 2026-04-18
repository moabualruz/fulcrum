// packages/cli/src/commands/memory-migrate.ts
//
// Memory v3 PR 6 — `fulcrum memory migrate` orchestrator.
//
// Runs the three vault → DB migration steps + the 103 cutover + the 6.5
// lint pass in one CLI invocation. This is the end-to-end entry point
// the plan §PR 6 Verify gate calls out:
//
//   Fresh vault + DB → seed 10 rows of each kind via the old path →
//   run `fulcrum memory migrate` → all 10 land in the right tier with
//   complete round-trip.
//
// Steps (per plan §PR 6):
//   1. classifyMemoriesForMigration  — dry-run preview (6.1)
//   2. migrateAllMemories             — write vault/raw + vault/curated (6.2)
//   3. applyDbBackfill                — insert l0_sources, backfill L1,
//                                       delete L0 memories rows (6.3)
//   4. runMigration103MemoryV3Cutover — flip NOT NULL (6.4)
//   5. lintMemoryVault                — verify (6.5)
//
// dry_run=true runs 1, an empty 2/3 (planned-only), skips 4, runs 5 on
// current state. Does NOT write anything.

import type Database from 'better-sqlite3'
import { getDb } from 'fulcrum-agent-core'
import {
  migrateAllMemories,
  applyDbBackfill,
  buildClassifierReport,
  classifyMemoriesForMigration,
  runMigration101MemoryV3Lifecycle,
  runMigration102MemoryV3SourceIndex,
  runMigration103MemoryV3Cutover,
  lintMemoryVault,
  type MigrationBatch,
  type MigrationBackfillResult,
  type MigrationClassifierReport,
  type LintReport,
} from 'fulcrum-memory'

export interface MigrateInput {
  vault_root: string
  workspace_id?: string
  dry_run?: boolean
  // Skip cutover even on a live run — useful when the operator wants to
  // inspect state before flipping NOT NULL. Default false.
  skip_cutover?: boolean
  db?: Database.Database
}

export interface MigrateResult {
  dry_run: boolean
  classifier: MigrationClassifierReport
  vault: MigrationBatch
  db?: MigrationBackfillResult
  cutover: { applied: boolean; skipped_reason?: string }
  lint: LintReport
  ok: boolean
}

export function runMemoryMigrate(input: MigrateInput): MigrateResult {
  const db = input.db ?? getDb()
  const dry_run = input.dry_run ?? false

  // 0. Idempotent schema setup. 101 adds the nullable v3 lifecycle columns
  //    + l0_sources + l1_pages view; 102 adds the indexes. Both are safe to
  //    call repeatedly (PRAGMA table_info guards). Needed so the classifier
  //    + backfill + lint can all read/write v3 columns.
  runMigration101MemoryV3Lifecycle(db)
  runMigration102MemoryV3SourceIndex(db)

  // 1. Classifier report (independent of vault state).
  const classifyOpts: Parameters<typeof classifyMemoriesForMigration>[1] = {}
  if (input.workspace_id) classifyOpts.workspaceId = input.workspace_id
  const classified = classifyMemoriesForMigration(db, classifyOpts)
  const classifier = buildClassifierReport(classified)

  // 2. Vault writes.
  const migrateOpts: Parameters<typeof migrateAllMemories>[2] = { dry_run }
  if (input.workspace_id) migrateOpts.workspaceId = input.workspace_id
  const vault = migrateAllMemories(input.vault_root, db, migrateOpts)

  // 3. DB backfill (manifest drives it).
  let dbResult: MigrationBackfillResult | undefined
  if (!dry_run) {
    dbResult = applyDbBackfill(db, vault.manifest)
  } else {
    dbResult = applyDbBackfill(db, vault.manifest, { dry_run: true })
  }

  // 4. Cutover.
  let cutover: MigrateResult['cutover']
  if (dry_run) {
    cutover = { applied: false, skipped_reason: 'dry_run' }
  } else if (input.skip_cutover) {
    cutover = { applied: false, skipped_reason: 'skip_cutover flag' }
  } else if (dbResult && dbResult.errors.length > 0) {
    cutover = { applied: false, skipped_reason: 'backfill errors present — refusing to flip NOT NULL' }
  } else {
    // Catch-all: unknown-kind rows still carry NULL retention_tier /
    // confidence_decay_at after 6.3 (they're intentionally untouched).
    // The 6.4 cutover's NOT NULL flip would reject them. Backfill with a
    // `retention_tier='legacy'` sentinel + decay=now so they survive the
    // rebuild; schema_version stays < 3 so the l1_pages view keeps
    // skipping them.
    db.prepare(`
      UPDATE memories SET
        retention_tier = 'legacy',
        confidence_decay_at = datetime('now')
      WHERE retention_tier IS NULL OR confidence_decay_at IS NULL
    `).run()
    runMigration103MemoryV3Cutover(db)
    cutover = { applied: true }
  }

  // 5. Lint (always runs — on dry_run it reports current state).
  const lint = lintMemoryVault(db)

  const ok =
    vault.errors.length === 0 &&
    (dbResult === undefined || dbResult.errors.length === 0) &&
    lint.ok

  const base: MigrateResult = {
    dry_run,
    classifier,
    vault,
    cutover,
    lint,
    ok,
  }
  if (dbResult) base.db = dbResult
  return base
}
