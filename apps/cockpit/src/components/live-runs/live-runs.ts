import type { CockpitSnapshot } from '../../live-stream.ts'
import { dashboardSummary } from '../../live-stream.ts'

export function renderLiveRuns(snapshot: CockpitSnapshot): string {
  const runs = snapshot.activeRuns.map((run) => {
    const task = run.taskTitle ?? run.taskId
    const note = run.note ? ` ${run.note}` : ''
    return `run:${run.id}:${run.status}:${task}:${run.agentRole}${note}`
  })
  return [`active runs: ${dashboardSummary(snapshot).activeRuns}`, ...runs].join('\n')
}
