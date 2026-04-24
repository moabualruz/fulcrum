import { getDb, newId } from 'fulcrum-agent-core'
import type { AgentRole, Db, RagHealthStatus, RagRebuildMode, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'
import type { RagParityCheck, RagRebuildDomain, RagRebuildReport } from './rag-types.js'
import { redactRagDetails, redactRoadmapArtifact } from './rag-redaction.js'
import { toHealthProfileManifest } from './rag-health-support.js'

export function createRunningRebuildReport(
  input: {
    workspace_id: string
    project_id: string
    requested_by: string
    actor_role: AgentRole
    mode: RagRebuildMode
    domains: RagRebuildDomain[]
    runtime_profile: RuntimeDataProfile
    profile_manifest: RuntimeDataProfileManifest
    backup_ref?: string | null
    verification_refs?: string[]
    mutation_scope?: Record<string, unknown>
    profile_confirmation?: RuntimeDataProfile | null
    repair_plan_id?: string | null
  },
  db: Db = getDb(),
): string {
  const report_id = newId('rag_rebuild_report')
  db.prepare(`
    INSERT INTO rag_rebuild_reports (
      report_id, workspace_id, project_id, requested_by, actor_role, mode,
      domains, status, candidate_disposition, runtime_profile, profile_manifest,
      backup_ref, verification_refs, mutation_scope, profile_confirmation, repair_plan_id, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 'none', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    report_id,
    input.workspace_id,
    input.project_id,
    input.requested_by,
    input.actor_role,
    input.mode,
    JSON.stringify(input.domains),
    input.runtime_profile,
    JSON.stringify(toHealthProfileManifest(input.profile_manifest)),
    input.backup_ref ?? null,
    JSON.stringify(input.verification_refs ?? []),
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.mutation_scope ?? {}))),
    input.profile_confirmation ?? null,
    input.repair_plan_id ?? null,
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
    backup_ref?: string | null
    verification_refs?: string[]
    mutation_scope?: Record<string, unknown>
    profile_confirmation?: RuntimeDataProfile | null
    final_health_status?: RagHealthStatus | null
    verification?: Record<string, unknown>
    retryable_actions?: string[]
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
        artifact_path = ?,
        backup_ref = ?,
        verification_refs = ?,
        mutation_scope = ?,
        profile_confirmation = ?,
        final_health_status = ?,
        verification_summary = ?,
        retryable_actions = ?
    WHERE report_id = ?
  `).run(
    input.status,
    input.candidate_id ?? null,
    input.candidate_disposition,
    input.input_snapshot_id ?? null,
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.summary))),
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.parity))),
    JSON.stringify(input.warnings.map(warning => redactRoadmapArtifact(redactRagDetails(warning)))),
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.errors))),
    input.artifact_path ?? null,
    input.backup_ref ?? null,
    JSON.stringify(input.verification_refs ?? []),
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.mutation_scope ?? {}))),
    input.profile_confirmation ?? null,
    input.final_health_status ?? null,
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.verification ?? {}))),
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.retryable_actions ?? []))),
    input.report_id,
  )
}

export function readRebuildReport(report_id: string, workspace_id: string, db: Db = getDb()): RagRebuildReport {
  const row = db.prepare(`
    SELECT * FROM rag_rebuild_reports WHERE report_id = ? AND workspace_id = ?
  `).get(report_id, workspace_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`rebuild report not found: ${report_id}`)
  const profile_manifest = JSON.parse(row['profile_manifest'] as string) as RagRebuildReport['profile_manifest']
  const backup_ref = row['backup_ref'] as string | null
  return {
    report_id: row['report_id'] as string,
    status: row['status'] as RagRebuildReport['status'],
    mode: row['mode'] as RagRebuildMode,
    scope: {
      workspace_id: row['workspace_id'] as string,
      project_id: row['project_id'] as string,
      runtime_profile: row['runtime_profile'] as RuntimeDataProfile,
      domains: JSON.parse(row['domains'] as string) as RagRebuildDomain[],
    },
    profile_manifest,
    profile_confirmation: row['profile_confirmation'] as RuntimeDataProfile | null,
    backup: backup_ref ? {
      backup_ref,
      restorable: true,
    } : null,
    verification_refs: JSON.parse(row['verification_refs'] as string) as string[],
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
    repair_plan_id: row['repair_plan_id'] as string | null,
    final_health_status: row['final_health_status'] as RagHealthStatus | null,
    verification: JSON.parse(String(row['verification_summary'] ?? '{}')) as Record<string, unknown>,
    retryable_actions: JSON.parse(String(row['retryable_actions'] ?? '[]')) as string[],
  }
}
