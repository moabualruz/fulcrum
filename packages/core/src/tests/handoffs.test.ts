import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import {
  createHandoff,
  getHandoff,
  listHandoffs,
  claimHandoff,
  completeHandoff,
} from '../handoffs.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1', 'test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'test proj')").run()
  return db
}

function makeHandoffInput(overrides: Partial<Parameters<typeof createHandoff>[1]> = {}) {
  return {
    workspace_id: 'ws_1',
    goal: 'Implement feature X',
    task_type: 'implementation',
    ...overrides,
  }
}

describe('createHandoff', () => {
  it('roundtrip — all fields preserved', () => {
    const db = seed()
    const handoff = createHandoff(db, {
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      from_agent_id: 'agent-a',
      to_agent_id: 'agent-b',
      goal: 'Do the thing',
      task_type: 'research',
      priority: 'high',
      scope: 'issue',
      inputs: { key: 'value', nested: { x: 1 } },
      constraints: ['must be fast', 'no side effects'],
      done_criteria: 'All tests pass',
      handoff_mode: 'contextual',
    })

    expect(handoff.handoff_id).toMatch(/^hof_/)
    expect(handoff.workspace_id).toBe('ws_1')
    expect(handoff.project_id).toBe('proj_1')
    expect(handoff.from_agent_id).toBe('agent-a')
    expect(handoff.to_agent_id).toBe('agent-b')
    expect(handoff.goal).toBe('Do the thing')
    expect(handoff.task_type).toBe('research')
    expect(handoff.priority).toBe('high')
    expect(handoff.scope).toBe('issue')
    expect(handoff.inputs).toEqual({ key: 'value', nested: { x: 1 } })
    expect(handoff.constraints).toEqual(['must be fast', 'no side effects'])
    expect(handoff.done_criteria).toBe('All tests pass')
    expect(handoff.handoff_mode).toBe('contextual')
    expect(handoff.status).toBe('pending')
    expect(handoff.claimed_at).toBeUndefined()
    expect(handoff.created_at).toBeTruthy()
  })

  it('applies default priority=normal and scope=task when not provided', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    expect(handoff.priority).toBe('normal')
    expect(handoff.scope).toBe('task')
    expect(handoff.status).toBe('pending')
  })

  it('applies default handoff_mode=brief when not provided', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    expect(handoff.handoff_mode).toBe('brief')
  })

  it('emits handoff_created event', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput({ from_agent_id: 'agent-z' }))
    const evt = db.prepare(
      "SELECT * FROM events WHERE evt_type = 'handoff_created' AND object_id = ?"
    ).get(handoff.handoff_id)
    expect(evt).toBeTruthy()
  })
})

describe('getHandoff', () => {
  it('returns the handoff by id and workspace_id', () => {
    const db = seed()
    const created = createHandoff(db, makeHandoffInput())
    const fetched = getHandoff(db, created.handoff_id, 'ws_1')
    expect(fetched).not.toBeNull()
    expect(fetched!.handoff_id).toBe(created.handoff_id)
  })

  it('returns null when not found', () => {
    const db = seed()
    const result = getHandoff(db, 'hof_NONEXISTENT', 'ws_1')
    expect(result).toBeNull()
  })

  it('returns null when workspace_id does not match', () => {
    const db = seed()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2', 'other ws')").run()
    const created = createHandoff(db, makeHandoffInput())
    const result = getHandoff(db, created.handoff_id, 'ws_2')
    expect(result).toBeNull()
  })
})

