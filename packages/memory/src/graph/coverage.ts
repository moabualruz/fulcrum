import { getDb, newId } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import {
  persistGraphEvidenceUnit,
  readGraphEvidenceUnits,
  type GraphEvidenceDomain,
  type GraphEvidenceSourceRef,
  type GraphEvidenceUnit,
} from './evidence.js'

export interface GraphCoverageDomainSummary {
  domain: GraphEvidenceDomain
  sources: number
  current: number
  stale: number
  failed: number
  skipped: number
  graph_entities: number
  graph_edges: number
  status: 'current' | 'stale' | 'failed' | 'skipped'
}

export interface GraphCoverageReport {
  workspace_id: string
  project_id: string
  rebuilt_at: string
  domains: Record<GraphEvidenceDomain, GraphCoverageDomainSummary>
  totals: {
    sources: number
    current: number
    stale: number
    failed: number
    skipped: number
    graph_entities: number
    graph_edges: number
  }
  evidence_units: GraphEvidenceUnit[]
}

interface CoverageSource {
  domain: GraphEvidenceDomain
  source_id: string
  source_domain: GraphEvidenceSourceRef['source_domain']
  name: string
  content_hash?: string | null
  file_path?: string
  line_start?: number
  line_end?: number
  symbol_path?: string
  task_id?: string
  content?: string
  source_ref?: GraphEvidenceSourceRef
}

const GRAPH_DOMAINS: GraphEvidenceDomain[] = ['memory', 'task', 'decision', 'error', 'fix', 'file', 'symbol', 'import', 'call']

function nowIso(): string {
  return new Date().toISOString()
}

function safeRows<T>(db: Db, sql: string, ...params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return []
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

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function memorySpecificDomain(kind: string): GraphEvidenceDomain | null {
  if (kind === 'decision') return 'decision'
  if (kind === 'error') return 'error'
  if (kind === 'task_outcome' || kind === 'lesson') return 'fix'
  return null
}

function sourceRef(source: CoverageSource, project_id: string): GraphEvidenceSourceRef {
  return {
    source_domain: source.source_domain,
    source_id: source.source_id,
    project_id,
    ...(source.content_hash ? { content_hash: source.content_hash } : {}),
    ...(source.file_path ? { file_path: source.file_path } : {}),
    ...(source.line_start !== undefined ? { line_start: source.line_start } : {}),
    ...(source.line_end !== undefined ? { line_end: source.line_end } : {}),
    ...(source.symbol_path ? { symbol_path: source.symbol_path } : {}),
    ...(source.task_id ? { task_id: source.task_id } : {}),
  }
}

function memorySources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  const rows = safeRows<Record<string, unknown>>(db, `
    SELECT memory_id, kind, title, summary, content, content_hash, entities
      FROM memories
     WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
  `, input.workspace_id, input.project_id)
  const sources: CoverageSource[] = []
  for (const row of rows) {
    const memoryId = String(row['memory_id'])
    const base = {
      source_id: memoryId,
      source_domain: 'memory' as const,
      name: String(row['title'] || row['summary'] || memoryId),
      content_hash: row['content_hash'] === null || row['content_hash'] === undefined ? undefined : String(row['content_hash']),
      content: row['content'] === null || row['content'] === undefined ? undefined : String(row['content']),
    }
    sources.push({ ...base, domain: 'memory' })
    const specific = memorySpecificDomain(String(row['kind']))
    if (specific) sources.push({ ...base, domain: specific, source_domain: specific === 'decision' ? 'decision' : 'memory' })
  }
  return sources
}

function taskSources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  return safeRows<Record<string, unknown>>(db, `
    SELECT task_id, display_id, title, description, updated_at
      FROM tasks
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id).map(row => ({
    domain: 'task',
    source_id: String(row['task_id']),
    source_domain: 'task',
    task_id: String(row['task_id']),
    name: String(row['title'] || row['display_id'] || row['task_id']),
    content: String(row['description'] ?? ''),
    content_hash: row['updated_at'] === null || row['updated_at'] === undefined ? undefined : String(row['updated_at']),
  }))
}

function fileSources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  return safeRows<Record<string, unknown>>(db, `
    SELECT file_id, rel_path, sha256
      FROM code_files
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id).map(row => ({
    domain: 'file',
    source_id: String(row['file_id']),
    source_domain: 'file',
    name: String(row['rel_path'] || row['file_id']),
    file_path: String(row['rel_path'] || ''),
    content_hash: row['sha256'] === null || row['sha256'] === undefined ? undefined : String(row['sha256']),
  }))
}

