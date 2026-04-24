import type { CockpitSnapshot } from '../../live-stream.ts'
import { healthLabels } from '../../live-stream.ts'

export function renderHealthPanel(snapshot: CockpitSnapshot): string {
  return healthLabels(snapshot).join('\n')
}
