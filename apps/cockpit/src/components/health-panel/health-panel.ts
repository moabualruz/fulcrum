import type { CockpitSnapshot } from '../../live-stream.ts'
import { healthDegradationLabels, healthLabels } from '../../live-stream.ts'

export function renderHealthPanel(snapshot: CockpitSnapshot): string {
  const degraded = healthDegradationLabels(snapshot)
  const status = degraded.length > 0 ? 'health:degraded' : 'health:available'
  return [status, ...healthLabels(snapshot)].join('\n')
}
