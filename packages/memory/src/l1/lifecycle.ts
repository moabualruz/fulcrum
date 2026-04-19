// packages/memory/src/l1/lifecycle.ts
//
// Memory v3 PR 7 unit 7.1 — L1 page lifecycle primitives.
//
// Confidence decay (plan §Lifecycle, Ebbinghaus):
//   confidence *= exp(-λ * days_since_anchor)
// λ per retention_tier (per-day): working 0.3, episodic 0.1, semantic 0.01,
// procedural 0.001. The anchor for Δdays is `confidence_decay_at` once a
// decay pass has stamped it, falling back to `last_confirmed` for the first
// pass.
//
// Promotion: mutates retention_tier in both the memories row and the vault
// frontmatter so the two stay in lockstep.
//
// Archival: moves the vault file under `curated/.archive/` and updates
// memories.vault_path. The memories row stays — archival is soft delete for
// audit. Retrieval filtering by vault_path prefix is a follow-up; PR 7.1's
// contract is the move + path update.

import { FulcrumError, getDb } from 'fulcrum-agent-core'
import { renameSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { getVaultPath } from '../vault/client.js'
import { L1_RETENTION_TIERS, type L1RetentionTier } from './frontmatter.js'
import { updateCuratedPage } from './page.js'
import type Database from 'better-sqlite3'

/**
 * Per-tier decay rates (λ, per day) from plan §Lifecycle. Exported so callers
 * (tests, docs, config panels) can reference the same constants rather than
 * re-deriving them.
 */
export const DECAY_LAMBDA_PER_DAY: Record<L1RetentionTier, number> = {
  working: 0.3,
  episodic: 0.1,
  semantic: 0.01,
  procedural: 0.001,
}

const MS_PER_DAY = 86_400_000
// Skip a row when the previous decay anchor was within this window — avoids
// thrashing confidence on re-runs of the scheduled pass.
const DECAY_MIN_INTERVAL_DAYS = 1 / 24

export interface ApplyDecayOptions {
  now?: Date
}

export interface ApplyDecayResult {
  pages_decayed: number
  pages_scanned: number
  tiers: Record<L1RetentionTier, number>
}

interface DecayRow {
  memory_id: string
  confidence: number
  retention_tier: L1RetentionTier
  updated_at: string
  confidence_decay_at: string | null
}

function parseIsoToMs(iso: string): number {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) {
    throw new FulcrumError(`lifecycle.applyDecay: invalid timestamp '${iso}'`, 'invalid_input')
  }
  return ms
}

/**
 * Run time-based confidence decay across every v3 L1 page that is not
 * superseded. Returns a per-tier breakdown of how many rows changed. Wraps
 * the full pass in a single write transaction — the 10k-page budget in the
 * plan (<10s) is met by that single-txn shape.
 */
export function applyDecay(
  db: Database.Database = getDb(),
  opts: ApplyDecayOptions = {},
): ApplyDecayResult {
  const now = opts.now ?? new Date()
  const nowMs = now.getTime()
  const nowIso = now.toISOString()

  // `updated_at` is the L1 semantic anchor — the l1_pages view aliases it as
  // `last_confirmed` for the curator-facing frontmatter. Reading from the base
  // column avoids the view's column-alias round-trip.
  const rows = db
    .prepare(
      `SELECT memory_id, confidence, retention_tier, updated_at, confidence_decay_at
         FROM memories
        WHERE schema_version >= 3
          AND superseded_by IS NULL
          AND retention_tier IS NOT NULL`,
    )
    .all() as Array<{
      memory_id: string
      confidence: number
      retention_tier: string
      updated_at: string | null
      confidence_decay_at: string | null
    }>

  const tiers: Record<L1RetentionTier, number> = {
    working: 0,
    episodic: 0,
    semantic: 0,
    procedural: 0,
  }
  let pages_decayed = 0
  const update = db.prepare(
    `UPDATE memories
        SET confidence = ?, confidence_decay_at = ?
      WHERE memory_id = ?`,
  )

  const tx = db.transaction((batch: DecayRow[]) => {
    for (const r of batch) {
      const lambda = DECAY_LAMBDA_PER_DAY[r.retention_tier]
      if (lambda === undefined) continue
      const anchorIso = r.confidence_decay_at ?? r.updated_at
      if (!anchorIso) continue
      const anchorMs = parseIsoToMs(anchorIso)
      const days = (nowMs - anchorMs) / MS_PER_DAY
      if (days < DECAY_MIN_INTERVAL_DAYS) continue
      const decayed = r.confidence * Math.exp(-lambda * days)
      update.run(decayed, nowIso, r.memory_id)
      tiers[r.retention_tier]++
      pages_decayed++
    }
  })

  const typed: DecayRow[] = []
  for (const r of rows) {
    if (!(r.retention_tier in DECAY_LAMBDA_PER_DAY)) continue
    if (!r.updated_at && !r.confidence_decay_at) continue
    typed.push({
      memory_id: r.memory_id,
      confidence: r.confidence,
      retention_tier: r.retention_tier as L1RetentionTier,
      updated_at: r.updated_at ?? '',
      confidence_decay_at: r.confidence_decay_at,
    })
  }
  tx(typed)

  return { pages_decayed, pages_scanned: rows.length, tiers }
}

/**
 * Move a page into a new retention tier. Updates both the memories row and
 * the vault frontmatter so recall and linting see the same value.
 */
export function promoteToTier(
  page_id: string,
  target_tier: L1RetentionTier,
): void {
  if (!(L1_RETENTION_TIERS as readonly string[]).includes(target_tier)) {
    throw new FulcrumError(
      `lifecycle.promoteToTier: unknown retention_tier '${target_tier}' (allowed: ${L1_RETENTION_TIERS.join(', ')})`,
      'invalid_input',
    )
  }
  updateCuratedPage(page_id, { retention_tier: target_tier })
}

export interface ArchivePageResult {
  archived: boolean
  new_path?: string
}

/**
 * Soft-delete an L1 page by moving its vault file under `curated/.archive/`.
 * Idempotent — a second call returns `{archived: false}`.
 */
export function archivePage(
  page_id: string,
  opts: { vaultPath?: string } = {},
): ArchivePageResult {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT vault_path FROM memories
        WHERE memory_id = ? AND schema_version >= 3`,
    )
    .get(page_id) as { vault_path: string | null } | undefined
  if (!row) {
    throw new FulcrumError(`L1 page '${page_id}' not found`, 'not_found')
  }
  const oldRel = row.vault_path
  if (!oldRel) return { archived: false }
  if (oldRel.startsWith('curated/.archive/')) return { archived: false }
  if (!oldRel.startsWith('curated/')) {
    throw new FulcrumError(
      `lifecycle.archivePage: unexpected vault_path '${oldRel}' (expected curated/ prefix)`,
      'invalid_input',
    )
  }

  const vaultPath = opts.vaultPath ?? getVaultPath()
  const newRel = `curated/.archive/${oldRel.slice('curated/'.length)}`
  const absOld = join(vaultPath, oldRel)
  const absNew = join(vaultPath, newRel)

  if (!existsSync(absOld)) {
    // Row points at a missing file — nothing to move, but we still update the
    // row so future operations observe the archive path.
    db.prepare('UPDATE memories SET vault_path = ? WHERE memory_id = ?').run(newRel, page_id)
    return { archived: true, new_path: newRel }
  }

  mkdirSync(dirname(absNew), { recursive: true })
  renameSync(absOld, absNew)
  db.prepare('UPDATE memories SET vault_path = ? WHERE memory_id = ?').run(newRel, page_id)
  return { archived: true, new_path: newRel }
}
