import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RagHealthStatus } from 'fulcrum-agent-core'

export interface RagHealthReport {
  workspace_id: string
  project_id: string
  status: RagHealthStatus
  generated_at: string
  domains: Record<string, unknown>
  recommended_actions: string[]
  warnings: string[]
  errors: string[]
}

export function buildRagHealthReport(
  input: { workspace_id: string; project_id: string; persist?: boolean },
  db: Db = getDb(),
): RagHealthReport {
  const report: RagHealthReport = {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    status: 'healthy',
    generated_at: new Date().toISOString(),
    domains: {},
    recommended_actions: [],
    warnings: [],
    errors: [],
  }
  if (input.persist) {
    db.prepare(`
      INSERT INTO rag_health_reports (
        health_report_id, workspace_id, project_id, status, generated_at, domains,
        recommended_actions, warnings, errors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId('rag_health_report'),
      input.workspace_id,
      input.project_id,
      report.status,
      report.generated_at,
      JSON.stringify(report.domains),
      JSON.stringify(report.recommended_actions),
      JSON.stringify(report.warnings),
      JSON.stringify(report.errors),
    )
  }
  return report
}
