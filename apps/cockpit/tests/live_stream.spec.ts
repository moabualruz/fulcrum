import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendLiveEvent,
  createEmptyBoardColumns,
  createEmptySnapshot,
  liveEventFromSseData,
  type CockpitSnapshot,
  type LiveEventDto,
} from '../src/live-stream.ts'
import { renderDashboard } from '../src/routes/dashboard.ts'

test('dashboard renders global and per-project product state from sample snapshot', () => {
  const snapshot = sampleSnapshot()

  const dashboard = renderDashboard(snapshot)

  assert.match(dashboard, /open=1 running=1 blocked=1 done=1/)
  assert.match(dashboard, /agent-os open=1 running=1 blocked=0 done=1 failed=0/)
  assert.match(dashboard, /backend open=0 running=0 blocked=1 done=0 failed=0/)
  assert.match(dashboard, /run:run_1:running:ship cockpit:software_engineer/)
  assert.match(dashboard, /blocker:blocker_1:critical:open:Needs policy approval/)
  assert.match(dashboard, /artifact:artifact_1:ready:patch:\/tmp\/run_1.patch/)
  assert.match(dashboard, /review:review_1:requested:ship cockpit/)
  assert.match(dashboard, /merge:merge_1:ready:ship cockpit/)
  assert.match(dashboard, /policy:policy_1:denied:run:run_2:requires human approval/)
  assert.match(dashboard, /health:degraded/)
  assert.match(dashboard, /lancedb:missing lancedb adapter not configured/)
  assert.match(dashboard, /event:evt_1:run.started:run_1:run started/)
})

test('live event append updates task board and active run state', () => {
  let snapshot = createEmptySnapshot()
  snapshot = appendLiveEvent(snapshot, event('evt_1', 'task.created', 'task_1', 'ship cockpit', {
    workspace_id: 'ws_1',
    project_id: 'proj_1',
    project_name: 'agent-os',
    title: 'ship cockpit',
    status: 'open',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_2', 'run.started', 'run_1', 'run started', {
    task_id: 'task_1',
    agent_role: 'software_engineer',
    status: 'running',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_3', 'run.heartbeat', 'run_1', 'rendering queue model', {
    task_id: 'task_1',
    status: 'running',
  }))

  assert.equal(snapshot.taskBoard.global.open.length, 0)
  assert.equal(snapshot.taskBoard.global.running[0].id, 'task_1')
  assert.equal(snapshot.activeRuns[0].lastEventId, 'evt_3')
  assert.equal(snapshot.activeRuns[0].note, 'rendering queue model')
  assert.equal(snapshot.summary?.events, 3)
})

test('SSE data parser preserves attributes needed for live reducer updates', () => {
  const parsed = liveEventFromSseData(
    'evt_2',
    'run.started',
    'subject=run_1 message=run started attr.task_id=task_1 attr.agent_role=software%20engineer attr.status=running',
    1_700_000_000_000,
  )
  let snapshot = createEmptySnapshot()
  snapshot = appendLiveEvent(snapshot, event('evt_1', 'task.created', 'task_1', 'ship cockpit', {
    workspace_id: 'ws_1',
    project_id: 'proj_1',
    project_name: 'agent-os',
    title: 'ship cockpit',
    status: 'open',
  }))
  snapshot = appendLiveEvent(snapshot, parsed)

  assert.equal(parsed.subject, 'run_1')
  assert.equal(parsed.attributes?.task_id, 'task_1')
  assert.equal(parsed.attributes?.agent_role, 'software engineer')
  assert.equal(snapshot.activeRuns[0].taskId, 'task_1')
  assert.equal(snapshot.activeRuns[0].agentRole, 'software engineer')
  assert.equal(snapshot.taskBoard.global.running[0].id, 'task_1')
})

test('health degradation display updates adapter health in place', () => {
  const snapshot = appendLiveEvent(sampleSnapshot(), event('evt_9', 'adapter.health_checked', 'zoekt', 'index lag high', {
    status: 'degraded',
    capability: 'code_lexical_search',
    boundary: 'managed_index',
  }))

  const dashboard = renderDashboard(snapshot)

  assert.equal(snapshot.adapterHealth.find((item) => item.key === 'zoekt')?.status, 'degraded')
  assert.match(dashboard, /zoekt:degraded index lag high/)
  assert.match(dashboard, /health:degraded/)
})

test('review and merge queues update existing items', () => {
  let snapshot = createEmptySnapshot()
  snapshot = appendLiveEvent(snapshot, event('evt_1', 'review.requested', 'review_1', 'needs review', {
    task_id: 'task_1',
    title: 'ship cockpit',
    reviewer: 'human',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_2', 'review.approved', 'review_1', 'approved', {
    task_id: 'task_1',
    title: 'ship cockpit',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_3', 'merge.ready', 'merge_1', 'ready', {
    task_id: 'task_1',
    title: 'ship cockpit',
    target: 'main',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_4', 'merge.blocked', 'merge_1', 'checks pending', {
    task_id: 'task_1',
    title: 'ship cockpit',
    target: 'main',
    reason: 'checks pending',
  }))

  assert.equal(snapshot.reviewQueue.length, 1)
  assert.equal(snapshot.reviewQueue[0].status, 'approved')
  assert.equal(snapshot.mergeQueue.length, 1)
  assert.equal(snapshot.mergeQueue[0].status, 'blocked')
  assert.match(renderDashboard(snapshot), /merge:merge_1:blocked:ship cockpit/)
})

