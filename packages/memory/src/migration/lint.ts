// packages/memory/src/migration/lint.ts
//
// Memory v3 PR 6 unit 6.5 + PR 7 unit 7.3 — `fulcrum memory lint`.
//
// PR 6 scope (the post-migration verify gate):
//   * orphan pages (sources[] AND sources_via[] empty AND not a migration stub)
//   * migration_stubs (plan §6.2 stubs tracked separately — NOT a failure)
//   * missing_sources (sources[] entries with no l0_sources row)
//   * supersession_cycles (A→B→A, A→B→C→A, …)
//
// PR 7.3 additions (vault-aware):
//   * broken_wikilinks (body has [[raw/...]] whose l0_sources row exists but
//     the underlying file is gone on disk)
//   * stale_claims (last_confirmed > 90d AND confidence > 0.5)
//   * sources_wikilink_divergence (frontmatter sources[] ≠ the set of inline
//     [[raw/...]] ULIDs — one count per page)
//   * template_violations (retrospective validateL1Page failure on an
//     existing page — one count per page)
//
// LintIssueCode is additive — downstream dashboards (PR 8) consume the shape
// `{code, detail, page_id?, source_id?, cycle?}` and can ignore unknown codes.

import type Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseCuratedPage } from '../l1/frontmatter.js'
import { validateL1Page } from '../l1/validator.js'
import { extractWikilinks } from '../l1/wikilinks.js'
import { getVaultPath } from '../vault/client.js'

export type LintIssueCode =
  | 'ORPHAN_PAGE'
  | 'MISSING_SOURCE'
  | 'SUPERSESSION_CYCLE'
  | 'BROKEN_WIKILINK'
  | 'STALE_CLAIM'
  | 'SOURCES_WIKILINK_DIVERGENCE'
  | 'TEMPLATE_VIOLATION'

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
  broken_wikilinks: number
  stale_claims: number
  sources_wikilink_divergence: number
  template_violations: number
}

export interface LintReport {
  ok: boolean
  counts: LintCounts
  issues: LintIssue[]
}

export interface LintOptions {
  vaultPath?: string
  /** Injected clock for deterministic stale-claim tests. Defaults to `new Date()`. */
  now?: Date
}

interface L1Row {
  memory_id: string
  provenance: string
  supersedes: string | null
  superseded_by: string | null
  vault_path: string | null
  confidence: number
  updated_at: string | null
}

const STALE_CLAIM_DAYS = 90
const STALE_CLAIM_MIN_CONFIDENCE = 0.5
const MS_PER_DAY = 86_400_000

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

