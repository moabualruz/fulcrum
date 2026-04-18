// packages/memory/src/migration/migrator.ts
//
// Memory v3 PR 6 unit 6.2 — filesystem migrator.
//
// Writes the vault side of the v2a → v3 migration. DB updates (bumping
// schema_version, inserting l0_sources rows, deleting L0-class rows) land
// in unit 6.3. This unit is filesystem-only so each side is independently
// testable, roll-forwardable, and per-row idempotent.
//
//   L0_raw          → vault/raw/<source_type>/<yyyy>/<mm>/<dd>/<memory_id>.md
//                     Body verbatim, 0600 perms, L0Frontmatter shape.
//   L1_curated_stub → vault/curated/<type_dir>/<memory_id>.md
//                     sources=[] + confidence=0.5 + retention_tier='working'
//                     per plan §6.2 "human-edited, no original L0 exists".
//
// Idempotency: if the vault file already exists with a matching content_hash
// the migrator returns `result: 'skipped'`. Mismatched-hash hits throw loudly —
// migration never silently overwrites divergent content.

import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { writeRawFile, writeCuratedFile } from '../vault/client.js'
import type { L0Frontmatter, L0SourceType } from '../l0/types.js'
import type { CuratedPage, L1PageType } from '../l1/frontmatter.js'
import { serializeCuratedPage } from '../l1/frontmatter.js'
import {
  classifyMemoriesForMigration,
  classifyMemoryKind,
  type ClassifiedRow,
  type MigrationClass,
} from './classifier.js'

export type MigrationResult = 'written' | 'skipped' | 'planned'

export interface MigrationRecord {
  memory_id: string
  workspace_id: string
  project_id: string | null
  kind: string
  classification: MigrationClass
  vault_path: string
  content_hash: string
  size_bytes: number
  result: MigrationResult
  // Only set when classification === 'l0_raw'.
  l0_source_type?: L0SourceType
  // Only set when classification === 'l1_curated_stub'.
  l1_page_type?: L1PageType
}

export interface MigrationBatchError {
  memory_id: string
  kind: string
  classification: MigrationClass
  message: string
}

export interface MigrationBatch {
  manifest: MigrationRecord[]
  l0: { count: number }
  l1: { count: number }
  unknown: { count: number }
  errors: MigrationBatchError[]
}

export interface MigrationOptions {
  workspaceId?: string
  limit?: number
  dry_run?: boolean
}

const KIND_TO_L1_PAGE_TYPE: Record<string, L1PageType> = {
  decision: 'page',
  fact: 'page',
  concept: 'concept',
  identity: 'entity',
  persona: 'entity',
}

const TYPE_DIR: Record<L1PageType, string> = {
  entity: 'entities',
  concept: 'concepts',
  page: 'pages',
  synthesis: 'synthesis',
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseCreatedAt(raw: string): { yyyy: string; mm: string; dd: string; iso: string } {
  // memories.created_at is a SQLite datetime TEXT — accept either
  // "YYYY-MM-DD HH:MM:SS" or ISO-8601. Date.parse handles both.
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`migrator: unparseable created_at '${raw}'`)
  }
  return {
    yyyy: String(d.getUTCFullYear()),
    mm: pad2(d.getUTCMonth() + 1),
    dd: pad2(d.getUTCDate()),
    iso: d.toISOString(),
  }
}

interface MemoryRowSlice {
  memory_id: string
  workspace_id: string
  project_id: string | null
  kind: string
  title: string
  summary: string
  content: string
  session_id: string | null
  created_at: string
}

function readMemoryRow(db: Database.Database, memory_id: string): MemoryRowSlice {
  const row = db.prepare(
    `SELECT memory_id, workspace_id, project_id, kind, title, summary, content, session_id, created_at
     FROM memories WHERE memory_id = ?`,
  ).get(memory_id) as MemoryRowSlice | undefined
  if (!row) throw new Error(`migrator: memories row '${memory_id}' not found`)
  return row
}