function symbolSources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  return safeRows<Record<string, unknown>>(db, `
    SELECT f.file_id, f.rel_path, f.sha256, s.name, s.kind, s.line
      FROM code_symbols s
      JOIN code_files f ON f.file_id = s.file_id
     WHERE f.workspace_id = ? AND f.project_id = ?
  `, input.workspace_id, input.project_id).map(row => ({
    domain: 'symbol',
    source_id: `${row['file_id']}:${row['name']}:${row['line']}`,
    source_domain: 'file',
    name: String(row['name']),
    file_path: String(row['rel_path'] || ''),
    line_start: Number(row['line']),
    line_end: Number(row['line']),
    symbol_path: String(row['name']),
    content_hash: row['sha256'] === null || row['sha256'] === undefined ? undefined : String(row['sha256']),
  }))
}

function extractImports(content: string): string[] {
  const imports = new Set<string>()
  const staticRe = /(?:^|[\s;])import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/gm
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
  let match: RegExpExecArray | null
  while ((match = staticRe.exec(content))) imports.add(match[1]!)
  while ((match = dynamicRe.exec(content))) imports.add(match[1]!)
  while ((match = requireRe.exec(content))) imports.add(match[1]!)
  return Array.from(imports).sort()
}

const CALL_SKIP = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'import', 'require',
  'describe', 'it', 'expect',
])

function extractCalls(content: string): string[] {
  const calls = new Set<string>()
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = callRe.exec(content))) {
    const name = match[1]!
    if (!CALL_SKIP.has(name)) calls.add(name)
    const prefix = content.slice(Math.max(0, match.index - 24), match.index)
    if (/\bfunction\s+$/.test(prefix)) calls.delete(name)
  }
  return Array.from(calls).sort()
}

function codeChunkRows(input: { workspace_id: string; project_id: string }, db: Db): Array<Record<string, unknown>> {
  return safeRows<Record<string, unknown>>(db, `
    SELECT chunk_id, file_id, file_path, content, content_hash, start_line, end_line, symbol_path
      FROM code_chunks
     WHERE workspace_id = ? AND project_id = ?
  `, input.workspace_id, input.project_id)
}

function importSources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  const sources: CoverageSource[] = []
  for (const row of codeChunkRows(input, db)) {
    for (const imported of extractImports(String(row['content'] ?? ''))) {
      sources.push({
        domain: 'import',
        source_id: `${row['chunk_id']}:import:${imported}`,
        source_domain: 'code_chunk',
        name: imported,
        file_path: String(row['file_path'] || ''),
        line_start: row['start_line'] === null || row['start_line'] === undefined ? undefined : Number(row['start_line']),
        line_end: row['end_line'] === null || row['end_line'] === undefined ? undefined : Number(row['end_line']),
        symbol_path: row['symbol_path'] === null || row['symbol_path'] === undefined ? undefined : String(row['symbol_path']),
        content_hash: row['content_hash'] === null || row['content_hash'] === undefined ? undefined : String(row['content_hash']),
        source_ref: {
          source_domain: 'code_chunk',
          source_id: String(row['chunk_id']),
          project_id: input.project_id,
          content_hash: row['content_hash'] === null || row['content_hash'] === undefined ? undefined : String(row['content_hash']),
          file_path: String(row['file_path'] || ''),
          symbol_path: `import:${imported}`,
        },
      })
    }
  }
  return sources
}

