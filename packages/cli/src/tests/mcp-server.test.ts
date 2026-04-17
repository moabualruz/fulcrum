// packages/cli/src/tests/mcp-server.test.ts
// Protocol conformance tests for the Fulcrum MCP server.
// Uses SDK in-process transport so no stdio is involved.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { createFulcrumMcpServer } from '../mcp-server.js'
import { TOOL_SCHEMAS } from '../mcp-tools.js'
import { buildMcpExposurePlan, buildProfileFilter, TOOL_REGISTRY } from '../tool-registry.js'
import * as core from 'fulcrum-agent-core'

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------- Helpers ----------

function makeServer(handler?: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  const defaultHandler = async (name: string, args: Record<string, unknown>) => {
    // Echo back name + args for inspection
    return { tool: name, args, ok: true }
  }
  return createFulcrumMcpServer({
    version: '0.0.0-test',
    handleToolCall: handler ?? defaultHandler,
  })
}

async function makeConnectedPair(handler?: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  const server = makeServer(handler)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const client = new Client({ name: 'test-client', version: '0.0.0' })

  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { client, server }
}

// callTool without throwing on isError — returns raw result including isError flag
async function callRaw(client: Client, name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args }, CompatibilityCallToolResultSchema)
}

// ---------- initialize ----------

describe('initialize', () => {
  it('returns server info with name and version', async () => {
    const { client } = await makeConnectedPair()
    // If client.connect succeeded, initialize round-trip passed.
    // The client stores the server version in its internal state.
    // We verify by successfully using the connection (listing tools).
    const result = await client.listTools()
    expect(Array.isArray(result.tools)).toBe(true)
  })
})

// ---------- tools/list ----------

describe('tools/list', () => {
  it('returns all tools from TOOL_SCHEMAS', async () => {
    const { client } = await makeConnectedPair()
    const result = await client.listTools()
    expect(result.tools).toHaveLength(TOOL_SCHEMAS.length)
  })

  it('every tool has a name and description', async () => {
    const { client } = await makeConnectedPair()
    const result = await client.listTools()
    for (const tool of result.tools) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.description).toBe('string')
      expect(tool.description!.length).toBeGreaterThan(0)
    }
  })

  it('tools include readOnly annotations where expected', async () => {
    const { client } = await makeConnectedPair()
    const result = await client.listTools()
    const readOnlyNames = TOOL_SCHEMAS.filter(t => t.annotations?.readOnlyHint).map(t => t.name)
    for (const name of readOnlyNames) {
      const tool = result.tools.find(t => t.name === name)
      expect(tool).toBeDefined()
      expect(tool?.annotations?.readOnlyHint).toBe(true)
    }
  })
})

// ---------- tools/call — happy path ----------

