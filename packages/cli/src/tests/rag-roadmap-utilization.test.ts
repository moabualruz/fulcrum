import { describe, expect, it } from 'vitest'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

describe('RAG roadmap integration utilization', () => {
  it('wires new roadmap registry entries to their MCP schemas', () => {
    for (const name of ['get_rag_repair_plan', 'search_context', 'run_rag_eval', 'get_rag_query_trace']) {
      const entry = TOOL_REGISTRY.get(name)
      expect(entry?.schema).toBe(TOOL_SCHEMA_MAP.get(name))
      expect(typeof entry?.handler).toBe('function')
    }
  })

  it('exposes memory primitives through registry-backed handlers', () => {
    expect(TOOL_REGISTRY.get('get_rag_repair_plan')?.handler.toString()).toContain('executeRagRepairPlanCommand')
    expect(TOOL_REGISTRY.get('search_context')?.handler.toString()).toContain('searchContext')
    expect(TOOL_REGISTRY.get('get_rag_query_trace')?.handler.toString()).toContain('readRagQueryTrace')
  })
})