function callSources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  const sources: CoverageSource[] = []
  for (const row of codeChunkRows(input, db)) {
    for (const called of extractCalls(String(row['content'] ?? ''))) {
      sources.push({
        domain: 'call',
        source_id: `${row['chunk_id']}:call:${called}`,
        source_domain: 'code_chunk',
        name: called,
        file_path: String(row['file_path'] || ''),
        line_start: row['start_line'] === null || row['start_line'] === undefined ? undefined : Number(row['start_line']),
        line_end: row['end_line'] === null || row['end_line'] === undefined ? undefined : Number(row['end_line']),
        symbol_path: row['symbol_path'] === null || row['symbol_path'] === undefined ? undefined : String(row['symbol_path']),
        content_hash: row['content_hash'] === null || row['content_hash'] === undefined ? undefined : String(row['content_hash']),
        source_ref: {
          source_domain: 'code_chunk',
          source_id: String(row['chunk_id']),
          project_id: input.project_id,
          content_hash: row['content_hash'] === null || row['content_hash'] === undefined ? undefined : String(row['content_hash']),
          file_path: String(row['file_path'] || ''),
          symbol_path: `call:${called}`,
        },
      })
    }
  }
  return sources
}

function collectCoverageSources(input: { workspace_id: string; project_id: string }, db: Db): CoverageSource[] {
  return [
    ...memorySources(input, db),
    ...taskSources(input, db),
    ...fileSources(input, db),
    ...symbolSources(input, db),
    ...importSources(input, db),
    ...callSources(input, db),
  ]
}

function coverageSourceDomain(domain: GraphEvidenceDomain): 'memory' | 'file_chunk' | 'code_chunk' | 'task' | 'decision' {
  if (domain === 'task') return 'task'
  if (domain === 'decision') return 'decision'
  if (domain === 'file' || domain === 'symbol') return 'file_chunk'
  if (domain === 'import' || domain === 'call') return 'code_chunk'
  return 'memory'
}

function upsertCoverageRecord(
  input: { workspace_id: string; project_id: string },
  source: CoverageSource,
  status: 'current' | 'stale' | 'failed' | 'skipped',
  db: Db,
): void {
  db.prepare(`
    INSERT INTO rag_coverage_records (
      coverage_id, workspace_id, project_id, source_domain, source_id,
      derived_domain, content_hash, status, freshness_checked_at
    ) VALUES (?, ?, ?, ?, ?, 'graph', ?, ?, ?)
    ON CONFLICT(workspace_id, project_id, source_domain, source_id, derived_domain)
    DO UPDATE SET
      content_hash = excluded.content_hash,
      status = excluded.status,
      freshness_checked_at = excluded.freshness_checked_at,
      updated_at = datetime('now')
  `).run(
    newId('rag_coverage'),
    input.workspace_id,
    input.project_id,
    coverageSourceDomain(source.domain),
    source.source_id,
    source.content_hash ?? null,
    status,
    nowIso(),
  )
}

function unitMatchesSource(unit: GraphEvidenceUnit, source: CoverageSource): boolean {
  if (unit.domain !== source.domain) return false
  return unit.source_refs.some(ref => {
    if (ref.source_domain === source.source_domain && ref.source_id === source.source_id) return true
    if (!source.source_ref) return false
    if (ref.source_domain !== source.source_ref.source_domain || ref.source_id !== source.source_ref.source_id) return false
    return source.domain === 'import' || source.domain === 'call'
      ? unit.name === source.name
      : true
  })
}

