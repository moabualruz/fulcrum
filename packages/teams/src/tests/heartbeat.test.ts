// packages/teams/src/tests/heartbeat.test.ts
// Tests for TeamInstanceHeartbeat — 30s timer that keeps team instances alive.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb } from '@fulcrum/core'
import { createTeamTemplate, invokeTeam, TeamInstanceHeartbeat } from '../teams.js'
import type { AgentRole } from '../types.js'

let workspace_id: string
let project_id: string
let instance_id: string

async function setup(): Promise<void> {
  const db = createTestDb()
  const seeded = seed(db)
  workspace_id = seeded.workspace_id
  project_id = seeded.project_id

  await createTeamTemplate({
    name: 'heartbeat-test-template',
    description: 'Template for heartbeat tests',
    slots: [{ slot_id: 'worker', role: 'software_engineer' as AgentRole, min_count: 1, max_count: 1, concurrency_cap: 1 }],
  })

  const template = getDb().prepare("SELECT template_id FROM team_templates WHERE name = 'heartbeat-test-template'").get() as { template_id: string }

  const instance = await invokeTeam({
    template_id: template.template_id,
    workspace_id,
    project_id,
    purpose: 'heartbeat test',
    caller_role: 'chief_of_staff' as AgentRole,
    caller_agent_id: 'agent_test',
  })
  instance_id = instance.instance_id
}

describe('TeamInstanceHeartbeat', () => {
  beforeEach(async () => {
    await setup()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetTestDb()
  })

  it('starts and stops cleanly', () => {
    const hb = new TeamInstanceHeartbeat(instance_id)
    expect(hb.running).toBe(false)
    hb.start()
    expect(hb.running).toBe(true)
    hb.stop()
    expect(hb.running).toBe(false)
  })

  it('start() is idempotent — calling twice does not create a second timer', () => {
    const hb = new TeamInstanceHeartbeat(instance_id)
    hb.start()
    const timerRef = (hb as unknown as { timer: unknown }).timer
    hb.start() // second call should be a no-op
    expect((hb as unknown as { timer: unknown }).timer).toBe(timerRef)
    hb.stop()
  })

  it('updates heartbeat_at on the team_instances row when the interval fires', () => {
    const db = getDb()

    // Confirm heartbeat_at starts as null
    const before = db.prepare('SELECT heartbeat_at FROM team_instances WHERE instance_id = ?').get(instance_id) as { heartbeat_at: string | null }
    expect(before.heartbeat_at).toBeNull()

    const hb = new TeamInstanceHeartbeat(instance_id, 100)
    hb.start()

    // Advance fake timers past one interval
    vi.advanceTimersByTime(150)

    const after = db.prepare('SELECT heartbeat_at FROM team_instances WHERE instance_id = ?').get(instance_id) as { heartbeat_at: string | null }
    expect(after.heartbeat_at).not.toBeNull()

    hb.stop()
  })

  it('stops updating heartbeat_at after stop() is called', () => {
    const db = getDb()
    const hb = new TeamInstanceHeartbeat(instance_id, 100)
    hb.start()
    vi.advanceTimersByTime(150)

    const first = db.prepare('SELECT heartbeat_at FROM team_instances WHERE instance_id = ?').get(instance_id) as { heartbeat_at: string | null }
    const firstTs = first.heartbeat_at

    hb.stop()

    // Advance timers further — no new updates should happen
    vi.advanceTimersByTime(300)

    const second = db.prepare('SELECT heartbeat_at FROM team_instances WHERE instance_id = ?').get(instance_id) as { heartbeat_at: string | null }
    expect(second.heartbeat_at).toBe(firstTs)
  })
})
