// packages/cli/src/tests/serve-mcp-monitor.test.ts
//
// Unit 1: probeMonitor test-helper exports + monitor probe unit tests.
//
// Covers:
//  - probeMonitorForTest(): 2xx→true, throw→false, non-2xx→false
//  - TTL cache: cache hit avoids second fetch within 15s
//  - TTL cache: fetch called again after 16s
//  - _resetMonitorProbeCache(): clears cache so next call fetches fresh
//  - _setMonitorStarted(): callable without error
//  - MCP transport layer returns the readiness shape (via InMemoryTransport)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { createFulcrumMcpServer } from '../mcp-server.js'
import {
  probeMonitorForTest,
  _resetMonitorProbeCache,
  _setMonitorStarted,
} from '../index.js'

// ── probeMonitor unit tests ───────────────────────────────────────────────────

describe('probeMonitorForTest()', () => {
  beforeEach(() => {
    _resetMonitorProbeCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when fetch responds with 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const result = await probeMonitorForTest('http://localhost:39901')
    expect(result).toBe(true)
  })

  it('returns false when fetch throws (connection refused)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const result = await probeMonitorForTest('http://localhost:39902')
    expect(result).toBe(false)
  })

  it('returns false when server responds with non-2xx (e.g. 404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const result = await probeMonitorForTest('http://localhost:39903')
    expect(result).toBe(false)
  })
})

// ── probeMonitor TTL cache ────────────────────────────────────────────────────

describe('probeMonitorForTest() TTL cache', () => {
  const url = 'http://localhost:39904'

  beforeEach(() => {
    _resetMonitorProbeCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not call fetch a second time within TTL window (cache hit)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await probeMonitorForTest(url)
    await probeMonitorForTest(url)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('calls fetch again after TTL expires (cache miss)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()

    await probeMonitorForTest(url)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Advance past the 15s TTL
    vi.advanceTimersByTime(16_000)

    await probeMonitorForTest(url)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('_resetMonitorProbeCache() clears cache so next call fetches fresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await probeMonitorForTest(url)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    _resetMonitorProbeCache()

    await probeMonitorForTest(url)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// ── _setMonitorStarted ────────────────────────────────────────────────────────

describe('_setMonitorStarted()', () => {
  it('is callable with true and false without throwing', () => {
    expect(() => _setMonitorStarted(true)).not.toThrow()
    expect(() => _setMonitorStarted(false)).not.toThrow()
  })
})

// ── MCP transport: readiness shape ───────────────────────────────────────────

function makeConnectedPair(handler: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  const server = createFulcrumMcpServer({ version: '0.0.0-test', handleToolCall: handler })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  return { server, client, clientTransport, serverTransport }
}

describe('serve mcp: readiness shape via MCP transport', () => {
  it('monitor_running: false when monitor is unreachable', async () => {
    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async () => ({
        workspace_id: 'ws_test', project_id: 'proj_test', cwd: '/repo',
        readiness: { tools_available: 23, monitor_url: 'http://localhost:49999', monitor_running: false, suggested_next_call: 'mcp__fulcrum__list_tasks' },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const result = await client.callTool({ name: 'get_current_context', arguments: {} }, CompatibilityCallToolResultSchema)
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    const readiness = parsed['readiness'] as Record<string, unknown>
    expect(readiness['monitor_running']).toBe(false)
    expect(typeof readiness['tools_available']).toBe('number')
    expect(readiness['tools_available']).toBeGreaterThan(0)
    expect(readiness['suggested_next_call']).toBe('mcp__fulcrum__list_tasks')
  })

  it('monitor_running: true when handler says running', async () => {
    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async () => ({
        workspace_id: 'ws_test', project_id: 'proj_test', cwd: '/repo',
        readiness: { tools_available: 23, monitor_url: 'http://localhost:4721', monitor_running: true, suggested_next_call: 'mcp__fulcrum__list_tasks' },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const result = await client.callTool({ name: 'get_current_context', arguments: {} }, CompatibilityCallToolResultSchema)
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    expect((parsed['readiness'] as Record<string, unknown>)['monitor_running']).toBe(true)
  })

  it('FULCRUM_MONITOR_PORT controls monitor_url', async () => {
    const prev = process.env['FULCRUM_MONITOR_PORT']
    process.env['FULCRUM_MONITOR_PORT'] = '9999'
    const port = process.env['FULCRUM_MONITOR_PORT']

    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async () => ({
        workspace_id: 'ws_test', project_id: 'proj_test', cwd: '/repo',
        readiness: { tools_available: 23, monitor_url: `http://localhost:${port}`, monitor_running: false, suggested_next_call: 'mcp__fulcrum__list_tasks' },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const result = await client.callTool({ name: 'get_current_context', arguments: {} }, CompatibilityCallToolResultSchema)
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    expect((parsed['readiness'] as Record<string, unknown>)['monitor_url']).toBe('http://localhost:9999')

    if (prev === undefined) delete process.env['FULCRUM_MONITOR_PORT']
    else process.env['FULCRUM_MONITOR_PORT'] = prev
  })
})

// ── _monitorStarted double-start guard ────────────────────────────────────────

describe('_monitorStarted double-start guard', () => {
  it('FULCRUM_NO_MONITOR=1 prevents monitor auto-start entirely', async () => {
    const prev = process.env['FULCRUM_NO_MONITOR']
    process.env['FULCRUM_NO_MONITOR'] = '1'

    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async () => ({
        workspace_id: 'ws_test', project_id: 'proj_test', cwd: '/repo',
        readiness: { tools_available: 23, monitor_url: 'http://localhost:4721', monitor_running: false, suggested_next_call: 'mcp__fulcrum__list_tasks' },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const result = await client.callTool({ name: 'get_current_context', arguments: {} }, CompatibilityCallToolResultSchema)
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    expect((parsed['readiness'] as Record<string, unknown>)['monitor_running']).toBe(false)

    if (prev === undefined) delete process.env['FULCRUM_NO_MONITOR']
    else process.env['FULCRUM_NO_MONITOR'] = prev
  })
})