describe('listHandoffs', () => {
  it('returns all handoffs for workspace', () => {
    const db = seed()
    createHandoff(db, makeHandoffInput({ goal: 'goal 1' }))
    createHandoff(db, makeHandoffInput({ goal: 'goal 2' }))
    const list = listHandoffs(db, { workspace_id: 'ws_1' })
    expect(list).toHaveLength(2)
  })

  it('filters by status', () => {
    const db = seed()
    const h1 = createHandoff(db, makeHandoffInput({ goal: 'pending one' }))
    const h2 = createHandoff(db, makeHandoffInput({ goal: 'to be claimed' }))
    claimHandoff(db, { handoff_id: h2.handoff_id, workspace_id: 'ws_1', agent_id: 'agent-x' })

    const pending = listHandoffs(db, { workspace_id: 'ws_1', status: 'pending' })
    expect(pending).toHaveLength(1)
    expect(pending[0].handoff_id).toBe(h1.handoff_id)

    const claimed = listHandoffs(db, { workspace_id: 'ws_1', status: 'claimed' })
    expect(claimed).toHaveLength(1)
    expect(claimed[0].handoff_id).toBe(h2.handoff_id)
  })

  it('filters by to_agent_id', () => {
    const db = seed()
    createHandoff(db, makeHandoffInput({ to_agent_id: 'agent-alpha' }))
    createHandoff(db, makeHandoffInput({ to_agent_id: 'agent-beta' }))
    const list = listHandoffs(db, { workspace_id: 'ws_1', to_agent_id: 'agent-alpha' })
    expect(list).toHaveLength(1)
    expect(list[0].to_agent_id).toBe('agent-alpha')
  })

  it('filters by both status and to_agent_id', () => {
    const db = seed()
    createHandoff(db, makeHandoffInput({ to_agent_id: 'agent-x', goal: 'one' }))
    createHandoff(db, makeHandoffInput({ to_agent_id: 'agent-y', goal: 'two' }))
    const list = listHandoffs(db, { workspace_id: 'ws_1', to_agent_id: 'agent-x', status: 'pending' })
    expect(list).toHaveLength(1)
  })

  it('respects limit', () => {
    const db = seed()
    for (let i = 0; i < 5; i++) {
      createHandoff(db, makeHandoffInput({ goal: `goal ${i}` }))
    }
    const list = listHandoffs(db, { workspace_id: 'ws_1', limit: 3 })
    expect(list).toHaveLength(3)
  })
})

describe('claimHandoff', () => {
  it('sets status=claimed, claimed_at, and to_agent_id', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    const claimed = claimHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1', agent_id: 'agent-claimer' })
    expect(claimed.status).toBe('claimed')
    expect(claimed.claimed_at).toBeTruthy()
    expect(claimed.to_agent_id).toBe('agent-claimer')
  })

  it('throws invalid_state on double-claim', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    claimHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1', agent_id: 'agent-1' })
    expect(() =>
      claimHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1', agent_id: 'agent-2' })
    ).toThrow(expect.objectContaining({ code: 'invalid_state' }))
  })

  it('throws not_found for unknown handoff_id', () => {
    seed()
    const db = getDb()
    expect(() =>
      claimHandoff(db, { handoff_id: 'hof_NONEXISTENT', workspace_id: 'ws_1', agent_id: 'agent-x' })
    ).toThrow(expect.objectContaining({ code: 'not_found' }))
  })

  it('emits handoff_consumed event', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    claimHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1', agent_id: 'agent-claimer' })
    const evt = db.prepare(
      "SELECT * FROM events WHERE evt_type = 'handoff_consumed' AND object_id = ?"
    ).get(handoff.handoff_id)
    expect(evt).toBeTruthy()
  })
})

describe('completeHandoff', () => {
  it('sets status=completed', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    claimHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1', agent_id: 'agent-a' })
    const completed = completeHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1' })
    expect(completed.status).toBe('completed')
  })

  it('throws not_found for unknown handoff_id', () => {
    seed()
    const db = getDb()
    expect(() =>
      completeHandoff(db, { handoff_id: 'hof_NONEXISTENT', workspace_id: 'ws_1' })
    ).toThrow(expect.objectContaining({ code: 'not_found' }))
  })

  it('can complete a pending handoff directly (no claim required)', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    const completed = completeHandoff(db, { handoff_id: handoff.handoff_id, workspace_id: 'ws_1' })
    expect(completed.status).toBe('completed')
  })
})

describe('inputs JSON round-trip', () => {
  it('preserves nested objects in inputs', () => {
    const db = seed()
    const complexInputs = {
      config: { debug: true, threshold: 0.95 },
      files: ['a.ts', 'b.ts'],
      meta: { tags: ['perf', 'core'], depth: 3 },
    }
    const handoff = createHandoff(db, makeHandoffInput({ inputs: complexInputs }))
    expect(handoff.inputs).toEqual(complexInputs)

    // Verify it also comes back correctly from a fresh read
    const fetched = getHandoff(db, handoff.handoff_id, 'ws_1')
    expect(fetched!.inputs).toEqual(complexInputs)
  })

  it('stores and retrieves empty inputs as {}', () => {
    const db = seed()
    const handoff = createHandoff(db, makeHandoffInput())
    expect(handoff.inputs).toEqual({})
  })
})
