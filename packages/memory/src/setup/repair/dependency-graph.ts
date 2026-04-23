import type { RagHealthReport } from '../rag-health.js'
import type { RagRepairBlockingCondition, RagRepairDomainDecision, RagRepairPlanInput, RagRepairStrategy } from './contract.js'

function numericField(details: Record<string, unknown>, key: string): number {
  const value = details[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function needsCleanSlate(domain: string, details: Record<string, unknown>): boolean {
  if (domain === 'code') {
    return numericField(details, 'orphan_chunks') > 0
      || numericField(details, 'legacy_chunks') > 0
  }
  if (domain === 'vectors') {
    return numericField(details, 'missing_source_rows') > 0
      || numericField(details, 'content_hash_mismatches') > 0
      || numericField(details, 'runtime_mismatches') > 0
      || numericField(details, 'freshness_mismatches') > 0
      || numericField(details, 'legacy') > 0
  }
  if (domain === 'graph') {
    return numericField(details, 'broken_edges') > 0
  }
  return false
}

function derivedDependencies(domain: string, activeDomains: Set<string>): string[] {
  if (domain === 'vectors') return activeDomains.has('code') ? ['code'] : []
  if (domain === 'graph') {
    const deps: string[] = []
    if (activeDomains.has('code')) deps.push('code')
    return deps
  }
  return []
}

function relevantCanonicalDomains(requestedDomains?: string[]): Set<string> {
  if (!requestedDomains || requestedDomains.length === 0) return new Set(['l0', 'l1'])

  const relevant = new Set<string>()
  for (const domain of requestedDomains) {
    if (domain === 'l0') relevant.add('l0')
    if (domain === 'l1' || domain === 'fts' || domain === 'vectors') relevant.add('l1')
  }
  return relevant
}

function blockedCanonicalDomains(health: RagHealthReport, requestedDomains?: string[]): RagRepairBlockingCondition[] {
  const blocked: RagRepairBlockingCondition[] = []
  const relevant = relevantCanonicalDomains(requestedDomains)
  for (const domain of ['l0', 'l1']) {
    if (!relevant.has(domain)) continue
    const details = health.domains[domain]
    if (!details || details.status === 'healthy' || details.status === 'out_of_scope') continue
    if (typeof details['error'] === 'string' && details['error'].includes('is not available; run memory migrations')) continue
    blocked.push({
      code: 'canonical_source_repair_required',
      domain,
      reason: `${domain} canonical sources are degraded; repair canonical sources manually before mutating derived RAG state`,
      retryable: false,
    })
  }
  return blocked
}

function runtimeBlockingConditions(
  input: RagRepairPlanInput,
  health: RagHealthReport,
): RagRepairBlockingCondition[] {
  if (input.runtime_profile === 'dev') return []
  if (input.domains && !input.domains.includes('vectors')) return []
  const vectors = health.domains['vectors']
  if (!vectors || vectors.status === 'healthy' || vectors.status === 'out_of_scope') return []
  return [{
    code: 'profile_vector_repair_unsupported',
    domain: 'vectors',
    reason: `vector repair actions require a profile-aware embedding command; runtime_profile=${input.runtime_profile} is not supported for vector repair actions`,
    retryable: false,
  }]
}

export function buildRepairDependencyGraph(
  input: RagRepairPlanInput,
  health: RagHealthReport,
): {
  strategy: RagRepairStrategy
  targeted_domains: string[]
  clean_slate_domains: string[]
  execution_order: string[]
  decisions: RagRepairDomainDecision[]
  blocking_conditions: RagRepairBlockingCondition[]
  repair_reasoning: string[]
} {
  const repairReasoning: string[] = []
  const canonicalBlocks = blockedCanonicalDomains(health, input.domains)
  const runtimeBlocks = runtimeBlockingConditions(input, health)
  const blockingConditions = [...canonicalBlocks, ...runtimeBlocks]
  const blockedDomains = new Set(blockingConditions.map(condition => condition.domain))
  const requestedDomains = input.domains ? new Set(input.domains) : null
  const activeDomains = Object.entries(health.domains)
    .filter(([, domain]) => domain.status !== 'healthy' && domain.status !== 'out_of_scope')
    .filter(([domain]) => requestedDomains === null || requestedDomains.has(domain))
    .map(([domain]) => domain)

  if (canonicalBlocks.length > 0) {
    repairReasoning.push('Canonical source drift blocks derived-state repair until raw or curated sources are restored.')
    return {
      strategy: 'blocked',
      targeted_domains: [],
      clean_slate_domains: [],
      execution_order: [],
      decisions: [],
      blocking_conditions: blockingConditions,
      repair_reasoning: repairReasoning,
    }
  }

  const derivedActive = activeDomains.filter(domain => !blockedDomains.has(domain) && domain !== 'l0' && domain !== 'l1')
  const derivedSet = new Set(derivedActive)
  const targetedDomains: string[] = []
  const cleanSlateDomains: string[] = []
  const decisions: RagRepairDomainDecision[] = []

  for (const domain of derivedActive) {
    const details = (health.domains[domain] ?? {}) as Record<string, unknown>
    const mode = needsCleanSlate(domain, details) ? 'clean_slate_rebuild' : 'targeted_repair'
    const depends_on = derivedDependencies(domain, derivedSet)
    const reason = mode === 'clean_slate_rebuild'
      ? `${domain} has structural drift that requires a clean-slate rebuild of derived state`
      : `${domain} can be repaired from current canonical sources without resetting all derived state`
    decisions.push({ domain, mode, depends_on, reason })
    if (mode === 'clean_slate_rebuild') cleanSlateDomains.push(domain)
    else targetedDomains.push(domain)
    repairReasoning.push(reason)
  }

  const executionOrder = [...decisions]
    .sort((left, right) => left.depends_on.length - right.depends_on.length || left.domain.localeCompare(right.domain))
    .map(decision => decision.domain)

  const strategy: RagRepairStrategy =
    cleanSlateDomains.length > 0 ? 'clean_slate_rebuild'
      : decisions.length > 0 ? 'targeted_repair'
        : blockingConditions.length > 0 ? 'blocked'
          : 'targeted_repair'

  if (decisions.length === 0 && blockingConditions.length > 0) {
    repairReasoning.push('No safe derived-state repair actions remain until blocking conditions are resolved.')
  }

  return {
    strategy,
    targeted_domains: targetedDomains,
    clean_slate_domains: cleanSlateDomains,
    execution_order: executionOrder,
    decisions,
    blocking_conditions: blockingConditions,
    repair_reasoning: repairReasoning,
  }
}
