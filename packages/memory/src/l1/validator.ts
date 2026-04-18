// packages/memory/src/l1/validator.ts
//
// Memory v3 PR 2 unit 2.3 — L1 page validator.
//
// Seven rules from the plan's §Guided templates + L0 traceability, plus one
// curator-batch allowlist (hard constraint #15). Every rule maps to a stable
// error code — this is a public surface, cited by curator output handling
// (PR 3), the retrospective lint pass (PR 7.3), and any external tooling.
//
// A stable violation shape: `{ code, field?, detail }`. `code` is the enum;
// `field` is the frontmatter key or body area; `detail` is a human-readable
// sentence. Adding a new code is non-breaking; changing an existing code IS
// breaking.

import { getDb } from 'fulcrum-agent-core'
import { entityExists } from './entities.js'
import { extractWikilinks } from './wikilinks.js'
import type { CuratedPage } from './frontmatter.js'

export type L1ViolationCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'CONFIDENCE_OUT_OF_RANGE'
  | 'SOURCES_REQUIRED'
  | 'WIKILINK_SOURCE_MISMATCH'
  | 'UNFILLED_PLACEHOLDER'
  | 'UNKNOWN_ENTITY'
  | 'SUPERSEDES_UNRESOLVED'
  | 'CURATOR_SOURCE_NOT_IN_BATCH'

export type L1Violation = {
  code: L1ViolationCode
  field?: string
  detail: string
}

export type L1ValidationResult = {
  valid: boolean
  violations: L1Violation[]
}

export type L1ValidationContext = {
  // 'migration' waives rule 7 (supersedes resolution) — pre-cutover pages can
  // supersede rows that haven't been bumped to schema_version 3 yet.
  // 'live' (default) enforces every rule.
  phase?: 'live' | 'migration'
  // When set, rule #15 rejects any sources[] entry not in this list.
  // Curator output handlers pass the L0 ULIDs they fed the model.
  curator_input_sources?: string[]
}

export class L1TemplateViolationError extends Error {
  readonly violations: L1Violation[]
  constructor(violations: L1Violation[]) {
    super(
      `L1 template violations (${violations.length}): ${violations
        .map((v) => `${v.code}${v.field ? ' @ ' + v.field : ''}`)
        .join(', ')}`,
    )
    this.name = 'L1TemplateViolationError'
    this.violations = violations
  }
}

const REQUIRED_FIELDS = [
  'id',
  'schema',
  'type',
  'confidence',
  'first_seen',
  'last_confirmed',
  'retention_tier',
  'access_count',
  'workspace_id',
  'project_id',
] as const

const PLACEHOLDER_TOKENS = /\b(TODO|FIXME|XXX)\b|\{\{[^}]+\}\}/

/**
 * Validate a CuratedPage against every v3 rule. Does not throw — returns a
 * result the caller inspects or rewraps as L1TemplateViolationError.
 */
export function validateL1Page(
  page: CuratedPage,
  ctx: L1ValidationContext = {},
): L1ValidationResult {
  const violations: L1Violation[] = []

  // Rule 1 — required frontmatter.
  for (const field of REQUIRED_FIELDS) {
    const value = (page as unknown as Record<string, unknown>)[field]
    if (value === undefined || value === null || value === '') {
      violations.push({
        code: 'MISSING_REQUIRED_FIELD',
        field,
        detail: `required field '${field}' is missing or empty`,
      })
    }
  }

  // Rule 2 — confidence ∈ [0.0, 1.0].
  if (
    typeof page.confidence !== 'number' ||
    !Number.isFinite(page.confidence) ||
    page.confidence < 0 ||
    page.confidence > 1
  ) {
    violations.push({
      code: 'CONFIDENCE_OUT_OF_RANGE',
      field: 'confidence',
      detail: `confidence must be in [0.0, 1.0], got ${page.confidence}`,
    })
  }

  // Rule 3 — type ∈ {entity, page, synthesis, concept}: sources[] non-empty,
  // OR for concept/synthesis sources_via[] non-empty.
  const hasSource = page.sources.length > 0 || page.sources_via.length > 0
  if (!hasSource) {
    violations.push({
      code: 'SOURCES_REQUIRED',
      field: 'sources',
      detail: `${page.type} page must have at least one source (sources[] or sources_via[])`,
    })
  }

  // Rule 4 — body contains ≥1 [[raw/...]] wikilink whose ULID matches a
  // sources[] entry. Only applies when sources[] is non-empty.
  if (page.sources.length > 0) {
    const links = extractWikilinks(page.body).filter((l) => l.startsWith('raw/'))
    const linkUlids = new Set(links.map((l) => l.split('/').pop()!))
    const anyMatch = page.sources.some((s) => linkUlids.has(s))
    if (!anyMatch) {
      violations.push({
        code: 'WIKILINK_SOURCE_MISMATCH',
        field: 'body',
        detail: `body has no [[raw/...]] wikilink matching any frontmatter sources[] entry`,
      })
    }
  }

  // Rule 5 — no placeholder tokens (TODO/FIXME/XXX/{{...}}) left anywhere.
  const textSlices: [string, string][] = [
    ['body', page.body],
    ['name', page.name ?? ''],
    ['title', page.title ?? ''],
  ]
  for (const [field, slice] of textSlices) {
    if (PLACEHOLDER_TOKENS.test(slice)) {
      violations.push({
        code: 'UNFILLED_PLACEHOLDER',
        field,
        detail: `${field} still contains an unfilled placeholder token`,
      })
    }
  }

  // Rule 6 — every entities[] ULID exists in graph_entities.
  for (const ent of page.entities) {
    if (!entityExists(ent)) {
      violations.push({
        code: 'UNKNOWN_ENTITY',
        field: 'entities',
        detail: `entity '${ent}' not found in graph_entities`,
      })
    }
  }

  // Rule 7 — every supersedes[] page_id resolves to a v3 page. Waived in
  // migration phase.
  if (ctx.phase !== 'migration' && page.supersedes.length > 0) {
    const db = getDb()
    for (const sup of page.supersedes) {
      const row = db
        .prepare(
          `SELECT 1 FROM memories WHERE memory_id = ? AND schema_version >= 3`,
        )
        .get(sup)
      if (!row) {
        violations.push({
          code: 'SUPERSEDES_UNRESOLVED',
          field: 'supersedes',
          detail: `supersedes target '${sup}' not found in l1_pages (schema_version >= 3)`,
        })
      }
    }
  }

  // Constraint #15 — curator sources must live in the current batch.
  if (ctx.curator_input_sources !== undefined) {
    const allowed = new Set(ctx.curator_input_sources)
    for (const src of page.sources) {
      if (!allowed.has(src)) {
        violations.push({
          code: 'CURATOR_SOURCE_NOT_IN_BATCH',
          field: 'sources',
          detail: `sources entry '${src}' was not in the curator's input batch`,
        })
      }
    }
  }

  return { valid: violations.length === 0, violations }
}
