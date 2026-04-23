import type { RagHealthStatus } from 'fulcrum-agent-core'
import type { RagHealthReport } from '../rag-health.js'

export function selectRepairDomains(
  health: RagHealthReport,
  requestedDomains?: string[],
): string[] {
  const requested = requestedDomains ? new Set(requestedDomains) : null
  return Object.entries(health.domains)
    .filter(([, domain]) => {
      const status = domain.status as RagHealthStatus
      return status !== 'healthy' && status !== 'out_of_scope'
    })
    .filter(([domain]) => requested === null || domain === 'l0' || domain === 'l1' || requested.has(domain))
    .map(([domain]) => domain)
}

export function resolveRepairNextAction(input: {
  strategy: 'targeted_repair' | 'clean_slate_rebuild' | 'blocked'
  clean_slate_domains: string[]
  targeted_domains: string[]
}): 'review_blockers' | 'clean_slate_rebuild' | 'targeted_repair' | 'none' {
  if (input.strategy === 'blocked') return 'review_blockers'
  if (input.clean_slate_domains.length > 0) return 'clean_slate_rebuild'
  if (input.targeted_domains.length > 0) return 'targeted_repair'
  return 'none'
}
