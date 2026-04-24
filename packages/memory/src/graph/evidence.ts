import { getDb, newId } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { pathFingerprintForRoadmap, redactRagDetails, redactRoadmapArtifact } from '../setup/rag-redaction.js'

export type GraphEvidenceKind = 'entity' | 'edge' | 'summary'
export type GraphEvidenceDomain =
  | 'memory'
  | 'task'
  | 'decision'
  | 'error'
  | 'fix'
  | 'file'
  | 'symbol'
  | 'import'
  | 'call'

export type GraphEvidenceFreshness = 'current' | 'stale' | 'failed' | 'unknown'

export type GraphEvidenceSourceDomain =
  | GraphEvidenceDomain
  | 'file_chunk'
  | 'code_chunk'
  | 'graph_entity'
  | 'graph_edge'

export interface GraphEvidenceSourceRef {
  source_domain?: GraphEvidenceSourceDomain
  source_id?: string
  project_id?: string
  content_hash?: string
  file_path?: string
  path_fingerprint?: string
  line_start?: number
  line_end?: number
  symbol_path?: string
  task_id?: string
  run_id?: string
  graph_id?: string
}

export interface GraphEvidenceUnit {
  graph_unit_id: string
  kind: GraphEvidenceKind
  domain: GraphEvidenceDomain
  relationship_type: string
  source_refs: GraphEvidenceSourceRef[]
  confidence: number
  freshness: GraphEvidenceFreshness
  from_id?: string
  to_id?: string
  summary_id?: string
  name?: string
  summary?: string
  properties: Record<string, unknown>
}

export interface PersistGraphEvidenceUnitInput {
  workspace_id: string
  project_id: string
  kind: GraphEvidenceKind
  domain: GraphEvidenceDomain
  relationship_type: string
  source_refs?: GraphEvidenceSourceRef[]
  confidence?: number
  freshness?: GraphEvidenceFreshness
  name?: string
  summary?: string
  from_id?: string
  to_id?: string
  summary_id?: string
  properties?: Record<string, unknown>
}

function nowIso(): string {
  return new Date().toISOString()
}

function columnExists(db: Db, table: string, column: string): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return cols.some(col => col.name === column)
  } catch {
    return false
  }
}