function summarize(
  input: { workspace_id: string; project_id: string },
  sources: CoverageSource[],
  units: GraphEvidenceUnit[],
): GraphCoverageReport {
  const domains = Object.fromEntries(GRAPH_DOMAINS.map(domain => [domain, {
    domain,
    sources: 0,
    current: 0,
    stale: 0,
    failed: 0,
    skipped: 0,
    graph_entities: 0,
    graph_edges: 0,
    status: 'skipped',
  }])) as Record<GraphEvidenceDomain, GraphCoverageDomainSummary>

  for (const source of sources) {
    const summary = domains[source.domain]
    summary.sources += 1
    const matches = units.filter(unit => unitMatchesSource(unit, source))
    if (!matches.length) summary.failed += 1
    else if (matches.some(unit => unit.freshness === 'failed')) summary.failed += 1
    else if (matches.some(unit => unit.freshness === 'stale')) summary.stale += 1
    else summary.current += 1
  }

  for (const unit of units) {
    const summary = domains[unit.domain]
    if (!summary) continue
    if (unit.kind === 'edge') summary.graph_edges += 1
    else summary.graph_entities += 1
  }

  for (const summary of Object.values(domains)) {
    summary.status = summary.sources === 0
      ? 'skipped'
      : summary.failed > 0
        ? 'failed'
        : summary.stale > 0
          ? 'stale'
          : 'current'
  }

  return {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    rebuilt_at: nowIso(),
    domains,
    totals: {
      sources: Object.values(domains).reduce((sum, domain) => sum + domain.sources, 0),
      current: Object.values(domains).reduce((sum, domain) => sum + domain.current, 0),
      stale: Object.values(domains).reduce((sum, domain) => sum + domain.stale, 0),
      failed: Object.values(domains).reduce((sum, domain) => sum + domain.failed, 0),
      skipped: Object.values(domains).reduce((sum, domain) => sum + domain.skipped, 0),
      graph_entities: Object.values(domains).reduce((sum, domain) => sum + domain.graph_entities, 0),
      graph_edges: Object.values(domains).reduce((sum, domain) => sum + domain.graph_edges, 0),
    },
    evidence_units: units,
  }
}

function sourceEntityName(source: CoverageSource): string {
  return source.file_path && source.domain === 'file' ? source.file_path : source.name
}

function rebuildMemoryEntityEdges(
  input: { workspace_id: string; project_id: string },
  memorySource: CoverageSource,
  memoryEntityId: string,
  db: Db,
): string[] {
  const touched: string[] = []
  const rows = safeRows<Record<string, unknown>>(db, `
    SELECT entities
      FROM memories
     WHERE workspace_id = ?
       AND (project_id = ? OR project_id IS NULL)
       AND memory_id = ?
  `, input.workspace_id, input.project_id, memorySource.source_id)
  const entities = parseJsonArray(rows[0]?.['entities']).map(String).filter(Boolean)
  for (const entityName of entities) {
    const target = persistGraphEvidenceUnit({
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      kind: 'entity',
      domain: 'memory',
      relationship_type: 'memory_entity',
      name: entityName,
      source_refs: [sourceRef(memorySource, input.project_id)],
      confidence: 0.8,
      freshness: 'current',
    }, db)
    touched.push(target.graph_unit_id)
    const edge = persistGraphEvidenceUnit({
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      kind: 'edge',
      domain: 'memory',
      relationship_type: 'mentions_entity',
      from_id: memoryEntityId,
      to_id: target.graph_unit_id,
      source_refs: [sourceRef(memorySource, input.project_id)],
      confidence: 0.75,
      freshness: 'current',
    }, db)
    touched.push(edge.graph_unit_id)
  }
  return touched
}

function rebuildCodeRelationships(
  input: { workspace_id: string; project_id: string },
  sources: CoverageSource[],
  entityIds: Map<string, string>,
  db: Db,
): string[] {
  const touched: string[] = []
  const fileByPath = new Map(sources.filter(source => source.domain === 'file').map(source => [source.file_path, source]))
  for (const source of sources) {
    if (source.domain === 'symbol') {
      const file = fileByPath.get(source.file_path)
      const fileId = file ? entityIds.get(`${file.domain}:${file.source_id}`) : undefined
      const symbolId = entityIds.get(`${source.domain}:${source.source_id}`)
      if (fileId && symbolId) {
        const edge = persistGraphEvidenceUnit({
          workspace_id: input.workspace_id,
          project_id: input.project_id,
          kind: 'edge',
          domain: 'symbol',
          relationship_type: 'declares_symbol',
          from_id: fileId,
          to_id: symbolId,
          source_refs: [sourceRef(source, input.project_id)],
          confidence: 0.9,
          freshness: 'current',
        }, db)
        touched.push(edge.graph_unit_id)
      }
    }
    if (source.domain === 'import' || source.domain === 'call') {
      const file = fileByPath.get(source.file_path)
      const fileId = file ? entityIds.get(`${file.domain}:${file.source_id}`) : undefined
      const targetId = entityIds.get(`${source.domain}:${source.source_id}`)
      if (fileId && targetId) {
        const edge = persistGraphEvidenceUnit({
          workspace_id: input.workspace_id,
          project_id: input.project_id,
          kind: 'edge',
          domain: source.domain,
          relationship_type: source.domain === 'import' ? 'imports' : 'calls',
          from_id: fileId,
          to_id: targetId,
          source_refs: [source.source_ref ?? sourceRef(source, input.project_id)],
          confidence: 0.8,
          freshness: 'current',
        }, db)
        touched.push(edge.graph_unit_id)
      }
    }
  }
  return touched
}

