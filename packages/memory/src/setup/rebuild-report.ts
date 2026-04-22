import { getDb, newId } from 'fulcrum-agent-core'
import type { AgentRole, Db, RagRebuildMode } from 'fulcrum-agent-core'
import type { RagParityCheck, RagRebuildDomain, RagRebuildReport } from './rag-types.js'
import { redactRagDetails } from './rag-redaction.js'

export function createRunningRebuildReport(
  input: {
    workspace_id: string
    project_id: string
    requested_by: string
    actor_role: AgentRole
    mode: RagRebuildMode
    domains: RagRebuildDomain[]
  },
  db: Db = getDb(),
): string {
  const report_id = newId('rag_rebuild_report')
  db.prepare(`
    INSERT INTO rag_rebuild_reports (
      report_id, workspace_id, project_id, requested_by, actor_role, mode,
      domains, status, candidate_disposition, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 'none', datetime('now'))
  `).run(
    report_id,
    input.workspace_id,
    input.project_id,
    input.requested_by,
    input.actor_role,
    input.mode,
    JSON.stringify(input.domains),
  )
  return report_id
}

export function finishRebuildReport(
  input: {
    report_id: string
    status: 'completed' | 'failed' | 'cancelled'
    candidate_id?: string | null
    candidate_disposition: 'none' | 'promoted' | 'quarantined' | 'discarded'
    input_snapshot_id?: string | null
    summary: Record<string, unknown>
    parity: RagParityCheck[]
    warnings: string[]
    errors: unknown[]
    artifact_path?: string | null
  },
  db: Db = getDb(),
): void {
  db.prepare(`
    UPDATE rag_rebuild_reports
    SET status = ?,
        candidate_id = ?,
        candidate_disposition = ?,
        input_snapshot_id = ?,
        finished_at = datetime('now'),
        summary = ?,
        parity = ?,
        warnings = ?,
        errors = ?,
        artifact_path = ?
    WHERE report_id = ?
  `).run(
    input.status,
    input.candidate_id ?? null,
    input.candidate_disposition,
    input.input_snapshot_id ?? null,
    JSON.stringify(redactRagDetails(input.summary)),
    JSON.stringify(redactRagDetails(input.parity)),
    JSON.stringify(input.warnings.map(warning => redactRagDetails(warning))),
    JSON.stringify(redactRagDetails(input.errors)),
    input.artifact_path ?? null,
    input.report_id,
  )
}

export function readRebuildReport(report_id: string, workspace_id: string, db: Db = getDb()): RagRebuildReport {
  const row = db.prepare(`
    SELECT * FROM rag_rebuild_reports WHERE report_id = ? AND workspace_id = ?
  `).get(report_id, workspace_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`rebuild report not found: ${report_id}`)
  return {
    report_id: row['report_id'] as string,
    status: row['status'] as RagRebuildReport['status'],
    mode: row['mode'] as RagRebuildMode,
    scope: {
      workspace_id: row['workspace_id'] as string,
      project_id: row['project_id'] as string,
      domains: JSON.parse(row['domains'] as string) as RagRebuildDomain[],
    },
    candidate: row['candidate_id'] ? {
      candidate_id: row['candidate_id'] as string,
      status: row['candidate_disposition'] as string,
      disposition: row['candidate_disposition'] as string,
      input_snapshot_id: row['input_snapshot_id'] as string | null,
      input_snapshot_status: null,
      served_state_unchanged: row['candidate_disposition'] !== 'promoted',
    } : null,
    counts: JSON.parse(row['summary'] as string) as Record<string, number>,
    parity: JSON.parse(row['parity'] as string) as RagParityCheck[],
    warnings: JSON.parse(row['warnings'] as string) as string[],
    errors: JSON.parse(row['errors'] as string) as unknown[],
    artifact_path: row['artifact_path'] as string | null,
  }
}
