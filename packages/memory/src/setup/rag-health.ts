import { getDb, newId, resolveRuntimeDataProfile } from 'fulcrum-agent-core'
import type { Db, RagHealthStatus, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'

export interface RagHealthReport {
  workspace_id: string
  project_id: string
  status: RagHealthStatus
  runtime_profile: RuntimeDataProfile
  profile_manifest: RuntimeDataProfileManifest
  generated_at: string
  domains: Record<string, unknown>
  recommended_actions: string[]
  warnings: string[]
  errors: string[]
}

export function buildRagHealthReport(
  input: { workspace_id: string; project_id: string; persist?: boolean; runtime_profile?: RuntimeDataProfile; data_dir?: string },
  db: Db = getDb(),
): RagHealthReport {
  const runtime_profile = input.runtime_profile ?? 'dev'
  const profile_manifest = resolveRuntimeDataProfile({ profile: runtime_profile, data_dir: input.data_dir })
  const report: RagHealthReport = {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    status: 'healthy',
    runtime_profile,
    profile_manifest,
    generated_at: new Date().toISOString(),
    domains: {},
    recommended_actions: [],
    warnings: [],
    errors: [],
  }
  if (input.persist) {
    db.prepare(`
      INSERT INTO rag_health_reports (
        health_report_id, workspace_id, project_id, status, runtime_profile, profile_manifest, generated_at, domains,
        recommended_actions, warnings, errors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId('rag_health_report'),
      input.workspace_id,
      input.project_id,
      report.status,
      report.runtime_profile,
      JSON.stringify(report.profile_manifest),
      report.generated_at,
      JSON.stringify(report.domains),
      JSON.stringify(report.recommended_actions),
      JSON.stringify(report.warnings),
      JSON.stringify(report.errors),
    )
  }
  return report
}
