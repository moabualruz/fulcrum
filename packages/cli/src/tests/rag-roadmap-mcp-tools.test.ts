import { describe, expect, it } from 'vitest'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

describe('RAG roadmap MCP/action metadata', () => {
  it('registers roadmap tools with schemas and handlers', () => {
    for (const name of ['get_rag_repair_plan', 'search_context', 'run_rag_eval', 'get_rag_query_trace']) {
      expect(TOOL_SCHEMA_MAP.get(name), `${name} schema should exist`).toBeDefined()
      expect(TOOL_REGISTRY.get(name), `${name} registry entry should exist`).toBeDefined()
      expect(typeof TOOL_REGISTRY.get(name)?.handler).toBe('function')
    }
  })

  it('marks roadmap tool capabilities consistently', () => {
    for (const name of ['get_rag_repair_plan', 'get_rag_query_trace']) {
      expect(TOOL_SCHEMA_MAP.get(name)?.annotations?.readOnlyHint).toBe(true)
      expect(TOOL_REGISTRY.get(name)?.capabilities.readOnly).toBe(true)
      expect(TOOL_REGISTRY.get(name)?.capabilities.destructive).toBe(false)
    }

    expect(TOOL_SCHEMA_MAP.get('search_context')?.inputSchema.properties).toHaveProperty('persist')
    expect(TOOL_SCHEMA_MAP.get('search_context')?.description).toContain('Read-only by default')
    expect(TOOL_REGISTRY.get('search_context')?.capabilities.readOnly).toBe(true)
    expect(TOOL_REGISTRY.get('search_context')?.capabilities.destructive).toBe(false)
    expect(TOOL_SCHEMA_MAP.get('run_rag_eval')?.annotations?.readOnlyHint).not.toBe(true)
    expect(TOOL_REGISTRY.get('run_rag_eval')?.capabilities.readOnly).toBe(false)
    expect(TOOL_REGISTRY.get('run_rag_eval')?.capabilities.destructive).toBe(false)
  })
})