function objectExists(db: Db, name: string): boolean {
  try {
    const row = db.prepare(`
      SELECT name FROM sqlite_master
       WHERE name = ? AND type IN ('table', 'view')
    `).get(name) as { name: string } | undefined
    return Boolean(row)
  } catch {
    return false
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || value.length === 0) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeSourceRef(ref: GraphEvidenceSourceRef): GraphEvidenceSourceRef {
  const normalized: GraphEvidenceSourceRef = { ...ref }
  if (normalized.file_path?.startsWith('/')) {
    normalized.path_fingerprint = normalized.path_fingerprint ?? pathFingerprintForRoadmap(normalized.file_path)
    delete normalized.file_path
  }
  return redactRoadmapArtifact(redactRagDetails(normalized))
}

function normalizeSourceRefs(refs: GraphEvidenceSourceRef[] | undefined): GraphEvidenceSourceRef[] {
  return (refs ?? []).map(normalizeSourceRef)
}

function sourceIds(refs: GraphEvidenceSourceRef[]): string[] {
  return Array.from(new Set(refs.map(ref => ref.source_id).filter((id): id is string => Boolean(id))))
}

function sourceIdentity(refs: GraphEvidenceSourceRef[]): string {
  return refs
    .map(ref => [
      ref.project_id ?? '',
      ref.source_domain ?? '',
      ref.source_id ?? '',
      ref.task_id ?? '',
      ref.run_id ?? '',
      ref.graph_id ?? '',
      ref.path_fingerprint ?? ref.file_path ?? '',
      ref.symbol_path ?? '',
      ref.line_start ?? '',
      ref.line_end ?? '',
    ].join(':'))
    .sort()
    .join('|')
}

function sourceRefIdentity(ref: GraphEvidenceSourceRef): string {
  return [
    ref.project_id ?? '',
    ref.source_domain ?? '',
    ref.source_id ?? '',
    ref.task_id ?? '',
    ref.run_id ?? '',
    ref.graph_id ?? '',
    ref.path_fingerprint ?? ref.file_path ?? '',
    ref.symbol_path ?? '',
    ref.line_start ?? '',
    ref.line_end ?? '',
  ].join(':')
}

function evidenceIdentity(input: PersistGraphEvidenceUnitInput, refs: GraphEvidenceSourceRef[]): string {
  return [
    input.project_id,
    input.kind,
    input.domain,
    input.relationship_type,
    input.summary_id ?? '',
    sourceIdentity(refs) || safeName(input),
  ].join('|')
}

function graphProperties(input: PersistGraphEvidenceUnitInput, source_refs: GraphEvidenceSourceRef[]): Record<string, unknown> {
  return redactRoadmapArtifact(redactRagDetails({
    ...(input.properties ?? {}),
    graph_evidence: true,
    kind: input.kind,
    domain: input.domain,
    relationship_type: input.relationship_type,
    source_refs,
    source_ids: sourceIds(source_refs),
    confidence: input.confidence ?? 1,
    freshness: input.freshness ?? 'current',
    summary_id: input.summary_id,
    summary: input.summary,
    project_id: input.project_id,
    source_identity: evidenceIdentity(input, source_refs),
  }))
}

function safeName(input: PersistGraphEvidenceUnitInput): string {
  const raw = input.name ?? input.summary ?? input.summary_id ?? input.relationship_type
  const redacted = redactRoadmapArtifact(redactRagDetails(raw))
  return typeof redacted === 'string' && redacted.length > 0 ? redacted : input.relationship_type
}

function entityType(input: PersistGraphEvidenceUnitInput): string {
  return input.kind === 'summary' ? 'summary' : input.domain
}

function updateExistingEntity(
  input: PersistGraphEvidenceUnitInput,
  existing: { entity_id: string; confidence?: number },
  properties: Record<string, unknown>,
  db: Db,
): string {
  const assignments = ['name = ?', 'properties = ?', 'updated_at = ?']
  const params: unknown[] = [safeName(input), JSON.stringify(properties), nowIso()]
  if (columnExists(db, 'graph_entities', 'confidence')) {
    assignments.push('confidence = ?')
    params.push(Math.max(Number(existing.confidence ?? 0), input.confidence ?? 1))
  }
  if (columnExists(db, 'graph_entities', 'last_confirmed')) {
    assignments.push('last_confirmed = ?')
    params.push(nowIso())
  }
  params.push(existing.entity_id)
  db.prepare(`UPDATE graph_entities SET ${assignments.join(', ')} WHERE entity_id = ?`).run(...params)
  return existing.entity_id
}

function insertEntity(input: PersistGraphEvidenceUnitInput, properties: Record<string, unknown>, db: Db): string {
  const entity_id = newId('graph_entity')
  const columns = ['entity_id', 'workspace_id', 'name', 'entity_type', 'properties', 'created_at', 'updated_at']
  const values: unknown[] = [entity_id, input.workspace_id, safeName(input), entityType(input), JSON.stringify(properties), nowIso(), nowIso()]
  if (columnExists(db, 'graph_entities', 'aliases')) {
    columns.push('aliases')
    values.push(null)
  }
  if (columnExists(db, 'graph_entities', 'confidence')) {
    columns.push('confidence')
    values.push(input.confidence ?? 1)
  }
  if (columnExists(db, 'graph_entities', 'first_seen')) {
    columns.push('first_seen')
    values.push(nowIso())
  }
  if (columnExists(db, 'graph_entities', 'last_confirmed')) {
    columns.push('last_confirmed')
    values.push(nowIso())
  }
  db.prepare(`
    INSERT INTO graph_entities (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
  `).run(...values)
  return entity_id
}

function entityEvidenceKey(properties: Record<string, unknown>): string {
  const identity = properties['source_identity']
  if (typeof identity === 'string' && identity.length > 0) return identity
  return JSON.stringify([
    properties['project_id'] ?? '',
    properties['kind'] ?? '',
    properties['domain'] ?? '',
    properties['relationship_type'] ?? '',
    properties['summary_id'] ?? '',
    parseJsonArray(properties['source_ids']).map(String).sort(),
  ])
}

type EntityCacheEntry = { entity_id: string; confidence?: number }
type EdgeCacheEntry = { edge_id: string; properties?: string; confidence?: number }

const entityEvidenceCaches = new WeakMap<Db, Map<string, Map<string, EntityCacheEntry>>>()
const edgeEvidenceCaches = new WeakMap<Db, Map<string, Map<string, EdgeCacheEntry>>>()

export function clearGraphEvidenceCaches(db: Db): void {
  entityEvidenceCaches.delete(db)
  edgeEvidenceCaches.delete(db)
}

function entityCacheFor(db: Db, workspace_id: string, entity_type: string): Map<string, EntityCacheEntry> {
  let dbCache = entityEvidenceCaches.get(db)
  if (!dbCache) {
    dbCache = new Map()
    entityEvidenceCaches.set(db, dbCache)
  }
  const scopeKey = `${workspace_id}\0${entity_type}`
  let cache = dbCache.get(scopeKey)
  if (cache) return cache

  cache = new Map()
  const rows = db.prepare(`
    SELECT entity_id, properties${columnExists(db, 'graph_entities', 'confidence') ? ', confidence' : ''}
      FROM graph_entities
     WHERE workspace_id = ? AND entity_type = ?
  `).all(workspace_id, entity_type) as Array<{ entity_id: string; properties: string; confidence?: number }>
  for (const row of rows) {
    cache.set(entityEvidenceKey(parseJsonObject(row.properties)), {
      entity_id: row.entity_id,
      confidence: row.confidence,
    })
  }
  dbCache.set(scopeKey, cache)
  return cache
}

function edgeEvidenceKey(input: PersistGraphEvidenceUnitInput): string {
  return `${input.workspace_id}\0${input.from_id ?? ''}\0${input.to_id ?? ''}\0${input.relationship_type}`
}

function edgeCacheFor(db: Db, workspace_id: string): Map<string, EdgeCacheEntry> {
  let dbCache = edgeEvidenceCaches.get(db)
  if (!dbCache) {
    dbCache = new Map()
    edgeEvidenceCaches.set(db, dbCache)
  }
  let cache = dbCache.get(workspace_id)
  if (cache) return cache

  cache = new Map()
  const rows = db.prepare(`
    SELECT edge_id, source_id, target_id, relation, properties${columnExists(db, 'graph_edges', 'confidence') ? ', confidence' : ''}
      FROM graph_edges
     WHERE workspace_id = ?
  `).all(workspace_id) as Array<{ edge_id: string; source_id: string; target_id: string; relation: string; properties?: string; confidence?: number }>
  for (const row of rows) {
    cache.set(`${workspace_id}\0${row.source_id}\0${row.target_id}\0${row.relation}`, {
      edge_id: row.edge_id,
      properties: row.properties,
      confidence: row.confidence,
    })
  }
  dbCache.set(workspace_id, cache)
  return cache
}

function persistEntity(input: PersistGraphEvidenceUnitInput, properties: Record<string, unknown>, db: Db): string {
  const type = entityType(input)
  const cache = entityCacheFor(db, input.workspace_id, type)
  const key = entityEvidenceKey(properties)
  const existing = cache.get(key)
  if (existing) {
    const entity_id = updateExistingEntity(input, existing, properties, db)
    cache.set(key, { entity_id, confidence: Math.max(Number(existing.confidence ?? 0), input.confidence ?? 1) })
    return entity_id
  }
  const entity_id = insertEntity(input, properties, db)
  cache.set(key, { entity_id, confidence: input.confidence ?? 1 })
  return entity_id
}

function updateExistingEdge(
  input: PersistGraphEvidenceUnitInput,
  existing: { edge_id: string; properties?: string; confidence?: number },
  properties: Record<string, unknown>,
  source_refs: GraphEvidenceSourceRef[],
  db: Db,
): EdgeCacheEntry {
  const mergedSourceRefs = mergeSourceRefs(sourceRefsFromProperties(parseJsonObject(existing.properties)), source_refs)
  const mergedProperties = {
    ...properties,
    source_refs: mergedSourceRefs,
    source_ids: sourceIds(mergedSourceRefs),
  }
  const assignments = ['properties = ?', 'weight = ?']
  const params: unknown[] = [JSON.stringify(mergedProperties), input.confidence ?? 1]
  if (columnExists(db, 'graph_edges', 'confidence')) {
    assignments.push('confidence = ?')
    params.push(Math.max(Number(existing.confidence ?? 0), input.confidence ?? 1))
  }
  if (columnExists(db, 'graph_edges', 'source_ids')) {
    assignments.push('source_ids = ?')
    params.push(JSON.stringify(sourceIds(mergedSourceRefs)))
  }
  params.push(existing.edge_id)
  db.prepare(`UPDATE graph_edges SET ${assignments.join(', ')} WHERE edge_id = ?`).run(...params)
  return {
    edge_id: existing.edge_id,
    properties: JSON.stringify(mergedProperties),
    confidence: Math.max(Number(existing.confidence ?? 0), input.confidence ?? 1),
  }
}

function insertEdge(
  input: PersistGraphEvidenceUnitInput,
  properties: Record<string, unknown>,
  source_refs: GraphEvidenceSourceRef[],
  db: Db,
): string {
  if (!input.from_id || !input.to_id) throw new Error('persistGraphEvidenceUnit edge requires from_id and to_id')
  const edge_id = newId('graph_edge')
  const columns = ['edge_id', 'workspace_id', 'source_id', 'target_id', 'relation', 'weight', 'properties', 'created_at']
  const values: unknown[] = [
    edge_id,
    input.workspace_id,
    input.from_id,
    input.to_id,
    input.relationship_type,
    input.confidence ?? 1,
    JSON.stringify(properties),
    nowIso(),
  ]
  if (columnExists(db, 'graph_edges', 'confidence')) {
    columns.push('confidence')
    values.push(input.confidence ?? 1)
  }
  if (columnExists(db, 'graph_edges', 'source_ids')) {
    columns.push('source_ids')
    values.push(JSON.stringify(sourceIds(source_refs)))
  }
  db.prepare(`
    INSERT INTO graph_edges (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
  `).run(...values)
  return edge_id
}

function persistEdge(
  input: PersistGraphEvidenceUnitInput,
  properties: Record<string, unknown>,
  source_refs: GraphEvidenceSourceRef[],
  db: Db,
): string {
  if (!input.from_id || !input.to_id) throw new Error('persistGraphEvidenceUnit edge requires from_id and to_id')
  const cache = edgeCacheFor(db, input.workspace_id)
  const key = edgeEvidenceKey(input)
  const existing = cache.get(key)
  if (existing) {
    const updated = updateExistingEdge(input, existing, properties, source_refs, db)
    cache.set(key, updated)
    return updated.edge_id
  }
  const edge_id = insertEdge(input, properties, source_refs, db)
  cache.set(key, { edge_id, properties: JSON.stringify(properties), confidence: input.confidence ?? 1 })
  return edge_id
}

function mergeSourceRefs(existing: GraphEvidenceSourceRef[], next: GraphEvidenceSourceRef[]): GraphEvidenceSourceRef[] {
  const refs = new Map<string, GraphEvidenceSourceRef>()
  for (const ref of existing) refs.set(sourceRefIdentity(ref), ref)
  for (const ref of next) refs.set(sourceRefIdentity(ref), ref)
  return Array.from(refs.values())
}

export function persistGraphEvidenceUnit(input: PersistGraphEvidenceUnitInput, db: Db = getDb()): GraphEvidenceUnit {
  const source_refs = normalizeSourceRefs(input.source_refs)
  const properties = graphProperties(input, source_refs)
  const graph_unit_id = input.kind === 'edge'
    ? persistEdge(input, properties, source_refs, db)
    : persistEntity(input, properties, db)

  return {
    graph_unit_id,
    kind: input.kind,
    domain: input.domain,
    relationship_type: input.relationship_type,
    source_refs,
    confidence: input.confidence ?? 1,
    freshness: input.freshness ?? 'current',
    ...(input.from_id ? { from_id: input.from_id } : {}),
    ...(input.to_id ? { to_id: input.to_id } : {}),
    ...(input.summary_id ? { summary_id: input.summary_id } : {}),
    ...(input.name ? { name: safeName(input) } : {}),
    ...(input.summary ? { summary: redactRoadmapArtifact(redactRagDetails(input.summary)) } : {}),
    properties,
  }
}

function sourceHashForRef(ref: GraphEvidenceSourceRef, workspace_id: string, db: Db): string | null {
  if (!ref.source_id && !ref.file_path) return null
  const project_id = ref.project_id ?? null
  const domain = ref.source_domain
  try {
    if (domain === 'memory' || domain === 'decision' || domain === 'error' || domain === 'fix') {
      const row = db.prepare(`
        SELECT content_hash
          FROM memories
         WHERE workspace_id = ?
           AND memory_id = ?
           AND (? IS NULL OR project_id = ? OR project_id IS NULL)
      `).get(workspace_id, ref.source_id, project_id, project_id) as { content_hash: string | null } | undefined
      return row?.content_hash ?? null
    }
    if (domain === 'task') {
      const row = db.prepare(`
        SELECT updated_at AS content_hash
          FROM tasks
         WHERE workspace_id = ? AND task_id = ? AND (? IS NULL OR project_id = ?)
      `).get(workspace_id, ref.source_id, project_id, project_id) as { content_hash: string | null } | undefined
      return row?.content_hash ?? null
    }
    if (domain === 'file') {
      const row = db.prepare(`
        SELECT sha256 AS content_hash
          FROM code_files
         WHERE workspace_id = ?
           AND (? IS NULL OR project_id = ?)
           AND (file_id = ? OR rel_path = ?)
      `).get(workspace_id, project_id, project_id, ref.source_id, ref.file_path) as { content_hash: string | null } | undefined
      return row?.content_hash ?? null
    }
    if (domain === 'code_chunk' || domain === 'file_chunk' || domain === 'symbol' || domain === 'import' || domain === 'call') {
      const row = db.prepare(`
        SELECT content_hash
          FROM code_chunks
         WHERE workspace_id = ?
           AND (? IS NULL OR project_id = ?)
           AND chunk_id = ?
      `).get(workspace_id, project_id, project_id, ref.source_id) as { content_hash: string | null } | undefined
      return row?.content_hash ?? null
    }
  } catch {
    return null
  }
  return null
}

function sourceExistsForRef(ref: GraphEvidenceSourceRef, workspace_id: string, db: Db): boolean | null {
  if (!ref.source_id && !ref.file_path) return null
  const project_id = ref.project_id ?? null
  const domain = ref.source_domain
  try {
    if (domain === 'memory' || domain === 'decision' || domain === 'error' || domain === 'fix') {
      const row = db.prepare(`
        SELECT 1
          FROM memories
         WHERE workspace_id = ?
           AND memory_id = ?
           AND (? IS NULL OR project_id = ? OR project_id IS NULL)
         LIMIT 1
      `).get(workspace_id, ref.source_id, project_id, project_id)
      return Boolean(row)
    }
    if (domain === 'task') {
      const row = db.prepare(`
        SELECT 1
          FROM tasks
         WHERE workspace_id = ? AND task_id = ? AND (? IS NULL OR project_id = ?)
         LIMIT 1
      `).get(workspace_id, ref.source_id, project_id, project_id)
      return Boolean(row)
    }
    if (domain === 'file') {
      const row = db.prepare(`
        SELECT 1
          FROM code_files
         WHERE workspace_id = ?
           AND (? IS NULL OR project_id = ?)
           AND (file_id = ? OR rel_path = ?)
         LIMIT 1
      `).get(workspace_id, project_id, project_id, ref.source_id, ref.file_path)
      return Boolean(row)
    }
    if (domain === 'code_chunk' || domain === 'file_chunk' || domain === 'symbol' || domain === 'import' || domain === 'call') {
      const row = db.prepare(`
        SELECT 1
          FROM code_chunks
         WHERE workspace_id = ?
           AND (? IS NULL OR project_id = ?)
           AND chunk_id = ?
         LIMIT 1
      `).get(workspace_id, project_id, project_id, ref.source_id)
      return Boolean(row)
    }
  } catch {
    return null
  }
  return null
}

function computedFreshness(
  workspace_id: string,
  declared: GraphEvidenceFreshness,
  source_refs: GraphEvidenceSourceRef[],
  db: Db,
): GraphEvidenceFreshness {
  if (declared === 'failed') return 'failed'
  if (!source_refs.length) return declared

  let checked = false
  for (const ref of source_refs) {
    if (!ref.content_hash) {
      if ((ref.source_id || ref.file_path) && sourceExistsForRef(ref, workspace_id, db) === false) return 'failed'
      continue
    }
    checked = true
    const currentHash = sourceHashForRef(ref, workspace_id, db)
    if (!currentHash) return 'failed'
    if (currentHash !== ref.content_hash) return 'stale'
  }
  return checked ? 'current' : declared
}

function sourceRefsFromProperties(properties: Record<string, unknown>): GraphEvidenceSourceRef[] {
  return parseJsonArray(properties['source_refs'])
    .filter((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object' && !Array.isArray(ref))
    .map(ref => normalizeSourceRef(ref as GraphEvidenceSourceRef))
}

function domainFromEntityType(entityType: string, properties: Record<string, unknown>): GraphEvidenceDomain {
  const value = properties['domain']
  if (typeof value === 'string' && isGraphEvidenceDomain(value)) return value
  return isGraphEvidenceDomain(entityType) ? entityType : 'memory'
}

function isGraphEvidenceDomain(value: string): value is GraphEvidenceDomain {
  return ['memory', 'task', 'decision', 'error', 'fix', 'file', 'symbol', 'import', 'call'].includes(value)
}

function confidenceFrom(row: Record<string, unknown>, properties: Record<string, unknown>): number {
  const direct = row['confidence']
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  const prop = properties['confidence']
  if (typeof prop === 'number' && Number.isFinite(prop)) return prop
  return 1
}

function declaredFreshness(properties: Record<string, unknown>): GraphEvidenceFreshness {
  const value = properties['freshness']
  return value === 'current' || value === 'stale' || value === 'failed' || value === 'unknown' ? value : 'unknown'
}

function selectGraphEntities(db: Db, workspace_id: string): Array<Record<string, unknown>> {
  const optional = [
    columnExists(db, 'graph_entities', 'confidence') ? 'confidence' : null,
    columnExists(db, 'graph_entities', 'last_confirmed') ? 'last_confirmed' : null,
  ].filter(Boolean).join(', ')
  return db.prepare(`
    SELECT entity_id, workspace_id, name, entity_type, properties, created_at, updated_at${optional ? `, ${optional}` : ''}
      FROM graph_entities
     WHERE workspace_id = ?
  `).all(workspace_id) as Array<Record<string, unknown>>
}

function selectGraphEdges(db: Db, workspace_id: string): Array<Record<string, unknown>> {
  const optional = [
    columnExists(db, 'graph_edges', 'confidence') ? 'confidence' : null,
    columnExists(db, 'graph_edges', 'source_ids') ? 'source_ids' : null,
  ].filter(Boolean).join(', ')
  return db.prepare(`
    SELECT edge_id, workspace_id, source_id, target_id, relation, weight, properties, created_at${optional ? `, ${optional}` : ''}
      FROM graph_edges
     WHERE workspace_id = ?
  `).all(workspace_id) as Array<Record<string, unknown>>
}

function projectMatches(unit: GraphEvidenceUnit, project_id: string): boolean {
  const propProject = unit.properties['project_id']
  if (typeof propProject === 'string') return propProject === project_id
  if (!unit.source_refs.length) return true
  return unit.source_refs.some(ref => !ref.project_id || ref.project_id === project_id)
}

export function readGraphEvidenceUnits(
  input: { workspace_id: string; project_id?: string },
  db: Db = getDb(),
): GraphEvidenceUnit[] {
  if (!objectExists(db, 'graph_entities') || !objectExists(db, 'graph_edges')) return []

  const entities = selectGraphEntities(db, input.workspace_id).map(row => {
    const properties = parseJsonObject(row['properties'])
    const source_refs = sourceRefsFromProperties(properties)
    const kind: GraphEvidenceKind = row['entity_type'] === 'summary' || properties['kind'] === 'summary' ? 'summary' : 'entity'
    const unit: GraphEvidenceUnit = redactRoadmapArtifact(redactRagDetails({
      graph_unit_id: String(row['entity_id']),
      kind,
      domain: domainFromEntityType(String(row['entity_type']), properties),
      relationship_type: typeof properties['relationship_type'] === 'string' ? properties['relationship_type'] : 'represents',
      source_refs,
      confidence: confidenceFrom(row, properties),
      freshness: computedFreshness(input.workspace_id, declaredFreshness(properties), source_refs, db),
      summary_id: typeof properties['summary_id'] === 'string' ? properties['summary_id'] : undefined,
      name: row['name'] === null || row['name'] === undefined ? undefined : String(row['name']),
      summary: typeof properties['summary'] === 'string' ? properties['summary'] : undefined,
      properties,
    }))
    return unit
  })

  const edges = selectGraphEdges(db, input.workspace_id).map(row => {
    const properties = parseJsonObject(row['properties'])
    const source_refs = sourceRefsFromProperties(properties)
    const relation = String(row['relation'])
    const unit: GraphEvidenceUnit = redactRoadmapArtifact(redactRagDetails({
      graph_unit_id: String(row['edge_id']),
      kind: 'edge' as const,
      domain: domainFromEntityType(relation, properties),
      relationship_type: typeof properties['relationship_type'] === 'string' ? properties['relationship_type'] : relation,
      source_refs,
      confidence: confidenceFrom(row, properties),
      freshness: computedFreshness(input.workspace_id, declaredFreshness(properties), source_refs, db),
      from_id: String(row['source_id']),
      to_id: String(row['target_id']),
      properties: {
        ...properties,
        source_ids: properties['source_ids'] ?? parseJsonArray(row['source_ids']),
      },
    }))
    return unit
  })

  const units = [...entities, ...edges]
  const evidenceUnits = units.filter(unit => unit.properties['graph_evidence'] === true)
  return input.project_id ? evidenceUnits.filter(unit => projectMatches(unit, input.project_id!)) : evidenceUnits
}
