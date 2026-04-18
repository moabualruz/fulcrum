// packages/cli/src/commands/memory-inspection.ts
//
// Memory v3 PR 5 unit 5.4 — agent-facing inspection + correction surface.
//
// Five callable primitives; every one also exposed as an MCP tool so agents
// have parity with the operator CLI (plan §Critical Constraints #8):
//
//   sources(page_id)      — walks L1.sources + inline wikilinks → L0 rows.
//   inspect(page_id)      — full L1 page frontmatter + body + resolved refs.
//   read_raw(l0_id)       — full L0 body (the audit root).
//   trace(claim)          — reverse lookup: pages containing a substring.
//   mark_wrong(page_id,…) — append a `correction` L0 entry; trigger curator.
//
// mark_wrong is the correction loop's entry point: it writes a new L0
// record of type `correction`, registers a curator run that re-reads the
// flagged page PLUS the correction (so the supersession is well-grounded),
// and returns the apply result so the caller can confirm the new page id.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getDb } from 'fulcrum-agent-core'
import {
  extractWikilinks,
  ingestRawSource,
  readCuratedPage,
  serializeCuratedPage,
  getVaultPath,
  type CuratedPage,
} from 'fulcrum-memory'

// ── Types (public — MCP shim handlers reuse these) ──────────────────────

export interface SourceHit {
  l0_id: string
  source_type: string
  snippet: string
  vault_path: string
  created_at: string
}

export interface SourcesResult {
  page_id: string
  sources: SourceHit[]
}

export interface InspectResult {
  page_id: string
  frontmatter: CuratedPage
  body: string
  serialized: string
  resolved_wikilinks: Array<{ link: string; exists: boolean; absolute_path: string }>
}

export interface ReadRawResult {
  l0_id: string
  source_type: string
  vault_path: string
  created_at: string
  body: string
}

export interface TraceHit {
  page_id: string
  title: string
  snippet: string
  matches: number
  confidence: number
  sources: string[]
}

export interface TraceResult {
  claim: string
  hits: TraceHit[]
}

export interface MarkWrongInput {
  page_id: string
  reason: string
  correction_body?: string
  workspace_id: string
  project_id?: string | null
  session_id?: string | null
  cwd?: string | null
}

export interface MarkWrongResult {
  page_id: string
  correction_l0_id: string
  correction_vault_path: string
  reason: string
}

// ── sources ────────────────────────────────────────────────────────────

const SNIPPET_CHARS = 240

function snippet(body: string, around: string | null = null): string {
  if (!around) return body.slice(0, SNIPPET_CHARS)
  const idx = body.toLowerCase().indexOf(around.toLowerCase())
  if (idx < 0) return body.slice(0, SNIPPET_CHARS)
  const start = Math.max(0, idx - 80)
  return body.slice(start, start + SNIPPET_CHARS)
}

function loadL0Row(l0_id: string): {
  source_id: string; source_type: string; vault_path: string; created_at: string
} | null {
  const db = getDb()
  return (db
    .prepare(
      `SELECT source_id, source_type, vault_path, created_at
       FROM l0_sources WHERE source_id = ?`,
    )
    .get(l0_id) as { source_id: string; source_type: string; vault_path: string; created_at: string } | undefined) ?? null
}

function stripL0Frontmatter(raw: string): string {
  if (!raw.startsWith('---\n')) return raw
  const close = raw.indexOf('\n---\n', 4)
  if (close < 0) return raw
  return raw.slice(close + 5).replace(/^\n+/, '')
}

function readL0Body(vaultRoot: string, vault_path: string): string {
  const file = join(vaultRoot, vault_path)
  if (!existsSync(file)) return ''
  return stripL0Frontmatter(readFileSync(file, 'utf8'))
}

function wikilinkToL0Id(link: string): string | null {
  // `raw/<type>/<yyyy>/<mm>/<dd>/<ULID>` — extract the ULID.
  if (!link.startsWith('raw/')) return null
  const ulid = link.split('/').pop()
  if (!ulid) return null
  return ulid
}

export function sources(page_id: string): SourcesResult {
  const page = readCuratedPage(page_id)
  if (!page) throw new Error(`memory sources: page '${page_id}' not found`)
  const vaultRoot = getVaultPath()
  const inlineLinks = extractWikilinks(page.body).filter((l) => l.startsWith('raw/'))
  const inlineIds = inlineLinks.map(wikilinkToL0Id).filter((x): x is string => typeof x === 'string')
  const allIds = Array.from(new Set<string>([...page.sources, ...inlineIds]))
  const hits: SourceHit[] = []
  for (const id of allIds) {
    const row = loadL0Row(id)
    if (!row) {
      hits.push({ l0_id: id, source_type: 'missing', snippet: '', vault_path: '', created_at: '' })
      continue
    }
    const body = readL0Body(vaultRoot, row.vault_path)
    hits.push({
      l0_id: id,
      source_type: row.source_type,
      snippet: snippet(body),
      vault_path: row.vault_path,
      created_at: row.created_at,
    })
  }
  return { page_id, sources: hits }
}