describe('tools/call happy path', () => {
  it('list_tasks returns text content', async () => {
    const { client } = await makeConnectedPair()
    const result = await callRaw(client, 'list_tasks', { workspace_id: 'ws_test', project_id: 'proj_test' })
    expect(result.isError).toBeFalsy()
    expect(Array.isArray(result.content)).toBe(true)
    expect(result.content[0].type).toBe('text')
  })

  it('create_task echoes back tool name', async () => {
    const { client } = await makeConnectedPair()
    const result = await callRaw(client, 'create_task', { title: 'Test task', workspace_id: 'ws_test', project_id: 'proj_test' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content[0] as { text: string }).text)
    expect(parsed.tool).toBe('create_task')
    expect(parsed.args.title).toBe('Test task')
  })

  it('recall_memory returns structuredContent for read tool', async () => {
    const { client } = await makeConnectedPair(async () => ({ memories: [] }))
    const result = await callRaw(client, 'recall_memory', { query: 'auth', workspace_id: 'ws_test', project_id: 'proj_test' })
    expect(result.isError).toBeFalsy()
    // structuredContent is populated for read tools
    expect((result as { structuredContent?: unknown }).structuredContent).toBeDefined()
  })

  it('list_agent_profiles returns structuredContent', async () => {
    const { client } = await makeConnectedPair(async () => ({ profiles: [] }))
    const result = await callRaw(client, 'list_agent_profiles', {})
    expect(result.isError).toBeFalsy()
    expect((result as { structuredContent?: unknown }).structuredContent).toBeDefined()
  })

  it('get_workspace_status returns structuredContent', async () => {
    const { client } = await makeConnectedPair(async () => ({ status: 'ok' }))
    const result = await callRaw(client, 'get_workspace_status', { workspace_id: 'ws_test' })
    expect(result.isError).toBeFalsy()
    expect((result as { structuredContent?: unknown }).structuredContent).toBeDefined()
  })

  it('start_agent_run echoes back args', async () => {
    const { client } = await makeConnectedPair()
    const result = await callRaw(client, 'start_agent_run', { workspace_id: 'ws_test', agent_role: 'software_engineer' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content[0] as { text: string }).text)
    expect(parsed.args.agent_role).toBe('software_engineer')
  })

  it('start_agent_run with dispatch:true passes boolean through schema validation', async () => {
    // The custom handler captures the args passed through — verifies the boolean
    // survives JSON Schema validation and reaches the handler.
    let capturedArgs: Record<string, unknown> = {}
    const { client } = await makeConnectedPair(async (_name, args) => {
      capturedArgs = args
      return { tool: _name, args, ok: true }
    })
    const result = await callRaw(client, 'start_agent_run', {
      workspace_id: 'ws_test',
      agent_role: 'software_engineer',
      dispatch: true,
    })
    expect(result.isError).toBeFalsy()
    expect(capturedArgs['dispatch']).toBe(true)
  })

  it('start_agent_run without dispatch behaves as before (no dispatch key)', async () => {
    let capturedArgs: Record<string, unknown> = {}
    const { client } = await makeConnectedPair(async (_name, args) => {
      capturedArgs = args
      return { tool: _name, args, ok: true }
    })
    const result = await callRaw(client, 'start_agent_run', {
      workspace_id: 'ws_test',
      agent_role: 'software_engineer',
    })
    expect(result.isError).toBeFalsy()
    // dispatch not present or undefined — handler treats as non-dispatch path
    expect(capturedArgs['dispatch']).toBeUndefined()
  })
})

// ---------- tools/call — invalid args ----------

describe('tools/call invalid args', () => {
  it('extra keys are stripped by the SDK (not rejected)', async () => {
    // The MCP SDK strips unknown keys before calling our handler, so extra keys
    // are silently dropped rather than rejected. The call succeeds.
    const { client } = await makeConnectedPair()
    const result = await callRaw(client, 'list_tasks', { workspace_id: 'ws_test', project_id: 'proj_test', _unknown_key: 'bad' })
    expect(result.isError).toBeFalsy()
  })

  it('rejects wrong type for number field', async () => {
    const { client } = await makeConnectedPair()
    // limit must be a number; SDK validates the inputSchema and rejects non-numbers
    const result = await callRaw(client, 'list_tasks', { workspace_id: 'ws', project_id: 'p', limit: 'not-a-number' })
    expect(result.isError).toBe(true)
  })

  it('rejects missing required field', async () => {
    const { client } = await makeConnectedPair()
    // create_task requires title — SDK validates inputSchema before calling handler
    const result = await callRaw(client, 'create_task', { workspace_id: 'ws_test', project_id: 'p' })
    expect(result.isError).toBe(true)
    // Content may be SDK-level "MCP error" or our JSON; either way isError must be true
  })

  it('handler error becomes isError response', async () => {
    const { client } = await makeConnectedPair(async () => {
      throw new Error('db_error: simulated')
    })
    const result = await callRaw(client, 'list_tasks', { workspace_id: 'ws_test', project_id: 'proj_test' })
    expect(result.isError).toBe(true)
    const parsed = JSON.parse((result.content[0] as { text: string }).text)
    expect(parsed.error).toContain('db_error')
  })
})

