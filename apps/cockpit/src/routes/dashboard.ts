import type { CockpitSnapshot } from '../live-stream.ts'
import { renderHealthPanel } from '../components/health-panel/health-panel.ts'
import { renderLiveRuns } from '../components/live-runs/live-runs.ts'
import { summarizeSnapshot } from '../live-stream.ts'

export function renderDashboard(snapshot: CockpitSnapshot): string {
  return [
    summarizeSnapshot(snapshot),
    renderLiveRuns(snapshot),
    renderHealthPanel(snapshot),
  ].join('\n')
}