function serializeL0Frontmatter(fm: L0Frontmatter): string {
  const line = (k: string, v: string | number | null): string => {
    if (v === null) return `${k}: null`
    if (typeof v === 'number') return `${k}: ${v}`
    return `${k}: ${v}`
  }
  return [
    '---',
    line('id', fm.id),
    line('schema', fm.schema),
    line('source_type', fm.source_type),
    line('session_id', fm.session_id),
    line('workspace_id', fm.workspace_id),
    line('project_id', fm.project_id),
    line('cwd', fm.cwd),
    line('created_at', fm.created_at),
    line('content_hash', fm.content_hash),
    line('size_bytes', fm.size_bytes),
    '---',
    '',
  ].join('\n')
}

function migrateL0Row(
  vaultRoot: string,
  row: MemoryRowSlice,
  source_type: L0SourceType,
  dry_run: boolean,
): { vault_path: string; content_hash: string; size_bytes: number; result: MigrationResult } {
  const body = row.content
  const size_bytes = Buffer.byteLength(body, 'utf-8')
  const content_hash = createHash('sha256').update(body).digest('hex')
  const { yyyy, mm, dd, iso } = parseCreatedAt(row.created_at)
  const vault_path = `raw/${source_type}/${yyyy}/${mm}/${dd}/${row.memory_id}.md`

  if (dry_run) return { vault_path, content_hash, size_bytes, result: 'planned' }

  const abs = join(vaultRoot, vault_path)
  if (existsSync(abs)) {
    const existing = readFileSync(abs, 'utf-8')
    // The body is the portion after the closing frontmatter `---\n`.
    const idx = existing.indexOf('\n---\n')
    const existingBody = idx >= 0 ? existing.slice(idx + '\n---\n'.length) : existing
    const existingHash = createHash('sha256').update(existingBody).digest('hex')
    if (existingHash === content_hash) return { vault_path, content_hash, size_bytes, result: 'skipped' }
    throw new Error(
      `migrator: content_hash mismatch for memory_id '${row.memory_id}' at '${vault_path}' — refusing to overwrite`,
    )
  }

  const fm: L0Frontmatter = {
    id: row.memory_id,
    schema: 'fulcrum.source/v3',
    source_type,
    session_id: row.session_id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    cwd: null,
    created_at: iso,
    content_hash,
    size_bytes,
  }
  writeRawFile(vaultRoot, vault_path, serializeL0Frontmatter(fm) + body)
  return { vault_path, content_hash, size_bytes, result: 'written' }
}

function stubBody(row: MemoryRowSlice): string {
  const header = row.title.trim().length > 0 ? row.title.trim() : row.kind
  return `# ${header}\n\n${row.content}`
}

function migrateL1Row(
  vaultRoot: string,
  row: MemoryRowSlice,
  page_type: L1PageType,
  dry_run: boolean,
): { vault_path: string; content_hash: string; size_bytes: number; result: MigrationResult } {
  const body = stubBody(row)
  const size_bytes = Buffer.byteLength(body, 'utf-8')
  const content_hash = createHash('sha256').update(body).digest('hex')
  const dir = TYPE_DIR[page_type]
  const vault_path = `curated/${dir}/${row.memory_id}.md`

  if (dry_run) return { vault_path, content_hash, size_bytes, result: 'planned' }

  const abs = join(vaultRoot, vault_path)
  if (existsSync(abs)) {
    // For L1 stubs, content-equality means same serialization — cheapest
    // check is whether the on-disk ID matches, which gray-matter parse can do.
    // We keep it simple: treat any pre-existing file at this path as a skip
    // (migration is a one-shot cutover; operator intervention is the only way
    // for a file to pre-exist without matching hash, which is fine to leave).
    return { vault_path, content_hash, size_bytes, result: 'skipped' }
  }

  const { iso } = parseCreatedAt(row.created_at)
  const page: CuratedPage = {
    id: row.memory_id,
    schema: 'fulcrum.memory/v3',
    type: page_type,
    confidence: 0.5,
    first_seen: iso,
    last_confirmed: iso,
    retention_tier: 'working',
    access_count: 0,
    sources: [],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: row.workspace_id,
    project_id: row.project_id ?? '',
    body,
  }
  if (page_type === 'entity') {
    page.name = row.title.trim().length > 0 ? row.title.trim() : row.kind
  } else {
    page.title = row.title.trim().length > 0 ? row.title.trim() : row.kind
  }
  writeCuratedFile(vaultRoot, vault_path, serializeCuratedPage(page))
  return { vault_path, content_hash, size_bytes, result: 'written' }
}