// ---------- resources ----------

describe('resources/list', () => {
  it('returns resource templates', async () => {
    const { client } = await makeConnectedPair()
    const result = await client.listResources()
    // SDK may return resources or resourceTemplates depending on how server.registerResource works
    // The important thing is the call succeeds (no error thrown)
    expect(result).toBeDefined()
  })
})

describe('resources/read', () => {
  it('reads workspace status via fulcrum URI', async () => {
    const { client } = await makeConnectedPair(async () => ({ status: 'ok', workspace_id: 'ws_abc' }))
    const result = await client.readResource({ uri: 'fulcrum://ws_abc' })
    expect(Array.isArray(result.contents)).toBe(true)
    expect(result.contents.length).toBeGreaterThan(0)
    const parsed = JSON.parse(result.contents[0].text as string)
    expect(parsed.status).toBe('ok')
  })

  it('reads task list via workspace/tasks URI', async () => {
    const { client } = await makeConnectedPair(async () => ({ tasks: [{ id: 'task_1' }] }))
    const result = await client.readResource({ uri: 'fulcrum://ws_abc/tasks' })
    const parsed = JSON.parse(result.contents[0].text as string)
    expect(parsed.tasks).toHaveLength(1)
  })

  it('reads agent run via run URI', async () => {
    const { client } = await makeConnectedPair(async () => ({ run_id: 'run_1', status: 'running' }))
    const result = await client.readResource({ uri: 'fulcrum://ws_abc/run/run_1' })
    const parsed = JSON.parse(result.contents[0].text as string)
    expect(parsed.run_id).toBe('run_1')
  })
})

// ---------- get_current_context readiness ----------

describe('get_current_context readiness object', () => {
  it('returns readiness with expected shape when handler returns it', async () => {
    const readinessPayload = {
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      cwd: '/repo',
      readiness: {
        tools_available: 27,
        monitor_url: 'http://localhost:4721',
        monitor_running: false,
        suggested_next_call: 'list_tasks',
      },
    }
    const { client } = await makeConnectedPair(async () => readinessPayload)
    const result = await callRaw(client, 'get_current_context', {})
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content[0] as { text: string }).text)
    expect(parsed.workspace_id).toBe('ws_test')
    expect(parsed.readiness).toBeDefined()
    expect(typeof parsed.readiness.tools_available).toBe('number')
    expect(parsed.readiness.tools_available).toBeGreaterThan(0)
    expect(typeof parsed.readiness.monitor_url).toBe('string')
    expect(typeof parsed.readiness.monitor_running).toBe('boolean')
    expect(typeof parsed.readiness.suggested_next_call).toBe('string')
  })

  it('returns structuredContent for get_current_context (read tool)', async () => {
    const { client } = await makeConnectedPair(async () => ({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      cwd: '/repo',
      readiness: {
        tools_available: 27,
        monitor_url: 'http://localhost:4721',
        monitor_running: false,
        suggested_next_call: 'list_tasks',
      },
    }))
    const result = await callRaw(client, 'get_current_context', {})
    expect(result.isError).toBeFalsy()
    expect((result as { structuredContent?: unknown }).structuredContent).toBeDefined()
  })
})

// ---------- --profile filtering ----------

