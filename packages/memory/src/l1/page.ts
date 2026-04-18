// packages/memory/src/l1/page.ts
//
// Memory v3 PR 2 unit 2.2 — CuratedPage primitives.
//
// Write path: validate → serialize → writeCuratedFile → INSERT INTO memories
// with schema_version=3. Read path: SELECT via the l1_pages view + parse the
// vault file. Supersession flips superseded_by on the old row and emits a new
// page with supersedes=[old_id].
//
// This module is the only supported writer for L1 pages; the curator (PR 3)
// calls into it after parsing its structured-output payload. Direct INSERTs
// into the memories table with schema_version=3 would bypass validation and
// are a defect.

import { FulcrumError, getDb } from 'fulcrum-agent-core'
import { getVaultPath, writeCuratedFile } from '../vault/client.js'
import {
  L1TemplateViolationError,
  validateL1Page,
  type L1ValidationContext,
} from './validator.js'
import {
  parseCuratedPage,
  serializeCuratedPage,
  type CuratedPage,
  type L1PageType,
} from './frontmatter.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const TYPE_DIR: Record<L1PageType, string> = {
  entity: 'entities',
  concept: 'concepts',
  page: 'pages',
  synthesis: 'synthesis',
}

export function curatedRelativePath(page: CuratedPage): string {
  return `curated/${TYPE_DIR[page.type]}/${page.id}.md`
}

function pageTitle(page: CuratedPage): string {
  return page.name ?? page.title ?? ''
}

function pageSummary(page: CuratedPage): string {
  const firstNonHeadingLine = page.body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('-'))
  return firstNonHeadingLine ?? pageTitle(page)
}

export type CreateCuratedPageOptions = {
  vaultPath?: string
  ctx?: L1ValidationContext
}

/**
 * Validate → serialize → writeCuratedFile → INSERT memories (schema_version=3).
 * Throws `L1TemplateViolationError` for any rule failure.
 */
export function createCuratedPage(
  page: CuratedPage,
  opts: CreateCuratedPageOptions = {},
): CuratedPage {
  const ctx = opts.ctx ?? {}
  const result = validateL1Page(page, ctx)
  if (!result.valid) throw new L1TemplateViolationError(result.violations)

  const vaultPath = opts.vaultPath ?? getVaultPath()
  const relPath = curatedRelativePath(page)

  const db = getDb()
  const existing = db
    .prepare('SELECT memory_id FROM memories WHERE memory_id = ?')
    .get(page.id)
  if (existing) {
    throw new FulcrumError(`L1 page '${page.id}' already exists`, 'conflict')
  }

  writeCuratedFile(vaultPath, relPath, serializeCuratedPage(page))

  const provenance = JSON.stringify({
    sources: page.sources,
    sources_via: page.sources_via,
  })

  db.prepare(
    `INSERT INTO memories (
       memory_id, workspace_id, project_id,
       scope, kind, title, summary, content,
       tags, entities,
       confidence, importance, freshness,
       content_hash, source, content_type,
       tier, slug, vault_path, provenance,
       supersedes, superseded_by,
       retention_tier, confidence_decay_at,
       access_count, schema_version,
       created_at, updated_at, last_accessed_at
     ) VALUES (
       ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?,
       ?, ?,
       ?, ?,
       ?, ?, ?
     )`,
  ).run(
    page.id,
    page.workspace_id,
    page.project_id,
    'project',
    page.type,
    pageTitle(page),
    pageSummary(page),
    page.body,
    '[]',
    JSON.stringify(page.entities),
    page.confidence,
    0.5,
    1.0,
    null,
    'curator',
    'text',
    'short_term',
    page.id,
    relPath,
    provenance,
    JSON.stringify(page.supersedes),
    page.superseded_by,
    page.retention_tier,
    new Date().toISOString(),
    page.access_count,
    3,
    page.first_seen,
    page.last_confirmed,
    page.last_confirmed,
  )

  return page
}

/**
 * Load a CuratedPage by id. Returns null when no memories row matches or the
 * row is pre-v3.
 */
export function readCuratedPage(
  page_id: string,
  opts: { vaultPath?: string } = {},
): CuratedPage | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT vault_path FROM memories
       WHERE memory_id = ? AND schema_version >= 3`,
    )
    .get(page_id) as { vault_path: string } | undefined
  if (!row) return null
  const vaultPath = opts.vaultPath ?? getVaultPath()
  const filePath = join(vaultPath, row.vault_path)
  if (!existsSync(filePath)) return null
  return parseCuratedPage(readFileSync(filePath, 'utf8'))
}

/**
 * Patch a CuratedPage in place. Re-validates, re-writes the vault file, and
 * updates the memories row. Throws `FulcrumError(not_found)` if the id is
 * unknown and `L1TemplateViolationError` if the merged page fails validation.
 */
export function updateCuratedPage(
  page_id: string,
  patch: Partial<CuratedPage>,
  opts: CreateCuratedPageOptions = {},
): CuratedPage {
  const current = readCuratedPage(page_id, opts)
  if (!current) throw new FulcrumError(`L1 page '${page_id}' not found`, 'not_found')

  const merged: CuratedPage = { ...current, ...patch, id: current.id, schema: current.schema, type: current.type }
  const ctx = opts.ctx ?? {}
  const result = validateL1Page(merged, ctx)
  if (!result.valid) throw new L1TemplateViolationError(result.violations)

  const vaultPath = opts.vaultPath ?? getVaultPath()
  const relPath = curatedRelativePath(merged)
  writeCuratedFile(vaultPath, relPath, serializeCuratedPage(merged))

  const provenance = JSON.stringify({
    sources: merged.sources,
    sources_via: merged.sources_via,
  })

  getDb().prepare(
    `UPDATE memories
       SET title          = ?,
           summary        = ?,
           content        = ?,
           entities       = ?,
           confidence     = ?,
           retention_tier = ?,
           access_count   = ?,
           supersedes     = ?,
           superseded_by  = ?,
           provenance     = ?,
           updated_at     = ?
     WHERE memory_id = ?`,
  ).run(
    pageTitle(merged),
    pageSummary(merged),
    merged.body,
    JSON.stringify(merged.entities),
    merged.confidence,
    merged.retention_tier,
    merged.access_count,
    JSON.stringify(merged.supersedes),
    merged.superseded_by,
    provenance,
    merged.last_confirmed,
    page_id,
  )
  return merged
}

/**
 * Create a new page that supersedes an existing one. Writes the new page,
 * appends old_id to its `supersedes[]`, and stamps `superseded_by` on the old
 * row. The supersession chain is preserved — nothing is deleted.
 */
export function supersedeCuratedPage(
  old_id: string,
  newPage: CuratedPage,
  opts: CreateCuratedPageOptions = {},
): { old_id: string; new_page: CuratedPage } {
  const db = getDb()
  const existing = db
    .prepare('SELECT memory_id FROM memories WHERE memory_id = ? AND schema_version >= 3')
    .get(old_id)
  if (!existing) throw new FulcrumError(`L1 page '${old_id}' not found`, 'not_found')

  const successor: CuratedPage = {
    ...newPage,
    supersedes: Array.from(new Set([old_id, ...newPage.supersedes])),
  }
  const created = createCuratedPage(successor, opts)

  db.prepare(
    `UPDATE memories SET superseded_by = ?, updated_at = ? WHERE memory_id = ?`,
  ).run(created.id, new Date().toISOString(), old_id)

  return { old_id, new_page: created }
}
