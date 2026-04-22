import { createHash } from 'node:crypto'
import { getDb, newId } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import type { RagRebuildDomain } from './rag-types.js'

export interface RebuildInputSnapshot {
  input_snapshot_id: string
  workspace_id: string
  project_id: string
  domains: RagRebuildDomain[]
  source_manifest: Record<string, unknown>
  status: 'current' | 'stale' | 'superseded'
  stale_reason: string | null
}

function hashObject(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function rows(db: Db, sql: string, ...params: unknown[]): Array<Record<string, unknown>> {
  try {
    return db.prepare(sql).all(...params) as Array<Record<string, unknown>>
  } catch {
    return []
  }
}

export function buildRebuildSourceManifest(
  input: { workspace_id: string; project_id: string; domains: RagRebuildDomain[] },
  db: Db = getDb(),
): Record<string, unknown> {
  const { workspace_id, project_id } = input
  const manifest: Record<string, unknown> = {}
  if (input.domains.includes('l0')) {
    manifest['l0_sources'] = rows(db, `
      SELECT source_id, source_type, content_hash, vault_path
      FROM l0_sources
      WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
      ORDER BY source_id
    `, workspace_id, project_id)
  }
  if (input.domains.includes('l1') || input.domains.includes('fts') || input.domains.includes('vectors')) {
    manifest['memories'] = rows(db, `
      SELECT memory_id, content_hash, schema_version
      FROM memories
      WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
      ORDER BY memory_id
    `, workspace_id, project_id)
  }
  if (input.domains.includes('code') || input.domains.includes('vectors')) {
    manifest['code_files'] = rows(db, `
      SELECT file_id, rel_path, sha256, chunks_count
      FROM code_files
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY file_id
    `, workspace_id, project_id)
    manifest['code_chunks'] = rows(db, `
      SELECT chunk_id, file_id, file_path, content_hash, start_line, end_line
      FROM code_chunks
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY chunk_id
    `, workspace_id, project_id)
  }
  if (input.domains.includes('graph')) {
    manifest['graph_entities'] = rows(db, `
      SELECT entity_id, name, entity_type, updated_at
      FROM graph_entities
      WHERE workspace_id = ?
      ORDER BY entity_id
    `, workspace_id)
    manifest['graph_edges'] = rows(db, `
      SELECT edge_id, source_id, target_id, relation, weight
      FROM graph_edges
      WHERE workspace_id = ?
      ORDER BY edge_id
    `, workspace_id)
  }
  manifest['fingerprint'] = hashObject(manifest)
  return manifest
}

export function captureRebuildInputSnapshot(
  input: { workspace_id: string; project_id: string; domains: RagRebuildDomain[] },
  db: Db = getDb(),
): RebuildInputSnapshot {
  const snapshot: RebuildInputSnapshot = {
    input_snapshot_id: newId('rag_rebuild_snapshot'),
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    domains: input.domains,
    source_manifest: buildRebuildSourceManifest(input, db),
    status: 'current',
    stale_reason: null,
  }
  db.prepare(`
    INSERT INTO rag_rebuild_input_snapshots (
      input_snapshot_id, workspace_id, project_id, domains, source_manifest, status
    ) VALUES (?, ?, ?, ?, ?, 'current')
  `).run(
    snapshot.input_snapshot_id,
    snapshot.workspace_id,
    snapshot.project_id,
    JSON.stringify(snapshot.domains),
    JSON.stringify(snapshot.source_manifest),
  )
  return snapshot
}

export function validateRebuildInputSnapshot(snapshot_id: string, db: Db = getDb()): RebuildInputSnapshot {
  const row = db.prepare(`
    SELECT * FROM rag_rebuild_input_snapshots WHERE input_snapshot_id = ?
  `).get(snapshot_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`snapshot not found: ${snapshot_id}`)

  const domains = JSON.parse(row['domains'] as string) as RagRebuildDomain[]
  const stored = JSON.parse(row['source_manifest'] as string) as Record<string, unknown>
  const current = buildRebuildSourceManifest({
    workspace_id: row['workspace_id'] as string,
    project_id: row['project_id'] as string,
    domains,
  }, db)
  const stale = stored['fingerprint'] !== current['fingerprint']
  const status = stale ? 'stale' : 'current'
  const staleReason = stale ? 'canonical source manifest changed before promotion' : null

  db.prepare(`
    UPDATE rag_rebuild_input_snapshots
    SET status = ?, validated_at = datetime('now'), stale_reason = ?
    WHERE input_snapshot_id = ?
  `).run(status, staleReason, snapshot_id)

  return {
    input_snapshot_id: snapshot_id,
    workspace_id: row['workspace_id'] as string,
    project_id: row['project_id'] as string,
    domains,
    source_manifest: stored,
    status,
    stale_reason: staleReason,
  }
}