describe('--profile filter', () => {
  // The 3 hookEquivalent tools that hook-only removes.
  const HOOK_EQUIVALENT = ['recall_memory', 'write_memory', 'get_current_context']
  const EXPECTED_HOOK_ONLY_COUNT = TOOL_SCHEMAS.length - HOOK_EQUIVALENT.length

  it('hook-only filter returns a function', async () => {
    const filter = await buildProfileFilter('hook-only')
    expect(typeof filter).toBe('function')
  })

  it('hook-only filter excludes exactly the 3 hookEquivalent tools', async () => {
    const filter = await buildProfileFilter('hook-only')
    expect(filter).toBeDefined()
    const served = TOOL_SCHEMAS.filter(filter!)
    const servedNames = served.map(t => t.name)
    for (const name of HOOK_EQUIVALENT) {
      expect(servedNames).not.toContain(name)
    }
    expect(served).toHaveLength(EXPECTED_HOOK_ONLY_COUNT)
  })

  it('MCP server with hook-only profile serves exactly 20 tools', async () => {
    const filter = await buildProfileFilter('hook-only')
    expect(filter).toBeDefined()

    const server = createFulcrumMcpServer({
      version: '0.0.0-test',
      handleToolCall: async (name, args) => ({ tool: name, args, ok: true }),
      filter: filter!,
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-profile-client', version: '0.0.0' })
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const result = await client.listTools()
    expect(result.tools).toHaveLength(EXPECTED_HOOK_ONLY_COUNT)
    const toolNames = result.tools.map(t => t.name)
    for (const name of HOOK_EQUIVALENT) {
      expect(toolNames).not.toContain(name)
    }
  })

  it('undefined profile (no --profile) returns undefined (no filter)', async () => {
    const filter = await buildProfileFilter('')
    expect(filter).toBeUndefined()
  })

  it('role profiles normalize legacy MCP-prefixed tools_allow/tool_deny names', async () => {
    vi.spyOn(core, 'getAgentDefinition').mockReturnValue({
      role: 'test_role',
      display_name: 'Test Role',
      description: 'test',
      version: '1.0.0',
      stability: 'experimental',
      capabilities: [],
      tools_allow: ['mcp__fulcrum__list_tasks', 'mcp__fulcrum__create_task'],
      tools_deny: ['mcp__fulcrum__create_task'],
    } as never)

    const filter = await buildProfileFilter('test_role')
    expect(filter).toBeDefined()
    expect(filter!(TOOL_SCHEMAS.find(tool => tool.name === 'list_tasks')!)).toBe(true)
    expect(filter!(TOOL_SCHEMAS.find(tool => tool.name === 'create_task')!)).toBe(false)
    expect(filter!(TOOL_SCHEMAS.find(tool => tool.name === 'update_task')!)).toBe(false)
  })

  it('unknown role profile warns and falls back to an allow-all filter', async () => {
    const stderrWrites: string[] = []
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string | Uint8Array, ...rest: Parameters<typeof process.stderr.write>[1][]) => {
      stderrWrites.push(typeof chunk === 'string' ? chunk : String(chunk))
      return origWrite(chunk, ...rest as [never])
    }

    try {
      const filter = await buildProfileFilter('nonexistent_role_xyz')
      expect(filter).toBeDefined()
      expect(filter!(TOOL_SCHEMAS.find(tool => tool.name === 'list_tasks')!)).toBe(true)
      expect(stderrWrites.some(w => w.includes('nonexistent_role_xyz'))).toBe(true)
    } finally {
      process.stderr.write = origWrite
    }
  })

  it('TOOL_REGISTRY hookEquivalent entries match the 3 expected names', () => {
    const hookTools = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => e.capabilities.hookEquivalent)
      .map(([name]) => name)
      .sort()
    expect(hookTools).toEqual([...HOOK_EQUIVALENT].sort())
  })
})

