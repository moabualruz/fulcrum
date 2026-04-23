import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RagHealthStatus, RuntimeDataProfile } from 'fulcrum-agent-core'
import { buildRagHealthReport } from './rag-health.js'

export interface RagRepairAction {
  action: string
  command: string
  mutating: boolean
  estimated_items: number
  retryable: boolean
}

export interface RagRepairPlan {
  repair_plan_id: string
  workspace_id: string
  project_id: string
  runtime_profile: RuntimeDataProfile
  status: 'planned'
  health_status: RagHealthStatus
  clean_slate_required: boolean
  domains: string[]
  domain_details: Record<string, unknown>
  mutation_scope: {
    derived_state_only: boolean
    domains: string[]
    canonical_sources_mutated: boolean
  }
  required_actions: RagRepairAction[]
  optional_actions: RagRepairAction[]
  blocking_errors: string[]
  preflight_warnings: string[]
}

export interface RagRepairPlanInput {
  workspace_id: string
  project_id: string
  runtime_profile?: RuntimeDataProfile
}

export function createEmptyRagRepairPlan(input: RagRepairPlanInput): RagRepairPlan {
  return {
    repair_plan_id: '',
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    runtime_profile: input.runtime_profile ?? 'dev',
    status: 'planned',
    health_status: 'healthy',
    clean_slate_required: false,
    domains: [],
    domain_details: {},
    mutation_scope: {
      derived_state_only: true,
      domains: [],
      canonical_sources_mutated: false,
    },
    required_actions: [],
    optional_actions: [],
    blocking_errors: [],
    preflight_warnings: [],
  }
}

function rebuildProfileFlags(runtime_profile: RuntimeDataProfile): string {
  return runtime_profile === 'install'
    ? '--profile install --confirm-profile install'
    : `--profile ${runtime_profile}`
}

function rebuildCommand(domain: string, runtime_profile: RuntimeDataProfile, input: RagRepairPlanInput): string {
  return [
    'fulcrum memory rebuild',
    `--domain ${domain}`,
    `--workspace-id ${input.workspace_id}`,
    `--project-id ${input.project_id}`,
    '--execute',
    rebuildProfileFlags(runtime_profile),
    '--json',
  ].join(' ')
}

function embeddingCommand(scope: 'memories' | 'code', input: RagRepairPlanInput): string {
  return [
    'fulcrum memory embed',
    `--scope ${scope}`,
    `--workspace-id ${input.workspace_id}`,
    `--project-id ${input.project_id}`,
    '--json',
  ].join(' ')
}

function numericField(details: Record<string, unknown>, key: string): number {
  const value = details[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function sumFields(details: Record<string, unknown>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + numericField(details, key), 0)
}

function sumObjectNumbers(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  return Object.values(value).reduce((sum, entry) => sum + (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0), 0)
}

function estimateForDomain(domain: string, details: Record<string, unknown>): number {
  const direct = domain === 'code'
    ? sumFields(details, ['orphan_chunks', 'legacy_chunks', 'chunk_count_mismatches', 'failed_files', 'parse_failed_files', 'parse_skipped_files'])
    : domain === 'vectors'
      ? sumFields(details, [
          'stale',
          'failed',
          'legacy',
          'missing_metadata',
          'missing_vector_rows',
          'content_hash_mismatches',
          'runtime_mismatches',
          'freshness_mismatches',
          'missing_source_rows',
          'failed_job_items',
        ])
      : domain === 'graph'
        ? sumFields(details, ['broken_edges', 'evidence_units']) + sumObjectNumbers(details['source_counts']) + sumObjectNumbers(details['coverage_totals'])
        : sumFields(details, ['missing_files', 'orphan_files', 'missing_index_rows', 'unchecked_rows', 'failed'])
  return Math.max(1, direct)
}

function estimateVectorScope(details: Record<string, unknown>, scope: 'memories' | 'code'): number {
  const groups = Array.isArray(details['groups']) ? details['groups'] as Array<Record<string, unknown>> : []
  const sourceDomain = scope === 'memories' ? 'memory' : 'code_chunk'
  const grouped = groups
    .filter(group => group['source_domain'] === sourceDomain && group['status'] !== 'current')
    .reduce((sum, group) => sum + (typeof group['count'] === 'number' ? group['count'] : 0), 0)
  const missing = numericField(details, scope === 'memories' ? 'missing_memory_metadata' : 'missing_code_metadata')
  return Math.max(estimateForDomain('vectors', details), grouped + missing)
}

function actionsForDomain(
  domain: string,
  runtime_profile: RuntimeDataProfile,
  input: RagRepairPlanInput,
  details: Record<string, unknown>,
): RagRepairAction[] {
  const estimated_items = estimateForDomain(domain, details)
  if (domain === 'vectors') {
    if (runtime_profile !== 'dev') return []
    return [
      {
        action: 'embed_vectors',
        command: embeddingCommand('memories', input),
        mutating: true,
        estimated_items: estimateVectorScope(details, 'memories'),
        retryable: true,
      },
      {
        action: 'embed_code_vectors',
        command: embeddingCommand('code', input),
        mutating: true,
        estimated_items: estimateVectorScope(details, 'code'),
        retryable: true,
      },
    ]
  }
  if (domain === 'code') {
    return [{
      action: 'repair_code_index',
      command: rebuildCommand('code', runtime_profile, input),
      mutating: true,
      estimated_items,
      retryable: true,
    }]
  }
  if (domain === 'graph') {
    return [{
      action: 'repair_graph',
      command: rebuildCommand('graph', runtime_profile, input),
      mutating: true,
      estimated_items,
      retryable: true,
    }]
  }
  return [{
    action: `repair_${domain}`,
    command: rebuildCommand(domain, runtime_profile, input),
    mutating: true,
    estimated_items,
    retryable: true,
  }]
}

export function buildRagRepairPlan(input: RagRepairPlanInput, db: Db = getDb()): RagRepairPlan {
  const runtime_profile = input.runtime_profile ?? 'dev'
  const health = buildRagHealthReport({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    runtime_profile,
  }, db)
  const domains = Object.entries(health.domains)
    .filter(([, domain]) => {
      const status = domain.status as RagHealthStatus
      return status !== 'healthy' && status !== 'out_of_scope'
    })
    .map(([domain]) => domain)
  const domain_details = Object.fromEntries(domains.map(domain => [domain, health.domains[domain]]))
  const required_actions = domains.flatMap(domain => actionsForDomain(domain, runtime_profile, input, health.domains[domain] ?? {}))
  const blocking_errors = runtime_profile !== 'dev' && domains.includes('vectors')
    ? [`vector repair actions require a profile-aware embedding command; runtime_profile=${runtime_profile} is not supported for vector repair actions`]
    : []

  return {
    repair_plan_id: newId('rag_repair_plan'),
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    runtime_profile,
    status: 'planned',
    health_status: health.status,
    clean_slate_required: false,
    domains,
    domain_details,
    mutation_scope: {
      derived_state_only: true,
      domains,
      canonical_sources_mutated: false,
    },
    required_actions,
    optional_actions: [],
    blocking_errors,
    preflight_warnings: health.warnings,
  }
}
