import type { CockpitSnapshot } from '../../live-stream.ts'

export function renderLiveRuns(snapshot: CockpitSnapshot): string {
  return `active runs: ${snapshot.activeRuns}`
}
