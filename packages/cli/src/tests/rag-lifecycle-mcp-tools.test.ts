import { describe, expect, it } from 'vitest'
import { TOOL_SCHEMAS } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

const byName = new Map(TOOL_SCHEMAS.map(tool => [tool.name, tool]))

describe('RAG lifecycle MCP tool metadata', () => {
  it('registers snake_case RAG lifecycle tool schemas', () => {
    for (const name of ['get_rag_rebuild_plan', 'get_rag_rebuild_dry_run', 'start_rag_rebuild', 'get_rag_rebuild_report']) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(byName.get(name), `${name} schema should exist`).toBeDefined()
      expect(TOOL_REGISTRY.get(name), `${name} registry entry should exist`).toBeDefined()
    }
  })

  it('uses read-only and destructive hints that match registry capabilities', () => {
    expect(byName.get('get_rag_rebuild_plan')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_rebuild_plan')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_rag_rebuild_dry_run')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_rebuild_dry_run')?.capabilities.readOnly).toBe(true)

    expect(byName.get('get_rag_rebuild_report')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_REGISTRY.get('get_rag_rebuild_report')?.capabilities.readOnly).toBe(true)

    expect(byName.get('start_rag_rebuild')?.annotations?.destructiveHint).toBe(true)
    expect(TOOL_REGISTRY.get('start_rag_rebuild')?.capabilities.destructive).toBe(true)
  })

  it('does not accept caller-supplied actor identity on destructive MCP tools', () => {
    const properties = byName.get('start_rag_rebuild')?.inputSchema.properties ?? {}
    expect(properties).not.toHaveProperty('actor')
  })
})
