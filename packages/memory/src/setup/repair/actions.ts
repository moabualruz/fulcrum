import type { RuntimeDataProfile } from 'fulcrum-agent-core'
import type { RagRepairAction, RagRepairDomainDecision, RagRepairPlanInput } from './contract.js'

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

function actionNamesForDecision(decision: RagRepairDomainDecision): string[] {
  if (decision.domain === 'vectors') return ['embed_vectors', 'embed_code_vectors']
  if (decision.domain === 'code') return ['repair_code_index']
  if (decision.domain === 'graph') return ['repair_graph']
  if (decision.domain === 'fts') return ['repair_fts']
  return [`repair_${decision.domain}`]
}

export function actionNamesForDomain(domain: string): string[] {
  return actionNamesForDecision({ domain, mode: 'targeted_repair', depends_on: [], reason: '' })
}

export function buildRepairActions(
  input: RagRepairPlanInput,
  runtime_profile: RuntimeDataProfile,
  decisions: RagRepairDomainDecision[],
  domainDetails: Record<string, unknown>,
): {
  required_actions: RagRepairAction[]
  optional_actions: RagRepairAction[]
} {
  const decisionByDomain = new Map(decisions.map(decision => [decision.domain, decision]))
  const actionNamesByDomain = new Map(decisions.map(decision => [decision.domain, actionNamesForDecision(decision)]))
  const requiredActions: RagRepairAction[] = []
  const optionalActions: RagRepairAction[] = []

  for (const decision of decisions) {
    const details = (domainDetails[decision.domain] ?? {}) as Record<string, unknown>
    const depends_on = decision.depends_on.flatMap(domain => actionNamesByDomain.get(domain) ?? [])
    const clean_slate = decision.mode === 'clean_slate_rebuild'
    if (decision.domain === 'vectors') {
      requiredActions.push({
        action: 'embed_vectors',
        command: embeddingCommand('memories', input),
        mutating: true,
        estimated_items: estimateVectorScope(details, 'memories'),
        retryable: true,
        domain: 'vectors',
        phase: 'repair',
        depends_on,
        clean_slate,
        reason: decision.reason,
      })
      requiredActions.push({
        action: 'embed_code_vectors',
        command: embeddingCommand('code', input),
        mutating: true,
        estimated_items: estimateVectorScope(details, 'code'),
        retryable: true,
        domain: 'vectors',
        phase: 'repair',
        depends_on,
        clean_slate,
        reason: decision.reason,
      })
      if (numericField(details, 'failed_job_items') > 0 && runtime_profile === 'dev') {
        optionalActions.push({
          action: 'retry_failed_embedding_jobs',
          command: `fulcrum jobs retry <job_id> --failed --workspace-id ${input.workspace_id} --project-id ${input.project_id} --json`,
          mutating: true,
          estimated_items: numericField(details, 'failed_job_items'),
          retryable: true,
          domain: 'vectors',
          phase: 'repair',
          depends_on: [],
          clean_slate: false,
          reason: 'Retry previously failed embedding job items after core repair actions finish',
        })
      }
      continue
    }

    requiredActions.push({
      action: decision.domain === 'code' ? 'repair_code_index' : `repair_${decision.domain}`,
      command: rebuildCommand(decision.domain, runtime_profile, input),
      mutating: true,
      estimated_items: estimateForDomain(decision.domain, details),
      retryable: true,
      domain: decision.domain,
      phase: 'repair',
      depends_on,
      clean_slate,
      reason: decision.reason,
    })
  }

  for (const action of requiredActions) {
    if (!action.depends_on?.length && action.domain) {
      const decision = decisionByDomain.get(action.domain)
      if (decision?.depends_on.length) action.depends_on = decision.depends_on.flatMap(domain => actionNamesByDomain.get(domain) ?? [])
    }
  }

  return {
    required_actions: requiredActions,
    optional_actions: optionalActions,
  }
}