test('artifact, blocker, policy, and terminal run events update dashboard state', () => {
  let snapshot = sampleSnapshot()
  snapshot = appendLiveEvent(snapshot, event('evt_10', 'run.blocked', 'run_1', 'Needs policy approval', {
    task_id: 'task_2',
    status: 'blocked',
    severity: 'warning',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_11', 'artifact.created', 'artifact_2', '/tmp/summary.md', {
    run_id: 'run_1',
    task_id: 'task_2',
    kind: 'summary',
    path: '/tmp/summary.md',
    state: 'ready',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_12', 'policy.decision', 'policy_2', 'terminal runs cannot transition', {
    subject_kind: 'run',
    subject_id: 'run_1',
    allowed: 'false',
    reason: 'terminal runs cannot transition',
  }))
  snapshot = appendLiveEvent(snapshot, event('evt_13', 'run.completed', 'run_1', 'run completed', {
    task_id: 'task_2',
    status: 'completed',
  }))

  assert.equal(snapshot.taskBoard.global.done.some((task) => task.id === 'task_2'), true)
  assert.equal(snapshot.activeRuns.some((run) => run.id === 'run_1'), false)
  assert.equal(snapshot.artifacts.some((artifact) => artifact.id === 'artifact_2'), true)
  assert.equal(snapshot.policyDecisions.at(-1)?.reason, 'terminal runs cannot transition')
  assert.match(renderDashboard(snapshot), /artifact:artifact_2:ready:summary:\/tmp\/summary.md/)
})

function sampleSnapshot(): CockpitSnapshot {
  const global = createEmptyBoardColumns()
  global.open.push({
    id: 'task_1',
    workspaceId: 'ws_1',
    projectId: 'proj_1',
    projectName: 'agent-os',
    title: 'draft board',
    status: 'open',
  })
  global.running.push({
    id: 'task_2',
    workspaceId: 'ws_1',
    projectId: 'proj_1',
    projectName: 'agent-os',
    title: 'ship cockpit',
    status: 'running',
    runId: 'run_1',
  })
  global.blocked.push({
    id: 'task_3',
    workspaceId: 'ws_1',
    projectId: 'proj_2',
    projectName: 'backend',
    title: 'wire adapter',
    status: 'blocked',
    blockers: ['blocker_1'],
  })
  global.done.push({
    id: 'task_4',
    workspaceId: 'ws_1',
    projectId: 'proj_1',
    projectName: 'agent-os',
    title: 'snapshot shell',
    status: 'done',
  })

  const agentOs = createEmptyBoardColumns()
  agentOs.open.push(global.open[0])
  agentOs.running.push(global.running[0])
  agentOs.done.push(global.done[0])

  const backend = createEmptyBoardColumns()
  backend.blocked.push(global.blocked[0])

  return {
    taskBoard: {
      global,
      projects: [
        { projectId: 'proj_1', projectName: 'agent-os', columns: agentOs },
        { projectId: 'proj_2', projectName: 'backend', columns: backend },
      ],
    },
    activeRuns: [
      {
        id: 'run_1',
        taskId: 'task_2',
        projectId: 'proj_1',
        taskTitle: 'ship cockpit',
        agentRole: 'software_engineer',
        status: 'running',
        lastEventId: 'evt_1',
        note: 'run started',
      },
    ],
    blockers: [
      {
        id: 'blocker_1',
        taskId: 'task_3',
        runId: 'run_2',
        severity: 'critical',
        title: 'Policy approval',
        detail: 'Needs policy approval',
        status: 'open',
      },
    ],
    artifacts: [
      { id: 'artifact_1', runId: 'run_1', taskId: 'task_2', kind: 'patch', path: '/tmp/run_1.patch', state: 'ready' },
    ],
    reviewQueue: [
      { id: 'review_1', taskId: 'task_2', runId: 'run_1', title: 'ship cockpit', status: 'requested', reviewer: 'human' },
    ],
    mergeQueue: [
      { id: 'merge_1', taskId: 'task_2', runId: 'run_1', title: 'ship cockpit', status: 'ready', target: 'main' },
    ],
    policyDecisions: [
      { id: 'policy_1', subjectKind: 'run', subjectId: 'run_2', allowed: false, reason: 'requires human approval' },
    ],
    adapterHealth: [
      { key: 'plane', status: 'available', message: 'plane adapter available' },
      { key: 'zoekt', status: 'degraded', message: 'zoekt index lag high' },
      { key: 'lancedb', status: 'missing', message: 'lancedb adapter not configured' },
    ],
    events: [
      event('evt_1', 'run.started', 'run_1', 'run started', { task_id: 'task_2' }),
    ],
  }
}

function event(id: string, kind: string, subject: string, message: string, attributes: Record<string, string> = {}): LiveEventDto {
  return { id, kind, subject, message, atMs: 1_700_000_000_000, attributes }
}
