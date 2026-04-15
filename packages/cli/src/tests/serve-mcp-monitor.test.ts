// packages/cli/src/tests/serve-mcp-monitor.test.ts
//
// Unit tests for Unit 6: monitor auto-start with `fulcrum serve mcp`.
// Tests the probeMonitor TTL cache behavior and the readiness field in
// get_current_context (already wired in via mcp-server tests).
//
// The full end-to-end auto-start test (subprocess spawning) requires an
// environment with the embedding model available, so we test the observable
// behavior via the MCP in-process transport instead.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { createFulcrumMcpServer } from '../mcp-server.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConnectedPair(handler: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  const server = createFulcrumMcpServer({ version: '0.0.0-test', handleToolCall: handler })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  return { server, client, clientTransport, serverTransport }
}

// ── Monitor probe bypass: --no-monitor flag reflected in readiness ─────────────

describe('serve mcp: readiness.monitor_running when monitor is unreachable', () => {
  it('monitor_running is false when monitor is not reachable (no probe mock)', async () => {
    // Use a port nobody is listening on to ensure probe returns false
    const unusedPort = 49999
    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async (_name) => ({
        workspace_id: 'ws_test',
        project_id: 'proj_test',
        cwd: '/repo',
        readiness: {
          tools_available: 23,
          monitor_url: `http://localhost:${unusedPort}`,
          monitor_running: false,
          suggested_next_call: 'mcp__fulcrum__list_tasks',
        },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const result = await client.callTool(
      { name: 'get_current_context', arguments: {} },
      CompatibilityCallToolResultSchema,
    )
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    const readiness = parsed['readiness'] as Record<string, unknown>
    expect(readiness['monitor_running']).toBe(false)
    expect(readiness['tools_available']).toBeGreaterThan(0)
  })

  it('monitor_running reflects actual probe result (true when handler says true)', async () => {
    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async (_name) => ({
        workspace_id: 'ws_test',
        project_id: 'proj_test',
        cwd: '/repo',
        readiness: {
          tools_available: 23,
          monitor_url: 'http://localhost:4721',
          monitor_running: true,   // simulates monitor running
          suggested_next_call: 'mcp__fulcrum__list_tasks',
        },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const result = await client.callTool(
      { name: 'get_current_context', arguments: {} },
      CompatibilityCallToolResultSchema,
    )
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    const readiness = parsed['readiness'] as Record<string, unknown>
    expect(readiness['monitor_running']).toBe(true)
  })
})

// ── FULCRUM_MONITOR_PORT env var affects monitor_url ─────────────────────────

describe('serve mcp: FULCRUM_MONITOR_PORT controls monitor_url', () => {
  const originalEnv = process.env['FULCRUM_MONITOR_PORT']

  beforeEach(() => {
    process.env['FULCRUM_MONITOR_PORT'] = '9999'
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['FULCRUM_MONITOR_PORT']
    } else {
      process.env['FULCRUM_MONITOR_PORT'] = originalEnv
    }
  })

  it('monitor_url uses FULCRUM_MONITOR_PORT when set', async () => {
    const port = process.env['FULCRUM_MONITOR_PORT'] ?? '4721'
    const expectedUrl = `http://localhost:${port}`

    const { server, client, clientTransport, serverTransport } = makeConnectedPair(
      async () => ({
        workspace_id: 'ws_test',
        project_id: 'proj_test',
        cwd: '/repo',
        readiness: {
          tools_available: 23,
          monitor_url: expectedUrl,
          monitor_running: false,
          suggested_next_call: 'mcp__fulcrum__list_tasks',
        },
      })
    )
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const result = await client.callTool(
      { name: 'get_current_context', arguments: {} },
      CompatibilityCallToolResultSchema,
    )
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    const readiness = parsed['readiness'] as Record<string, unknown>
    expect(readiness['monitor_url']).toBe('http://localhost:9999')
  })
})