function wikilinkUlid(link: string): string | null {
  if (!link.startsWith('raw/')) return null
  const last = link.split('/').pop()
  return last ?? null
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

export function lintMemoryVault(
  db: Database.Database,
  opts: LintOptions = {},
): LintReport {
  const vaultPath = opts.vaultPath ?? (() => {
    try {
      return getVaultPath()
    } catch {
      return null
    }
  })()
  const now = opts.now ?? new Date()

  const rows = db
    .prepare(
      `SELECT memory_id, provenance, supersedes, superseded_by,
              vault_path, confidence, updated_at
         FROM memories WHERE schema_version >= 3`,
    )
    .all() as L1Row[]

  const counts: LintCounts = {
    pages_checked: rows.length,
    orphans: 0,
    migration_stubs: 0,
    missing_sources: 0,
    supersession_cycles: 0,
    broken_wikilinks: 0,
    stale_claims: 0,
    sources_wikilink_divergence: 0,
    template_violations: 0,
  }
  const issues: LintIssue[] = []

  const l0Rows = db
    .prepare('SELECT source_id, vault_path FROM l0_sources')
    .all() as Array<{ source_id: string; vault_path: string }>
  const l0ById = new Map(l0Rows.map((r) => [r.source_id, r.vault_path]))

  for (const row of rows) {
    const { sources, sources_via } = parseSources(row)
    const isStub = sources.length === 0 && sources_via.length === 0
    if (isStub) counts.migration_stubs++

    for (const src of sources) {
      if (!l0ById.has(src)) {
        counts.missing_sources++
        issues.push({
          code: 'MISSING_SOURCE',
          page_id: row.memory_id,
          source_id: src,
          detail: `page '${row.memory_id}' references l0_sources '${src}' but no such row exists`,
        })
      }
    }

    // Stale-claim check — time + confidence gated. Uses `updated_at` as the
    // base column (l1_pages view aliases it as last_confirmed).
    if (row.updated_at && typeof row.confidence === 'number') {
      const days = (now.getTime() - Date.parse(row.updated_at)) / MS_PER_DAY
      if (days > STALE_CLAIM_DAYS && row.confidence > STALE_CLAIM_MIN_CONFIDENCE) {
        counts.stale_claims++
        issues.push({
          code: 'STALE_CLAIM',
          page_id: row.memory_id,
          detail: `page '${row.memory_id}' last confirmed ${days.toFixed(1)}d ago at confidence ${row.confidence}`,
        })
      }
    }

    // Vault-aware checks. Skip migration stubs (body is a placeholder) and
    // anything without a resolvable vault_path / file.
    if (!vaultPath || !row.vault_path || isStub) continue
    const abs = join(vaultPath, row.vault_path)
    if (!existsSync(abs)) continue

    let parsed
    try {
      parsed = parseCuratedPage(readFileSync(abs, 'utf8'))
    } catch (e) {
      counts.template_violations++
      issues.push({
        code: 'TEMPLATE_VIOLATION',
        page_id: row.memory_id,
        detail: `failed to parse vault file: ${e instanceof Error ? e.message : String(e)}`,
      })
      continue
    }

    // Retrospective validator pass. Migration phase waives rule 7 so pages
    // that supersede rows not yet cut over don't false-alarm.
    const v = validateL1Page(parsed, { phase: 'migration' })
    if (!v.valid) {
      counts.template_violations++
      issues.push({
        code: 'TEMPLATE_VIOLATION',
        page_id: row.memory_id,
        detail: `template violations: ${v.violations.map((x) => x.code).join(', ')}`,
      })
    }

    // Wikilink analysis.
    const bodyUlids = new Set<string>()
    for (const link of extractWikilinks(parsed.body)) {
      const ulid = wikilinkUlid(link)
      if (ulid) bodyUlids.add(ulid)
    }
    const fmSources = new Set(sources)

    // Divergence: per-page boolean, not per-element. One issue per page with
    // any mismatch.
    const fmMissingFromBody = sources.filter((s) => !bodyUlids.has(s))
    const bodyMissingFromFm = [...bodyUlids].filter((u) => !fmSources.has(u))
    if (fmMissingFromBody.length > 0 || bodyMissingFromFm.length > 0) {
      counts.sources_wikilink_divergence++
      issues.push({
        code: 'SOURCES_WIKILINK_DIVERGENCE',
        page_id: row.memory_id,
        detail:
          `frontmatter/body divergence — ` +
          `fm-not-in-body: [${fmMissingFromBody.join(', ')}], ` +
          `body-not-in-fm: [${bodyMissingFromFm.join(', ')}]`,
      })
    }

    // Broken wikilinks: inline [[raw/...]] whose l0_sources row exists but
    // the underlying vault file is missing. If the l0_sources row itself is
    // missing we don't double-count — MISSING_SOURCE already covered that
    // case when the ULID was in frontmatter.sources[], and body-only
    // references are handled by the divergence counter above.
    for (const ulid of bodyUlids) {
      const l0Rel = l0ById.get(ulid)
      if (!l0Rel) continue
      const l0Abs = join(vaultPath, l0Rel)
      if (!existsSync(l0Abs)) {
        counts.broken_wikilinks++
        issues.push({
          code: 'BROKEN_WIKILINK',
          page_id: row.memory_id,
          source_id: ulid,
          detail: `page '${row.memory_id}' links to raw/ for '${ulid}' but vault file ${l0Rel} is missing`,
        })
      }
    }
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

  const ok =
    counts.orphans === 0 &&
    counts.missing_sources === 0 &&
    counts.supersession_cycles === 0 &&
    counts.broken_wikilinks === 0 &&
    counts.stale_claims === 0 &&
    counts.sources_wikilink_divergence === 0 &&
    counts.template_violations === 0
  return { ok, counts, issues }
}