function projectGraphEvidenceIds(
  db: Db,
  table: 'graph_entities' | 'graph_edges',
  idColumn: 'entity_id' | 'edge_id',
  input: { workspace_id: string; project_id: string },
): string[] {
  return safeRows<Record<string, unknown>>(db, `
    SELECT ${idColumn} AS id, properties
      FROM ${table}
     WHERE workspace_id = ?
  `, input.workspace_id)
    .filter(row => {
      const properties = parseJsonObject(row['properties'])
      return properties['graph_evidence'] === true && properties['project_id'] === input.project_id
    })
    .map(row => String(row['id']))
}

function deleteRowsByIds(db: Db, table: 'graph_entities' | 'graph_edges' | 'rag_coverage_records', idColumn: string, ids: string[]): void {
  if (ids.length === 0) return
  const stmt = db.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`)
  for (const id of ids) stmt.run(id)
}

function deleteUntouchedProjectGraphEvidence(input: { workspace_id: string; project_id: string }, touchedIds: Set<string>, db: Db): void {
  deleteRowsByIds(db, 'graph_edges', 'edge_id', projectGraphEvidenceIds(db, 'graph_edges', 'edge_id', input).filter(id => !touchedIds.has(id)))
  deleteRowsByIds(db, 'graph_entities', 'entity_id', projectGraphEvidenceIds(db, 'graph_entities', 'entity_id', input).filter(id => !touchedIds.has(id)))
}

function clearProjectGraphCoverageRecords(input: { workspace_id: string; project_id: string }, db: Db): void {
  const rows = safeRows<Record<string, unknown>>(db, `
    SELECT coverage_id
      FROM rag_coverage_records
     WHERE workspace_id = ?
       AND project_id = ?
       AND derived_domain = 'graph'
  `, input.workspace_id, input.project_id)
  deleteRowsByIds(db, 'rag_coverage_records', 'coverage_id', rows.map(row => String(row['coverage_id'])))
}

export function summarizeGraphCoverage(
  input: { workspace_id: string; project_id: string },
  db: Db = getDb(),
): GraphCoverageReport {
  const sources = collectCoverageSources(input, db)
  const units = readGraphEvidenceUnits(input, db)
  return summarize(input, sources, units)
}

export function rebuildGraphCoverage(
  input: { workspace_id: string; project_id: string },
  db: Db = getDb(),
): GraphCoverageReport {
  const sources = collectCoverageSources(input, db)
  const entityIds = new Map<string, string>()
  const touchedGraphUnitIds = new Set<string>()

  const tx = db.transaction(() => {
    clearProjectGraphCoverageRecords(input, db)
    for (const source of sources) {
      const entity = persistGraphEvidenceUnit({
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        kind: 'entity',
        domain: source.domain,
        relationship_type: 'represents',
        name: sourceEntityName(source),
        source_refs: [source.source_ref ?? sourceRef(source, input.project_id)],
        confidence: 0.85,
        freshness: 'current',
      }, db)
      touchedGraphUnitIds.add(entity.graph_unit_id)
      entityIds.set(`${source.domain}:${source.source_id}`, entity.graph_unit_id)
      upsertCoverageRecord(input, source, 'current', db)
      if (source.domain === 'memory') {
        for (const id of rebuildMemoryEntityEdges(input, source, entity.graph_unit_id, db)) touchedGraphUnitIds.add(id)
      }
    }
    for (const id of rebuildCodeRelationships(input, sources, entityIds, db)) touchedGraphUnitIds.add(id)
    deleteUntouchedProjectGraphEvidence(input, touchedGraphUnitIds, db)
  })
  tx()

  return summarize(input, sources, readGraphEvidenceUnits(input, db))
}
