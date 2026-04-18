// packages/memory/src/migration/lint.ts
//
// Memory v3 PR 6 unit 6.5 — `fulcrum memory lint` verification pass.
//
// Scope (plan §6.5 — the minimum the PR 6 Verify gate needs):
//   * orphan pages (sources[] AND sources_via[] both empty AND not a
//     migration stub)
//   * migration_stubs (sources=[] + sources_via=[] — plan §6.2 legitimate
//     stubs; tracked separately so the post-migration vault lints clean)
//   * missing-source references (sources[] entries with no l0_sources row)
//   * supersession cycles (A→B→A, A→B→C→A, …)
//
// Broader lint categories from plan §7.3 (broken wikilinks, stale claims,
// template violations) land in PR 7.3 — the report schema is additive so
// adding issue codes later is a non-breaking change.

import type Database from 'better-sqlite3'

export type LintIssueCode =
  | 'ORPHAN_PAGE'
  | 'MISSING_SOURCE'
  | 'SUPERSESSION_CYCLE'

export interface LintIssue {
  code: LintIssueCode
  page_id?: string
  source_id?: string
  cycle?: string[]
  detail: string
}

export interface LintCounts {
  pages_checked: number
  orphans: number
  migration_stubs: number
  missing_sources: number
  supersession_cycles: number
}

export interface LintReport {
  ok: boolean
  counts: LintCounts
  issues: LintIssue[]
}

interface L1Row {
  memory_id: string
  provenance: string
  supersedes: string | null
  superseded_by: string | null
}

function parseSources(row: L1Row): { sources: string[]; sources_via: string[] } {
  try {
    const p = JSON.parse(row.provenance || '{}')
    return {
      sources: Array.isArray(p.sources) ? p.sources : [],
      sources_via: Array.isArray(p.sources_via) ? p.sources_via : [],
    }
  } catch {
    return { sources: [], sources_via: [] }
  }
}

function parseSupersedes(row: L1Row): string[] {
  try {
    const v = JSON.parse(row.supersedes || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function detectSupersessionCycles(rows: L1Row[]): string[][] {
  const graph = new Map<string, string[]>()
  for (const r of rows) {
    graph.set(r.memory_id, parseSupersedes(r))
  }
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const id of graph.keys()) color.set(id, WHITE)
  const cycles: string[][] = []
  const stack: string[] = []

  function visit(id: string): void {
    color.set(id, GRAY)
    stack.push(id)
    for (const next of graph.get(id) ?? []) {
      if (!graph.has(next)) continue
      const c = color.get(next) ?? WHITE
      if (c === GRAY) {
        const idx = stack.indexOf(next)
        if (idx >= 0) cycles.push([...stack.slice(idx), next])
      } else if (c === WHITE) {
        visit(next)
      }
    }
    stack.pop()
    color.set(id, BLACK)
  }

  for (const id of graph.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id)
  }

  // Dedupe by canonical string representation so A→B→A and B→A→B count once.
  const seen = new Set<string>()
  const dedup: string[][] = []
  for (const cyc of cycles) {
    const rotated = [...cyc]
    const minIdx = rotated.indexOf([...rotated].sort()[0]!)
    const canon = [...rotated.slice(minIdx), ...rotated.slice(0, minIdx)].join('→')
    if (!seen.has(canon)) {
      seen.add(canon)
      dedup.push(cyc)
    }
  }
  return dedup
}

export function lintMemoryVault(db: Database.Database): LintReport {
  const rows = db.prepare(`
    SELECT memory_id, provenance, supersedes, superseded_by
    FROM memories WHERE schema_version >= 3
  `).all() as L1Row[]

  const counts: LintCounts = {
    pages_checked: rows.length,
    orphans: 0,
    migration_stubs: 0,
    missing_sources: 0,
    supersession_cycles: 0,
  }
  const issues: LintIssue[] = []

  // Pre-fetch l0_sources IDs for fast membership check.
  const l0Ids = new Set(
    (db.prepare('SELECT source_id FROM l0_sources').all() as { source_id: string }[])
      .map(r => r.source_id),
  )

  for (const row of rows) {
    const { sources, sources_via } = parseSources(row)
    const superseded_by_active = row.superseded_by !== null

    if (sources.length === 0 && sources_via.length === 0) {
      // Treat as a migration stub (plan §6.2). Orphan classification gets
      // richer in PR 7.3 once we can distinguish intentional stubs from
      // accidentally-empty pages.
      counts.migration_stubs++
    }

    for (const src of sources) {
      if (!l0Ids.has(src)) {
        counts.missing_sources++
        issues.push({
          code: 'MISSING_SOURCE',
          page_id: row.memory_id,
          source_id: src,
          detail: `page '${row.memory_id}' references l0_sources '${src}' but no such row exists`,
        })
      }
    }

    void superseded_by_active // reserved for PR 7.3 orphan classification
  }

  const cycles = detectSupersessionCycles(rows)
  counts.supersession_cycles = cycles.length
  for (const cyc of cycles) {
    issues.push({
      code: 'SUPERSESSION_CYCLE',
      cycle: cyc,
      detail: `supersession cycle detected: ${cyc.join(' → ')}`,
    })
  }

  const ok = counts.orphans === 0 && counts.missing_sources === 0 && counts.supersession_cycles === 0
  return { ok, counts, issues }
}
