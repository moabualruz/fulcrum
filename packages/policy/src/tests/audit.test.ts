// packages/policy/src/tests/audit.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { logPolicyEvent, getAuditLog } from '../audit.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('logPolicyEvent', () => {
  it('records a policy event', async () => {
    await logPolicyEvent({
      workspace_id: 'ws_1',
      action: 'invoke_team',
      matched: true,
      actor_id: 'agent_1',
    })
    const log = await getAuditLog({ workspace_id: 'ws_1' })
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('invoke_team')
    expect(log[0].matched).toBe(true)
    expect(log[0].actor_id).toBe('agent_1')
    expect(log[0].evt_id).toMatch(/^pevt_[0-9A-Z]{26}$/)
  })

  it('records multiple events', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'invoke_team', matched: false, actor_id: 'a1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'write_file', matched: true, actor_id: 'a2' })
    const log = await getAuditLog({ workspace_id: 'ws_1' })
    expect(log).toHaveLength(2)
  })

  it('stores optional fields when provided', async () => {
    await logPolicyEvent({
      workspace_id: 'ws_1',
      action: 'merge_worktree',
      matched: true,
      actor_id: 'agent_1',
      rule_id: 'pol_FAKEID',
      resource_type: 'worktree',
      resource_id: 'wt_123',
      payload: { branch: 'feat/auth' },
    })
    const log = await getAuditLog({ workspace_id: 'ws_1' })
    expect(log[0].rule_id).toBe('pol_FAKEID')
    expect(log[0].resource_type).toBe('worktree')
    expect(log[0].resource_id).toBe('wt_123')
    expect(log[0].payload).toEqual({ branch: 'feat/auth' })
  })
})

describe('getAuditLog', () => {
  it('returns events ordered by ts DESC (newest first)', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'first', matched: false, actor_id: 'a1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'second', matched: false, actor_id: 'a2' })
    const log = await getAuditLog({ workspace_id: 'ws_1' })
    // newest first
    expect(log[0].action).toBe('second')
    expect(log[1].action).toBe('first')
  })

  it('filters by actor_id', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'a1-action', matched: false, actor_id: 'agent_1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'a2-action', matched: false, actor_id: 'agent_2' })
    const log = await getAuditLog({ workspace_id: 'ws_1', actor_id: 'agent_1' })
    expect(log).toHaveLength(1)
    expect(log[0].actor_id).toBe('agent_1')
  })

  it('filters by action', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'invoke_team', matched: true, actor_id: 'a1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'write_file', matched: false, actor_id: 'a1' })
    const log = await getAuditLog({ workspace_id: 'ws_1', action: 'invoke_team' })
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('invoke_team')
  })

  it('respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await logPolicyEvent({ workspace_id: 'ws_1', action: `action_${i}`, matched: false, actor_id: 'a1' })
    }
    const log = await getAuditLog({ workspace_id: 'ws_1', limit: 3 })
    expect(log).toHaveLength(3)
  })

  it('respects offset parameter', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'first', matched: false, actor_id: 'a1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'second', matched: false, actor_id: 'a1' })
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'third', matched: false, actor_id: 'a1' })
    // newest first, offset=1 skips 'third' → returns 'second', 'first'
    const log = await getAuditLog({ workspace_id: 'ws_1', limit: 10, offset: 1 })
    expect(log[0].action).toBe('second')
    expect(log[1].action).toBe('first')
  })

  it('does not return events from a different workspace', async () => {
    await logPolicyEvent({ workspace_id: 'ws_1', action: 'ws1-action', matched: false, actor_id: 'a1' })
    await logPolicyEvent({ workspace_id: 'ws_2', action: 'ws2-action', matched: false, actor_id: 'a1' })
    const log = await getAuditLog({ workspace_id: 'ws_1' })
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('ws1-action')
  })
})