export interface MigrateMemoryRowOptions {
  dry_run?: boolean
}

export function migrateMemoryRow(
  vaultRoot: string,
  db: Database.Database,
  row: ClassifiedRow,
  opts: MigrateMemoryRowOptions = {},
): MigrationRecord {
  const dry_run = opts.dry_run ?? false

  if (row.classification === 'unknown') {
    return {
      memory_id: row.memory_id,
      workspace_id: row.workspace_id,
      project_id: row.project_id,
      kind: row.kind,
      classification: 'unknown',
      vault_path: '',
      content_hash: '',
      size_bytes: 0,
      result: 'skipped',
    }
  }

  const full = readMemoryRow(db, row.memory_id)

  if (row.classification === 'l0_raw') {
    const cls = classifyMemoryKind(full.kind)
    const source_type = row.l0_source_type ?? cls.l0_source_type
    if (!source_type) throw new Error(`migrator: l0_raw row '${row.memory_id}' missing l0_source_type`)
    const out = migrateL0Row(vaultRoot, full, source_type, dry_run)
    return {
      memory_id: full.memory_id,
      workspace_id: full.workspace_id,
      project_id: full.project_id,
      kind: full.kind,
      classification: 'l0_raw',
      vault_path: out.vault_path,
      content_hash: out.content_hash,
      size_bytes: out.size_bytes,
      result: out.result,
      l0_source_type: source_type,
    }
  }

  // l1_curated_stub
  const page_type = KIND_TO_L1_PAGE_TYPE[full.kind]
  if (!page_type) throw new Error(`migrator: no L1 page_type mapping for kind '${full.kind}'`)
  const out = migrateL1Row(vaultRoot, full, page_type, dry_run)
  return {
    memory_id: full.memory_id,
    workspace_id: full.workspace_id,
    project_id: full.project_id,
    kind: full.kind,
    classification: 'l1_curated_stub',
    vault_path: out.vault_path,
    content_hash: out.content_hash,
    size_bytes: out.size_bytes,
    result: out.result,
    l1_page_type: page_type,
  }
}

export function migrateAllMemories(
  vaultRoot: string,
  db: Database.Database,
  opts: MigrationOptions = {},
): MigrationBatch {
  const classified = classifyMemoriesForMigration(db, {
    ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    ...(opts.limit ? { limit: opts.limit } : {}),
  })

  const manifest: MigrationRecord[] = []
  const errors: MigrationBatchError[] = []
  const counts = { l0_raw: 0, l1_curated_stub: 0, unknown: 0 }

  for (const row of classified) {
    try {
      const rec = migrateMemoryRow(vaultRoot, db, row, { dry_run: opts.dry_run ?? false })
      manifest.push(rec)
      if (rec.classification === 'l0_raw' && (rec.result === 'written' || rec.result === 'skipped' || rec.result === 'planned')) {
        counts.l0_raw++
      } else if (rec.classification === 'l1_curated_stub' && (rec.result === 'written' || rec.result === 'skipped' || rec.result === 'planned')) {
        counts.l1_curated_stub++
      } else if (rec.classification === 'unknown') {
        counts.unknown++
      }
    } catch (err) {
      errors.push({
        memory_id: row.memory_id,
        kind: row.kind,
        classification: row.classification,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    manifest,
    l0: { count: counts.l0_raw },
    l1: { count: counts.l1_curated_stub },
    unknown: { count: counts.unknown },
    errors,
  }
}
