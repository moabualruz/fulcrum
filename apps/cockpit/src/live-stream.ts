export type CockpitSnapshot = {
  tasksOpen: number
  tasksRunning: number
  tasksDone: number
  activeRuns: number
  health: HealthItem[]
  eventCount: number
}

export type HealthItem = {
  key: string
  status: 'missing' | 'available'
  message: string
}

export function summarizeSnapshot(snapshot: CockpitSnapshot): string {
  return [
    `open=${snapshot.tasksOpen}`,
    `running=${snapshot.tasksRunning}`,
    `done=${snapshot.tasksDone}`,
    `activeRuns=${snapshot.activeRuns}`,
    `health=${snapshot.health.length}`,
    `events=${snapshot.eventCount}`,
  ].join(' ')
}

export function healthLabels(snapshot: CockpitSnapshot): string[] {
  return snapshot.health.map((item) => `${item.key}:${item.status}`)
}
