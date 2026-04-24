import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDashboard } from '../src/routes/dashboard.ts'
import type { CockpitSnapshot } from '../src/live-stream.ts'

test('dashboard renders live run counts and adapter health details', () => {
  const snapshot: CockpitSnapshot = {
    tasksOpen: 0,
    tasksRunning: 1,
    tasksDone: 0,
    activeRuns: 1,
    health: [
      { key: 'plane', status: 'missing', message: 'plane adapter not configured' },
      { key: 'windmill', status: 'missing', message: 'windmill adapter not configured' },
      { key: 'lightrag', status: 'missing', message: 'lightrag adapter not configured' },
      { key: 'zoekt', status: 'missing', message: 'zoekt adapter not configured' },
      { key: 'lancedb', status: 'missing', message: 'lancedb adapter not configured' },
    ],
    eventCount: 4,
  }

  const dashboard = renderDashboard(snapshot)

  assert.match(dashboard, /running=1/)
  assert.match(dashboard, /active runs: 1/)
  assert.match(dashboard, /plane:missing/)
  assert.match(dashboard, /lancedb:missing/)
})
