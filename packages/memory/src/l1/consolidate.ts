// packages/memory/src/l1/consolidate.ts
//
// Memory v3 PR 7 unit 7.4 — `fulcrum memory consolidate`.
//
// Plan §7.4: find pages sharing the same entity set + the same retention
// tier + a minimum confidence threshold. Those are candidates for a merged
// page proposal to the curator.
//
// This file is the deterministic "find" half. The "apply" half (invoke the
// curator with a synthesis task and land a new merged page) lands when the
// curator's consolidation prompt is wired up — deferred to a follow-up so
// the 7.4 shape is stable before prompts get tuned.

import type Database from 'better-sqlite3'
import { L1_RETENTION_TIERS, type L1RetentionTier } from './frontmatter.js'

export interface ConsolidationCandidate {
  entity_set: string[]
  retention_tier: L1RetentionTier
  page_ids: string[]
  min_confidence_in_group: number
  workspace_id: string
  project_id: string
}

export interface ConsolidationOptions {
  workspace_id: string
  project_id?: string
  /** Skip groups whose lowest-confidence member falls below this floor. */
  min_confidence?: number
  /** Scope to a single tier. Omit to scan every tier. */
  retention_tier?: L1RetentionTier
}

interface PageRow {
  memory_id: string
  workspace_id: string
  project_id: string
  entities: string
  retention_tier: string
  confidence: number
}

function parseEntities(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/**
 * Scan live L1 pages for entity-set + retention-tier collisions. Returns one
 * candidate per collision of ≥ 2 pages whose minimum confidence clears the
 * floor. Canonical sort of the entity set rules out duplicate groups with
 * different entity orderings.
 */
export function findConsolidationCandidates(
  db: Database.Database,
  opts: ConsolidationOptions,
): ConsolidationCandidate[] {
  const min_confidence = opts.min_confidence ?? 0.5
  if (
    opts.retention_tier !== undefined &&
    !(L1_RETENTION_TIERS as readonly string[]).includes(opts.retention_tier)
  ) {
    throw new Error(
      `findConsolidationCandidates: unknown retention_tier '${opts.retention_tier}'`,
    )
  }

  const where: string[] = [
    'schema_version >= 3',
    'superseded_by IS NULL',
    'workspace_id = ?',
    'retention_tier IS NOT NULL',
  ]
  const params: unknown[] = [opts.workspace_id]
  if (opts.project_id !== undefined) {
    where.push('project_id = ?')
    params.push(opts.project_id)
  }
  if (opts.retention_tier !== undefined) {
    where.push('retention_tier = ?')
    params.push(opts.retention_tier)
  }

  const rows = db
    .prepare(
      `SELECT memory_id, workspace_id, project_id, entities, retention_tier, confidence
         FROM memories
        WHERE ${where.join(' AND ')}`,
    )
    .all(...params) as PageRow[]

  const groups = new Map<string, ConsolidationCandidate>()
  for (const row of rows) {
    const ents = parseEntities(row.entities)
    if (ents.length === 0) continue
    const canon = [...new Set(ents)].sort()
    const key = `${row.retention_tier}::${canon.join('\u0001')}`
    let g = groups.get(key)
    if (!g) {
      g = {
        entity_set: canon,
        retention_tier: row.retention_tier as L1RetentionTier,
        page_ids: [],
        min_confidence_in_group: row.confidence,
        workspace_id: row.workspace_id,
        project_id: row.project_id,
      }
      groups.set(key, g)
    }
    g.page_ids.push(row.memory_id)
    if (row.confidence < g.min_confidence_in_group) {
      g.min_confidence_in_group = row.confidence
    }
  }

  const out: ConsolidationCandidate[] = []
  for (const g of groups.values()) {
    if (g.page_ids.length < 2) continue
    if (g.min_confidence_in_group < min_confidence) continue
    g.page_ids.sort()
    out.push(g)
  }
  return out
}
