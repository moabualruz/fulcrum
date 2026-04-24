import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'
import type { RagParityCheck, RagRebuildDomain } from './rag-types.js'
import { toHealthProfileManifest } from './rag-health-support.js'

export interface RebuildCandidateRow {
  candidate_id: string
  report_id: string
  workspace_id: string
  project_id: string
  domains: RagRebuildDomain[]
  status: string
  input_snapshot_id: string
  runtime_profile: RuntimeDataProfile
}

function count(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

function servedState(input: { workspace_id: string; project_id: string }, db: Db): Record<string, number> {
  return {
    memories: count(db, 'SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)', input.workspace_id, input.project_id),
    code_files: count(db, 'SELECT COUNT(*) AS n FROM code_files WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    code_chunks: count(db, 'SELECT COUNT(*) AS n FROM code_chunks WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    vector_metadata: count(db, 'SELECT COUNT(*) AS n FROM vector_metadata WHERE workspace_id = ?', input.workspace_id),
    graph_entities: count(db, 'SELECT COUNT(*) AS n FROM graph_entities WHERE workspace_id = ?', input.workspace_id),
    graph_edges: count(db, 'SELECT COUNT(*) AS n FROM graph_edges WHERE workspace_id = ?', input.workspace_id),
  }
}

export function createRebuildCandidate(
  input: {
    report_id: string
    workspace_id: string
    project_id: string
    domains: RagRebuildDomain[]
    input_snapshot_id: string
    runtime_profile: RuntimeDataProfile
    profile_manifest: RuntimeDataProfileManifest
  },
  db: Db = getDb(),
): RebuildCandidateRow {
  const candidate_id = newId('rag_rebuild_candidate')
  db.prepare(`
    INSERT INTO rag_rebuild_candidates (
      candidate_id, report_id, workspace_id, project_id, domains, status,
      storage_ref, runtime_profile, profile_manifest, input_snapshot_id, served_state_before
    ) VALUES (?, ?, ?, ?, ?, 'building', ?, ?, ?, ?, ?)
  `).run(
    candidate_id,
    input.report_id,
    input.workspace_id,
    input.project_id,
    JSON.stringify(input.domains),
    JSON.stringify({ served: false, kind: 'logical-candidate' }),
    input.runtime_profile,
    JSON.stringify(toHealthProfileManifest(input.profile_manifest)),
    input.input_snapshot_id,
    JSON.stringify(servedState(input, db)),
  )
  return { ...input, candidate_id, status: 'building' }
}

export function updateRebuildCandidateStatus(
  candidate_id: string,
  status: RebuildCandidateRow['status'],
  verification: RagParityCheck[] = [],
  db: Db = getDb(),
): void {
  db.prepare(`
    UPDATE rag_rebuild_candidates
    SET status = ?, verification = ?, updated_at = datetime('now')
    WHERE candidate_id = ?
  `).run(status, JSON.stringify(verification), candidate_id)
}

export function finishRebuildCandidate(
  input: { candidate_id: string; snapshot_status: 'current' | 'stale' | 'superseded'; parity: RagParityCheck[] },
  db: Db = getDb(),
): { status: 'promoted' | 'quarantined'; disposition: 'promoted' | 'quarantined' } {
  const hasParityFailure = input.parity.some(check => check.status === 'fail')
  const promote = input.snapshot_status === 'current' && !hasParityFailure
  const status = promote ? 'promoted' : 'quarantined'
  db.prepare(`
    UPDATE rag_rebuild_candidates
    SET status = ?,
        verification = ?,
        updated_at = datetime('now'),
        promoted_at = CASE WHEN ? = 'promoted' THEN datetime('now') ELSE promoted_at END,
        disposed_at = CASE WHEN ? != 'promoted' THEN datetime('now') ELSE disposed_at END
    WHERE candidate_id = ?
  `).run(status, JSON.stringify(input.parity), status, status, input.candidate_id)
  return { status, disposition: status }
}
