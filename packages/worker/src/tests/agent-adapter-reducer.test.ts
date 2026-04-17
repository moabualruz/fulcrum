import { describe, it, expect, vi } from 'vitest'
import {
  reduceAgentAdapter,
  computeAdapterId,
  type AgentAdapterInput,
} from '../agent-adapter-reducer.js'

function mockClient() {
  return {
    isReady: true,
    query: vi.fn().mockResolvedValue([]),
  }
}

describe('computeAdapterId', () => {
  it('returns 32-char hex string', () => {
    const id = computeAdapterId('claude-code://', 'claude-sonnet-4-6', '2.0.0')
    expect(typeof id).toBe('string')
    expect(id.length).toBe(32)
  })

  it('is deterministic for same inputs', () => {
    const a = computeAdapterId('claude-code://', 'claude-sonnet-4-6', '2.0.0')
    const b = computeAdapterId('claude-code://', 'claude-sonnet-4-6', '2.0.0')
    expect(a).toBe(b)
  })

  it('differs for different inputs', () => {
    const a = computeAdapterId('claude-code://', 'claude-sonnet-4-6', '2.0.0')
    const b = computeAdapterId('pi://', 'claude-sonnet-4-6', '2.0.0')
    expect(a).not.toBe(b)
  })
})

describe('reduceAgentAdapter', () => {
  it('writes agent_adapter node', async () => {
    const client = mockClient()
    const input: AgentAdapterInput = {
      executor_uri: 'claude-code://',
      model: 'claude-sonnet-4-6',
      version: '2.0.0',
      workspace_id: 'ws_1',
    }
    await reduceAgentAdapter(client as Parameters<typeof reduceAgentAdapter>[0], input)
    expect(client.query).toHaveBeenCalled()
  })

  it('is a no-op when client is not ready', async () => {
    const client = { ...mockClient(), isReady: false }
    await reduceAgentAdapter(client as Parameters<typeof reduceAgentAdapter>[0], {
      executor_uri: 'pi://',
      model: 'claude-haiku-4-5',
      version: '1.0.0',
      workspace_id: 'ws_1',
    })
    expect(client.query).not.toHaveBeenCalled()
  })
})