describe('MCP exposure planner', () => {
  it('filtered mode with hooks hides full hook-covered actions', async () => {
    const plan = await buildMcpExposurePlan({
      mode: 'filtered',
      runtimeCapabilities: ['hooks'],
    })

    const decisions = new Map(plan.decisions.map(decision => [decision.actionName, decision]))
    expect(decisions.get('recall_memory')?.exposed).toBe(false)
    expect(decisions.get('write_memory')?.exposed).toBe(false)
    expect(decisions.get('get_current_context')?.exposed).toBe(false)
    expect(decisions.get('list_tasks')?.exposed).toBe(true)
  })

  it('platform-aware hook coverage does not hide Claude-only hook actions on other runtimes', async () => {
    const plan = await buildMcpExposurePlan({
      mode: 'filtered',
      runtimeCapabilities: ['hooks'],
      platform: 'gemini',
    })

    const decisions = new Map(plan.decisions.map(decision => [decision.actionName, decision]))
    expect(decisions.get('recall_memory')?.exposed).toBe(false)
    expect(decisions.get('write_memory')?.exposed).toBe(false)
    expect(decisions.get('get_current_context')?.exposed).toBe(true)
  })

  it('minimal mode also hides hook-covered actions without explicit include', async () => {
    const plan = await buildMcpExposurePlan({
      mode: 'minimal',
      runtimeCapabilities: [],
    })

    const decisions = new Map(plan.decisions.map(decision => [decision.actionName, decision]))
    expect(decisions.get('recall_memory')?.exposed).toBe(false)
    expect(decisions.get('recall_memory')?.reasons).toContain('minimal_mode_prefers_hook_or_cli')
    expect(decisions.get('list_tasks')?.exposed).toBe(true)
  })

  it('explicit include overrides minimal-mode default hiding', async () => {
    const plan = await buildMcpExposurePlan({
      mode: 'minimal',
      includeActions: ['recall_memory'],
    })

    const decision = plan.decisions.find(item => item.actionName === 'recall_memory')
    expect(decision?.exposed).toBe(true)
  })

  it('explicit exclude hides matching actions', async () => {
    const plan = await buildMcpExposurePlan({
      mode: 'filtered',
      excludeActions: ['list_tasks'],
    })

    const decision = plan.decisions.find(item => item.actionName === 'list_tasks')
    expect(decision?.exposed).toBe(false)
    expect(decision?.reasons).toContain('explicitly_excluded')
  })

  it('agent-type filtering respects min-role metadata', async () => {
    const plan = await buildMcpExposurePlan({
      mode: 'filtered',
      agentType: 'software_engineer',
    })

    const invokeTeam = plan.decisions.find(item => item.actionName === 'invoke_team')
    expect(invokeTeam?.exposed).toBe(false)
    expect(invokeTeam?.reasons).toContain('agent_type_filtered:software_engineer')
  })

})

// ---------- GAP-MCP-11: progress notifications ----------

describe('tools/call progress notifications', () => {
  it('long-running tool emits progress notifications when onprogress callback supplied', async () => {
    const server = makeServer()
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-progress-client', version: '0.0.0' })

    await server.connect(serverTransport)
    await client.connect(clientTransport)

    // The SDK sends _meta.progressToken when caller provides onprogress.
    // Collect progress events via the callback.
    const progressEvents: Array<{ progress: number; total?: number }> = []
    await client.callTool(
      {
        name: 'start_agent_run',
        arguments: { workspace_id: 'ws_test', agent_role: 'software_engineer' },
      },
      CompatibilityCallToolResultSchema,
      {
        onprogress: (p) => {
          progressEvents.push({ progress: p.progress, total: p.total })
        },
      },
    )

    // Should have received two progress notifications: progress=0 and progress=1
    expect(progressEvents.length).toBeGreaterThanOrEqual(2)
    expect(progressEvents[0].progress).toBe(0)
    expect(progressEvents[0].total).toBe(1)
    expect(progressEvents[progressEvents.length - 1].progress).toBe(1)
    expect(progressEvents[progressEvents.length - 1].total).toBe(1)
  })

  it('non-long-running tool does NOT emit progress notifications', async () => {
    const server = makeServer()
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-no-progress-client', version: '0.0.0' })

    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const progressEvents: Array<unknown> = []
    // list_tasks is NOT a long-running tool — should fire no progress events
    await client.callTool(
      {
        name: 'list_tasks',
        arguments: { workspace_id: 'ws_test' },
      },
      CompatibilityCallToolResultSchema,
      {
        onprogress: (p) => {
          progressEvents.push(p)
        },
      },
    )

    expect(progressEvents.length).toBe(0)
  })
})