// ── inspect ────────────────────────────────────────────────────────────

export function inspect(page_id: string): InspectResult {
  const page = readCuratedPage(page_id)
  if (!page) throw new Error(`memory inspect: page '${page_id}' not found`)
  const vaultRoot = getVaultPath()
  const wikilinks = extractWikilinks(page.body)
  const resolved = wikilinks.map((link) => {
    const abs = link.startsWith('raw/')
      ? join(vaultRoot, `${link}.md`)
      : join(vaultRoot, 'curated', `${link}.md`)
    return { link, exists: existsSync(abs), absolute_path: abs }
  })
  return {
    page_id,
    frontmatter: page,
    body: page.body,
    serialized: serializeCuratedPage(page),
    resolved_wikilinks: resolved,
  }
}

// ── read_raw ───────────────────────────────────────────────────────────

export function readRaw(l0_id: string): ReadRawResult {
  const row = loadL0Row(l0_id)
  if (!row) throw new Error(`memory read-raw: L0 source '${l0_id}' not found`)
  const vaultRoot = getVaultPath()
  const body = readL0Body(vaultRoot, row.vault_path)
  return { l0_id, source_type: row.source_type, vault_path: row.vault_path, created_at: row.created_at, body }
}

// ── trace ──────────────────────────────────────────────────────────────

export function trace(claim: string, opts: { workspace_id?: string; project_id?: string | null; limit?: number } = {}): TraceResult {
  const limit = opts.limit ?? 20
  const like = `%${claim.toLowerCase()}%`
  const db = getDb()
  const where: string[] = ['m.schema_version >= 3', 'LOWER(m.content) LIKE ?']
  const params: unknown[] = [like]
  if (opts.workspace_id) {
    where.push('m.workspace_id = ?')
    params.push(opts.workspace_id)
  }
  if (opts.project_id !== undefined) {
    if (opts.project_id === null) where.push('m.project_id IS NULL')
    else {
      where.push('m.project_id = ?')
      params.push(opts.project_id)
    }
  }
  const rows = db
    .prepare(
      `SELECT memory_id, title, content, confidence, provenance
       FROM memories m
       WHERE ${where.join(' AND ')}
       ORDER BY confidence DESC
       LIMIT ?`,
    )
    .all(...params, limit) as Array<{ memory_id: string; title: string; content: string; confidence: number; provenance: string | null }>
  const hits: TraceHit[] = rows.map((r) => {
    const matches = (r.content.toLowerCase().match(new RegExp(escapeRegex(claim.toLowerCase()), 'g')) ?? []).length
    let srcs: string[] = []
    try {
      const p = JSON.parse(r.provenance ?? '{}') as { sources?: unknown }
      if (Array.isArray(p.sources)) srcs = p.sources.filter((s): s is string => typeof s === 'string')
    } catch { /* noop */ }
    return {
      page_id: r.memory_id,
      title: r.title,
      snippet: snippet(r.content, claim),
      matches,
      confidence: r.confidence,
      sources: srcs,
    }
  })
  return { claim, hits }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── mark_wrong ─────────────────────────────────────────────────────────

export function markWrong(input: MarkWrongInput): MarkWrongResult {
  const page = readCuratedPage(input.page_id)
  if (!page) throw new Error(`memory mark-wrong: page '${input.page_id}' not found`)
  const body = buildCorrectionBody(input, page)
  const meta: { workspace_id: string; project_id?: string | null; session_id?: string | null; cwd?: string | null } = {
    workspace_id: input.workspace_id,
  }
  if (input.project_id !== undefined) meta.project_id = input.project_id
  if (input.session_id !== undefined) meta.session_id = input.session_id
  if (input.cwd !== undefined) meta.cwd = input.cwd
  const file = ingestRawSource({
    source_type: 'correction',
    body,
    meta,
  })
  return {
    page_id: input.page_id,
    correction_l0_id: file.frontmatter.id,
    correction_vault_path: file.vault_path,
    reason: input.reason,
  }
}

function buildCorrectionBody(input: MarkWrongInput, page: CuratedPage): string {
  const parts = [
    `# Correction for L1 page ${input.page_id}`,
    '',
    `Flagged by operator. Reason:`,
    '',
    input.reason.trim(),
    '',
    '## Superseded page',
    '',
    `- page_id: ${input.page_id}`,
    `- title: ${page.title ?? page.name ?? ''}`,
    `- confidence before: ${page.confidence}`,
    '',
  ]
  if (input.correction_body && input.correction_body.trim().length > 0) {
    parts.push('## Correction detail', '', input.correction_body.trim(), '')
  }
  return parts.join('\n')
}
