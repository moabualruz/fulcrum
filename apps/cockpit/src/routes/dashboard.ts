import type { CockpitSnapshot } from '../live-stream.ts'
import { renderHealthPanel } from '../components/health-panel/health-panel.ts'
import { renderLiveRuns } from '../components/live-runs/live-runs.ts'
import {
  artifactLines,
  boardLines,
  policyLines,
  queueLines,
  summarizeSnapshot,
} from '../live-stream.ts'

export function renderDashboard(snapshot: CockpitSnapshot): string {
  return [
    summarizeSnapshot(snapshot),
    renderTaskBoard(snapshot),
    renderLiveRuns(snapshot),
    renderBlockers(snapshot),
    renderArtifacts(snapshot),
    renderQueues(snapshot),
    renderPolicyDecisions(snapshot),
    renderHealthPanel(snapshot),
    renderEventStream(snapshot),
  ].join('\n')
}

export function renderTaskBoard(snapshot: CockpitSnapshot): string {
  return ['task board', ...boardLines(snapshot.taskBoard)].join('\n')
}

export function renderBlockers(snapshot: CockpitSnapshot): string {
  const lines = snapshot.blockers.map((blocker) => `blocker:${blocker.id}:${blocker.severity}:${blocker.status}:${blocker.detail}`)
  return ['blockers', ...(lines.length > 0 ? lines : ['blocker:none'])].join('\n')
}

export function renderArtifacts(snapshot: CockpitSnapshot): string {
  const lines = artifactLines(snapshot)
  return ['artifacts', ...(lines.length > 0 ? lines : ['artifact:none'])].join('\n')
}

export function renderQueues(snapshot: CockpitSnapshot): string {
  const lines = queueLines(snapshot)
  return ['queues', ...(lines.length > 0 ? lines : ['queue:none'])].join('\n')
}

export function renderPolicyDecisions(snapshot: CockpitSnapshot): string {
  const lines = policyLines(snapshot)
  return ['policy decisions', ...(lines.length > 0 ? lines : ['policy:none'])].join('\n')
}

export function renderEventStream(snapshot: CockpitSnapshot): string {
  const lines = snapshot.events.map((event) => `event:${event.id}:${event.kind}:${event.subject}:${event.message}`)
  return ['event stream', ...(lines.length > 0 ? lines : ['event:none'])].join('\n')
}
