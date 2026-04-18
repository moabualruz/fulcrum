// packages/memory/src/l1/apply.ts
//
// Memory v3 PR 3 unit 3.5 — deterministic apply-layer.
//
// `applyCuratorOutput` sits between the curator runtime (unit 3.1) and the
// vault + graph primitives (units 2.2 / 2.5). It takes the parsed
// CuratorOutput and executes it atomically:
//
//   1. Create every new_page via createCuratedPage — fills id, first_seen,
//      last_confirmed, workspace_id, project_id; validator enforces template
//      + Constraint §15 via ctx.curator_input_sources.
//   2. Merge every update via updateCuratedPage — add_sources / add_entities
//      are deduped against the existing sets; body / confidence /
//      retention_tier replace when non-null.
//   3. For every supersession, supersedeCuratedPage writes the new page +
//      stamps superseded_by on the old row (audit chain preserved).
//   4. Every new_edge goes through addEdge.
//
// All four steps run inside a single `db.transaction()` so DB state is
// atomic. Vault writes have no native transaction: the layer tracks paths
// of files it just wrote and unlinks them if the transaction aborts. File
// names are ULID-based so no two concurrent curator runs collide.

import { unlinkSync } from 'fs'
import { join } from 'path'
import { getDb, newId } from 'fulcrum-agent-core'
import {
  createCuratedPage,
  readCuratedPage,
  supersedeCuratedPage,
  updateCuratedPage,
  curatedRelativePath,
} from './page.js'
import { addEdge } from './entities.js'
import { getVaultPath } from '../vault/client.js'
import { recordL1Embedding } from '../l2/embed.js'
import type { CuratedPage } from './frontmatter.js'
import type {
  CuratorEdge,
  CuratorNewPage,
  CuratorOutput,
  CuratorPageUpdate,
  CuratorSupersession,
} from './curator.js'

export interface ApplyContext {
  workspace_id: string
  project_id: string
  /**
   * Constraint §15 allowlist passed through to every createCuratedPage /
   * updateCuratedPage / supersedeCuratedPage call. Must include every L0
   * source_id the curator was shown (l0_sources + corrections).
   */
  curator_input_sources: string[]
  dry_run?: boolean
  /** Clock override. Defaults to `() => new Date().toISOString()`. */
  now?: () => string
}

export interface ApplyResult {
  created_page_ids: string[]
  updated_page_ids: string[]
  superseded_pairs: Array<{ old_id: string; new_id: string }>
  created_edge_ids: string[]
  dry_run: boolean
}

function buildCuratedPage(
  draft: CuratorNewPage,
  ctx: ApplyContext,
  nowIso: string,
): CuratedPage {
  const page: CuratedPage = {
    id: newId('memory'),
    schema: 'fulcrum.memory/v3',
    type: draft.type,
    confidence: draft.confidence,
    first_seen: nowIso,
    last_confirmed: nowIso,
    retention_tier: draft.retention_tier,
    access_count: 0,
    sources: draft.sources,
    sources_via: draft.sources_via,
    supersedes: [],
    superseded_by: null,
    entities: draft.entities,
    workspace_id: ctx.workspace_id,
    project_id: ctx.project_id,
    body: draft.body,
  }
  if (draft.name !== null) page.name = draft.name
  if (draft.title !== null) page.title = draft.title
  if (draft.entity_type !== null) page.entity_type = draft.entity_type
  if (draft.aliases !== null) page.aliases = draft.aliases
  return page
}

function dryRunResult(output: CuratorOutput): ApplyResult {
  return {
    created_page_ids: output.new_pages.map(() => 'dry_run'),
    updated_page_ids: output.updates.map((u) => u.page_id),
    superseded_pairs: output.supersessions.map((s) => ({
      old_id: s.old_page_id,
      new_id: 'dry_run',
    })),
    created_edge_ids: output.new_edges.map(() => 'dry_run'),
    dry_run: true,
  }
}

