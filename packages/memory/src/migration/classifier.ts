// packages/memory/src/migration/classifier.ts
//
// Memory v3 PR 6 unit 6.1 — migration classifier.
//
// Maps each row in `memories` (schema_version < 3) to one of three migration
// tiers. The explicit lists come straight from the plan at §PR 6.1:
//
//   L0_raw:          bash_trace, file_patch, tool_trace, session_summary
//   L1_curated_stub: decision, identity, persona, concept, fact
//
// Unlisted kinds (pre_compact_extract, delegation_summary, v2b graph kinds,
// legacy v1 content kinds, etc.) classify as `unknown`. The migrator never
// touches unknown rows by default — an operator must review the dry-run
// report and opt in. That keeps the cutover strict to what the plan
// enumerates; unlisted rows stay as-is in `memories` with schema_version<3.
//
// `session_summary` is the one alias: plan lists it as an L0_raw kind, but
// packages/memory/src/l0/types.ts canonicalises on `session_transcript`.
// We emit `session_transcript` as the new source_type.

import type Database from 'better-sqlite3'
import type { L0SourceType } from '../l0/types.js'

export type MigrationClass = 'l0_raw' | 'l1_curated_stub' | 'unknown'

export interface MigrationClassification {
  classification: MigrationClass
  l0_source_type?: L0SourceType
}

export interface ClassifiedRow {
  memory_id: string
  workspace_id: string
  project_id: string | null
  kind: string
  content_length: number
  classification: MigrationClass
  l0_source_type?: L0SourceType
}

export interface MigrationClassifierReport {
  total: number
  by_class: Record<MigrationClass, number>
  by_kind: Record<string, { count: number; classification: MigrationClass }>
  unknown_kinds: string[]
}

// Direct kind → L0SourceType mapping. `session_summary` aliases to
// `session_transcript` because that's the canonical L0SourceType in
// l0/types.ts. Every other L0_raw kind is already a valid L0SourceType.
const L0_KIND_TO_SOURCE_TYPE: Record<string, L0SourceType> = {
  bash_trace: 'bash_trace',
  file_patch: 'file_patch',
  tool_trace: 'tool_trace',
  session_summary: 'session_transcript',
}

const L1_STUB_KINDS = new Set<string>([
  'decision',
  'identity',
  'persona',
  'concept',
  'fact',
])

export function classifyMemoryKind(kind: string): MigrationClassification {
  const l0 = L0_KIND_TO_SOURCE_TYPE[kind]
  if (l0) return { classification: 'l0_raw', l0_source_type: l0 }
  if (L1_STUB_KINDS.has(kind)) return { classification: 'l1_curated_stub' }
  return { classification: 'unknown' }
}

export interface ClassifyOptions {
  workspaceId?: string
  limit?: number
}

export function classifyMemoriesForMigration(
  db: Database.Database,
  opts: ClassifyOptions = {},
): ClassifiedRow[] {
  const where: string[] = ['(schema_version IS NULL OR schema_version < 3)']
  const params: unknown[] = []
  if (opts.workspaceId) {
    where.push('workspace_id = ?')
    params.push(opts.workspaceId)
  }
  const limitClause = opts.limit && opts.limit > 0 ? ` LIMIT ${Math.floor(opts.limit)}` : ''
  const sql = `
    SELECT memory_id, workspace_id, project_id, kind, LENGTH(content) AS content_length
    FROM memories
    WHERE ${where.join(' AND ')}
    ORDER BY rowid ASC${limitClause}
  `
  const rows = db.prepare(sql).all(...params) as {
    memory_id: string
    workspace_id: string
    project_id: string | null
    kind: string
    content_length: number
  }[]

  return rows.map((r) => {
    const c = classifyMemoryKind(r.kind)
    return {
      memory_id: r.memory_id,
      workspace_id: r.workspace_id,
      project_id: r.project_id,
      kind: r.kind,
      content_length: r.content_length,
      classification: c.classification,
      ...(c.l0_source_type ? { l0_source_type: c.l0_source_type } : {}),
    }
  })
}

export function buildClassifierReport(rows: ClassifiedRow[]): MigrationClassifierReport {
  const by_class: Record<MigrationClass, number> = { l0_raw: 0, l1_curated_stub: 0, unknown: 0 }
  const by_kind: Record<string, { count: number; classification: MigrationClass }> = {}
  const unknownSet = new Set<string>()

  for (const row of rows) {
    by_class[row.classification]++
    const slot = by_kind[row.kind]
    if (slot) slot.count++
    else by_kind[row.kind] = { count: 1, classification: row.classification }
    if (row.classification === 'unknown') unknownSet.add(row.kind)
  }

  return {
    total: rows.length,
    by_class,
    by_kind,
    unknown_kinds: [...unknownSet].sort(),
  }
}
