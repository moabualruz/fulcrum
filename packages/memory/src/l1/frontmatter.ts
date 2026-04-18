// packages/memory/src/l1/frontmatter.ts
//
// Memory v3 PR 2 unit 2.6 — L1 page frontmatter serializer.
//
// Thin wrapper around gray-matter that round-trips the v3 CuratedPage shape.
// Shapes the empty-array vs undefined vs null handling so downstream consumers
// (validator unit 2.3, curator PR 3, CLI unit 2.7) never have to branch on
// "is this field missing or present-but-empty."

import matter from 'gray-matter'

export const L1_PAGE_TYPES = ['entity', 'concept', 'page', 'synthesis'] as const
export type L1PageType = (typeof L1_PAGE_TYPES)[number]

export const L1_RETENTION_TIERS = ['working', 'episodic', 'semantic', 'procedural'] as const
export type L1RetentionTier = (typeof L1_RETENTION_TIERS)[number]

export type CuratedPage = {
  id: string
  schema: 'fulcrum.memory/v3'
  type: L1PageType
  // entity pages use `name`; page/synthesis use `title`; either is allowed.
  name?: string
  title?: string
  // entity-only: library|person|project|file|symbol|decision|concept
  entity_type?: string
  aliases?: string[]
  confidence: number
  first_seen: string
  last_confirmed: string
  retention_tier: L1RetentionTier
  access_count: number
  sources: string[]        // L0 ULIDs
  sources_via: string[]    // L1 page IDs (synthesis)
  supersedes: string[]
  superseded_by: string | null
  entities: string[]
  workspace_id: string
  project_id: string
  // Primary L0 source — set on type:page. Optional on other types.
  source?: string
  body: string
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

/**
 * Serialize a `CuratedPage` into a gray-matter file string.
 * Empty list fields are emitted as `[]` (not omitted) so downstream parsers
 * see the key even when unused — simplifies validator rule 1.
 */
export function serializeCuratedPage(page: CuratedPage): string {
  const fm: Record<string, unknown> = {
    id: page.id,
    schema: page.schema,
    type: page.type,
  }
  if (page.entity_type !== undefined) fm['entity_type'] = page.entity_type
  if (page.name !== undefined) fm['name'] = page.name
  if (page.title !== undefined) fm['title'] = page.title
  if (page.aliases !== undefined) fm['aliases'] = page.aliases
  if (page.source !== undefined) fm['source'] = page.source
  fm['sources'] = page.sources
  fm['sources_via'] = page.sources_via
  fm['confidence'] = page.confidence
  fm['first_seen'] = page.first_seen
  fm['last_confirmed'] = page.last_confirmed
  fm['retention_tier'] = page.retention_tier
  fm['access_count'] = page.access_count
  fm['supersedes'] = page.supersedes
  fm['superseded_by'] = page.superseded_by
  fm['entities'] = page.entities
  fm['workspace_id'] = page.workspace_id
  fm['project_id'] = page.project_id

  return matter.stringify(page.body, fm)
}

/**
 * Parse a gray-matter file string into a `CuratedPage`. Throws if required
 * fields are missing or `type` is outside the v3 L1_PAGE_TYPES enum. Missing
 * optional list fields default to `[]`; missing `superseded_by` defaults to
 * `null`.
 */
export function parseCuratedPage(content: string): CuratedPage {
  const parsed = matter(content)
  const fm = parsed.data as Record<string, unknown>

  for (const field of REQUIRED_FIELDS) {
    if (fm[field] === undefined || fm[field] === null) {
      throw new Error(`parseCuratedPage: missing required field '${field}'`)
    }
  }

  const type = fm['type']
  if (typeof type !== 'string' || !(L1_PAGE_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `parseCuratedPage: invalid 'type' (got ${JSON.stringify(type)}); expected one of ${L1_PAGE_TYPES.join(', ')}`,
    )
  }
  const tier = fm['retention_tier']
  if (typeof tier !== 'string' || !(L1_RETENTION_TIERS as readonly string[]).includes(tier)) {
    throw new Error(
      `parseCuratedPage: invalid 'retention_tier' (got ${JSON.stringify(tier)}); expected one of ${L1_RETENTION_TIERS.join(', ')}`,
    )
  }

  const page: CuratedPage = {
    id: String(fm['id']),
    schema: 'fulcrum.memory/v3',
    type: type as L1PageType,
    confidence: Number(fm['confidence']),
    first_seen: String(fm['first_seen']),
    last_confirmed: String(fm['last_confirmed']),
    retention_tier: tier as L1RetentionTier,
    access_count: Number(fm['access_count']),
    sources: asStringArray(fm['sources']),
    sources_via: asStringArray(fm['sources_via']),
    supersedes: asStringArray(fm['supersedes']),
    superseded_by: fm['superseded_by'] === undefined || fm['superseded_by'] === null
      ? null
      : String(fm['superseded_by']),
    entities: asStringArray(fm['entities']),
    workspace_id: String(fm['workspace_id']),
    project_id: String(fm['project_id']),
    body: parsed.content.replace(/^\n+/, '').replace(/\n+$/, '\n'),
  }
  if (typeof fm['name'] === 'string') page.name = fm['name']
  if (typeof fm['title'] === 'string') page.title = fm['title']
  if (typeof fm['entity_type'] === 'string') page.entity_type = fm['entity_type']
  if (typeof fm['source'] === 'string') page.source = fm['source']
  if (Array.isArray(fm['aliases'])) page.aliases = fm['aliases'].map(String)
  return page
}

function asStringArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x))
}
