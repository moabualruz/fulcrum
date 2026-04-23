import { getDb, projectIdsFromPath } from 'fulcrum-agent-core'
import type { Db, RuntimeDataProfile } from 'fulcrum-agent-core'
import { buildRagHealthReport } from 'fulcrum-memory'
import type { RagHealthReport } from 'fulcrum-memory'

export interface RagHealthCommandInput {
  workspace_id?: string
  project_id?: string
  vault_path?: string
  runtime_profile?: RuntimeDataProfile
  data_dir?: string
}

export function executeRagHealthCommand(input: RagHealthCommandInput = {}, db: Db = getDb()): RagHealthReport {
  const ids = input.workspace_id && input.project_id
    ? { workspace_id: input.workspace_id, project_id: input.project_id }
    : projectIdsFromPath(process.cwd())
  return buildRagHealthReport({
    workspace_id: input.workspace_id ?? ids.workspace_id,
    project_id: input.project_id ?? ids.project_id,
    vault_path: input.vault_path,
    runtime_profile: input.runtime_profile,
    data_dir: input.data_dir,
  }, db)
}

function isDomainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function formatDomainValue(value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    return value.length > 0 ? value.join(',') : null
  }
  if (Array.isArray(value) && value.every(isDomainObject)) {
    return value.length > 0
      ? value.map(formatDomainObject).filter(Boolean).join('; ')
      : null
  }
  return null
}

function formatDomainObject(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, item]) => formatDomainScalar(key, item))
    .filter((item): item is string => item !== null)
    .join('/')
}

function formatDomainScalar(key: string, value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'boolean') return `${key}:${value}`
  if (typeof value === 'string' && value.length > 0) return `${key}:${value}`
  return null
}

export function formatRagHealthReport(report: RagHealthReport): string {
  const lines = [
    `RAG health: ${report.status}`,
    `workspace: ${report.workspace_id}`,
    `project: ${report.project_id}`,
    '',
    'Domains:',
  ]
  for (const [name, domain] of Object.entries(report.domains)) {
    const details = Object.entries(domain)
      .filter(([key]) => key !== 'status')
      .map(([key, value]) => {
        const formatted = formatDomainValue(value)
        return formatted === null ? null : `${key}=${formatted}`
      })
      .filter((value): value is string => value !== null)
      .join(', ')
    lines.push(`  ${name}: ${domain.status}${details ? ` (${details})` : ''}`)
  }
  if (report.recommended_actions.length > 0) {
    lines.push('', 'Recommended actions:')
    for (const action of report.recommended_actions) lines.push(`  - ${action}`)
  }
  return lines.join('\n')
}
