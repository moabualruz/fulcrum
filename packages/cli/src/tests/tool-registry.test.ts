// packages/cli/src/tests/tool-registry.test.ts
// Phase 2 + Phase 4: verify registry structure, capability completeness, and
// that all public tool schemas have corresponding registry entries.

import { describe, it, expect, afterEach } from 'vitest'
import { TOOL_REGISTRY, getActionDefinition, getRegistryEntry, listActionDefinitions, setAdditionalActionDefinitions } from '../tool-registry.js'
import { TOOL_SCHEMAS } from '../mcp-tools.js'

afterEach(() => {
  setAdditionalActionDefinitions([])
})

describe('TOOL_REGISTRY', () => {
  it('every public tool schema has a registry entry', () => {
    const missing = TOOL_SCHEMAS.filter(t => !TOOL_REGISTRY.has(t.name)).map(t => t.name)
    expect(missing, `Missing registry entries: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('every registry entry has a complete capabilities object', () => {
    const violations: string[] = []
    for (const [name, entry] of TOOL_REGISTRY) {
      const caps = entry.capabilities
      if (typeof caps.readOnly !== 'boolean') violations.push(`${name}: readOnly missing`)
      if (typeof caps.destructive !== 'boolean') violations.push(`${name}: destructive missing`)
      if (typeof caps.hookEquivalent !== 'boolean') violations.push(`${name}: hookEquivalent missing`)
    }
    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  it('readOnly capability matches readOnlyHint in tool schema', () => {
    const mismatches: string[] = []
    for (const [name, entry] of TOOL_REGISTRY) {
      if (!entry.schema) continue  // internal tools (e.g. get_task) skip schema check
      const hint = entry.schema.annotations?.readOnlyHint ?? false
      if (hint !== entry.capabilities.readOnly) {
        mismatches.push(`${name}: schema readOnlyHint=${hint} but capabilities.readOnly=${entry.capabilities.readOnly}`)
      }
    }
    expect(mismatches, mismatches.join('\n')).toHaveLength(0)
  })

  it('hookEquivalent is true only for the 3 expected tools', () => {
    const hookTools = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => e.capabilities.hookEquivalent)
      .map(([name]) => name)
      .sort()
    expect(hookTools).toEqual(['get_current_context', 'recall_memory', 'write_memory'])
  })

  it('minRole is set only for invoke_team', () => {
    const withMinRole = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => e.capabilities.minRole !== undefined)
      .map(([name]) => name)
    expect(withMinRole).toEqual(['invoke_team'])
    expect(TOOL_REGISTRY.get('invoke_team')?.capabilities.minRole).toBe('chief_of_staff')
  })

  it('every entry has a handler function', () => {
    const missing = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => typeof e.handler !== 'function')
      .map(([name]) => name)
    expect(missing, `Missing handler functions: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('get_task is internal (no schema) but has capabilities', () => {
    const entry = TOOL_REGISTRY.get('get_task')
    expect(entry).toBeDefined()
    expect(entry!.schema).toBeUndefined()
    expect(entry!.capabilities.readOnly).toBe(true)
    expect(entry!.capabilities.hookEquivalent).toBe(false)
  })

  it('TOOL_REGISTRY contains more entries than TOOL_SCHEMAS (includes internal tools)', () => {
    expect(TOOL_REGISTRY.size).toBeGreaterThan(TOOL_SCHEMAS.length)
    // Specifically: public tool schemas + 7 internal (get_task, query_memory,
    // search_code, code_context, project_context, list_activations,
    // graph_consistency_check)
    expect(TOOL_REGISTRY.size).toBe(TOOL_SCHEMAS.length + 7)
  })

  it('builds canonical action metadata for public actions', () => {
    const action = getActionDefinition('list_tasks')
    expect(action).toBeDefined()
    expect(action?.action_name).toBe('list_tasks')
    expect(action?.cli.primaryCommand).toEqual(['action', 'exec', 'list_tasks'])
    expect(action?.cli.compatibilityCommand).toEqual(['tool', 'exec', 'list_tasks'])
    expect(action?.mcp.toolName).toBe('list_tasks')
    expect(action?.fallbackOrder).toEqual(['cli', 'mcp'])
  })

  it('builds richer hook metadata for hook-covered actions', () => {
    const action = getActionDefinition('get_current_context')
    expect(action?.hooks.coverage).toBe('full')
    expect(action?.hooks.nativePoints).toContain('claude.session_start')
    expect(action?.hooks.nativePlatforms).toEqual(['claude'])
  })


  it('resolves legacy MCP-prefixed action names to the same registry entry', () => {
    const direct = getRegistryEntry('list_tasks')
    const prefixed = getRegistryEntry('mcp__fulcrum__list_tasks')
    expect(prefixed).toBe(direct)
  })

  it('lists action definitions for all public MCP-exposed actions', () => {
    const actions = listActionDefinitions()
    expect(actions).toHaveLength(TOOL_SCHEMAS.length)
    expect(actions.some(action => action.action_name === 'list_tasks')).toBe(true)
    expect(actions.every(action => action.mcp.toolName)).toBe(true)
  })

  it('includes additional plugin action definitions in the canonical action list', () => {
    setAdditionalActionDefinitions([
      {
        action_name: 'plugin_sample',
        mcp: {
          title: 'Plugin Sample',
          name: 'plugin_sample',
          description: 'Plugin sample tool',
          inputSchema: { type: 'object', properties: {} },
        },
      },
    ])

    const action = getActionDefinition('plugin_sample')
    expect(action?.action_name).toBe('plugin_sample')
    expect(listActionDefinitions().some(entry => entry.action_name === 'plugin_sample')).toBe(true)
  })
})
