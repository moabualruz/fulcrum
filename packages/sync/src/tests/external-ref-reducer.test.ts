import { describe, it, expect, vi } from 'vitest'
import {
  reduceExternalRef,
  type ExternalRefInput,
  ADAPTER_PLANE,
  ADAPTER_GITHUB,
  ADAPTER_JIRA,
} from '../external-ref-reducer.js'

function mockClient() {
  return {
    isReady: true,
    query: vi.fn().mockResolvedValue([]),
  }
}

describe('reduceExternalRef', () => {
  it('writes external_ref node + shadow_of edge for Plane adapter', async () => {
    const client = mockClient()
    const input: ExternalRefInput = {
      adapter: ADAPTER_PLANE,
      external_id: 'PROJ-123',
      title: 'Fix login bug',
      url: 'https://plane.so/PROJ-123',
      workspace_id: 'ws_1',
      fulcrum_task_id: 'tsk_001',
    }
    await reduceExternalRef(client as unknown as Parameters<typeof reduceExternalRef>[0], input)
    expect(client.query).toHaveBeenCalled()
  })

  it('writes external_ref node + shadow_of edge for GitHub adapter', async () => {
    const client = mockClient()
    const input: ExternalRefInput = {
      adapter: ADAPTER_GITHUB,
      external_id: 'issue/42',
      title: 'Auth middleware regression',
      url: 'https://github.com/org/repo/issues/42',
      workspace_id: 'ws_1',
      fulcrum_task_id: 'tsk_002',
    }
    await reduceExternalRef(client as unknown as Parameters<typeof reduceExternalRef>[0], input)
    expect(client.query).toHaveBeenCalled()
  })

  it('is a no-op when client is not ready', async () => {
    const client = { ...mockClient(), isReady: false }
    await reduceExternalRef(client as unknown as Parameters<typeof reduceExternalRef>[0], {
      adapter: ADAPTER_JIRA,
      external_id: 'JIRA-001',
      title: 'test',
      url: 'https://jira.example.com/JIRA-001',
      workspace_id: 'ws_1',
    })
    expect(client.query).not.toHaveBeenCalled()
  })

  it('ADAPTER constants are defined', () => {
    expect(ADAPTER_PLANE).toBe('plane')
    expect(ADAPTER_GITHUB).toBe('github')
    expect(ADAPTER_JIRA).toBe('jira')
  })
})