function mergeUpdatePatch(
  existing: CuratedPage,
  u: CuratorPageUpdate,
  nowIso: string,
): Partial<CuratedPage> {
  const patch: Partial<CuratedPage> = { last_confirmed: nowIso }
  if (u.body !== null) patch.body = u.body
  if (u.confidence !== null) patch.confidence = u.confidence
  if (u.retention_tier !== null) patch.retention_tier = u.retention_tier
  if (u.add_sources.length > 0) {
    patch.sources = Array.from(new Set([...existing.sources, ...u.add_sources]))
  }
  if (u.add_entities.length > 0) {
    patch.entities = Array.from(new Set([...existing.entities, ...u.add_entities]))
  }
  return patch
}

/**
 * Execute a parsed CuratorOutput atomically. On error: DB transaction rolls
 * back AND any vault files written during the attempt are unlinked. Returns
 * the set of written page_ids + edge_ids for telemetry (unit 3.7).
 */
export function applyCuratorOutput(output: CuratorOutput, ctx: ApplyContext): ApplyResult {
  if (ctx.dry_run) return dryRunResult(output)

  const db = getDb()
  const nowIso = ctx.now ? ctx.now() : new Date().toISOString()
  const vaultRoot = getVaultPath()

  const created_page_ids: string[] = []
  const updated_page_ids: string[] = []
  const superseded_pairs: Array<{ old_id: string; new_id: string }> = []
  const created_edge_ids: string[] = []
  const filesWritten: string[] = []

  const validatorCtx = {
    phase: 'live' as const,
    curator_input_sources: ctx.curator_input_sources,
  }

  const applyNewPage = (draft: CuratorNewPage): void => {
    const page = buildCuratedPage(draft, ctx, nowIso)
    filesWritten.push(join(vaultRoot, curatedRelativePath(page)))
    createCuratedPage(page, { ctx: validatorCtx })
    created_page_ids.push(page.id)
  }

  const applyUpdate = (u: CuratorPageUpdate): void => {
    const existing = readCuratedPage(u.page_id)
    if (!existing) {
      throw new Error(`apply: update target page '${u.page_id}' not found`)
    }
    const patch = mergeUpdatePatch(existing, u, nowIso)
    updateCuratedPage(u.page_id, patch, { ctx: validatorCtx })
    updated_page_ids.push(u.page_id)
  }

  const applySupersession = (s: CuratorSupersession): void => {
    const freshPage = buildCuratedPage(s.new_page, ctx, nowIso)
    filesWritten.push(join(vaultRoot, curatedRelativePath(freshPage)))
    const result = supersedeCuratedPage(s.old_page_id, freshPage, {
      ctx: validatorCtx,
    })
    superseded_pairs.push({ old_id: result.old_id, new_id: result.new_page.id })
  }

  const applyEdge = (e: CuratorEdge): void => {
    const edge_id = addEdge({
      workspace_id: ctx.workspace_id,
      source_id: e.source_entity_id,
      target_id: e.target_entity_id,
      relation: e.relation,
      confidence: e.confidence,
      ...(e.source_ids.length > 0 ? { source_ids: e.source_ids } : {}),
    })
    created_edge_ids.push(edge_id)
  }

  const txn = db.transaction(() => {
    for (const p of output.new_pages) applyNewPage(p)
    for (const u of output.updates) applyUpdate(u)
    for (const s of output.supersessions) applySupersession(s)
    for (const e of output.new_edges) applyEdge(e)
  })

  try {
    txn()
  } catch (err) {
    for (const path of filesWritten) {
      try {
        unlinkSync(path)
      } catch {
        // orphans are not fatal; DB is consistent.
      }
    }
    throw err
  }

  // PR 4 unit 4.2 — embed every page whose memories row is now durable.
  // Superseded old rows are NOT re-embedded; supersession is audit, not
  // replacement. Fire-and-forget: flushPendingMemoryWrites drains before exit.
  for (const id of created_page_ids) recordL1Embedding(db, id)
  for (const id of updated_page_ids) recordL1Embedding(db, id)
  for (const pair of superseded_pairs) recordL1Embedding(db, pair.new_id)

  return {
    created_page_ids,
    updated_page_ids,
    superseded_pairs,
    created_edge_ids,
    dry_run: false,
  }
}
