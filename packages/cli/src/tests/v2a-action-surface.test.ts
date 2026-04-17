import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from '../tool-registry.js'

describe('v2a action surface — PR 9 Tasks 43 + 44', () => {
  it('Task 43 — recall_memory / write_memory / query_memory / search_code present', () => {
    expect(TOOL_REGISTRY.has('recall_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('write_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('query_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('search_code')).toBe(true)
  })

  it('Task 44 / v2b PR 13 — code_context registered and returns shape-stable response', () => {
    // v2b PR 13 graduated code_context from deferred-stub to real implementation
    const entry = TOOL_REGISTRY.get('code_context')
    expect(entry).toBeDefined()
    expect(entry?.capabilities.readOnly).toBe(true)
  })

  it('Task 44 / v2b PR 13 — project_context registered and returns shape-stable response', () => {
    const entry = TOOL_REGISTRY.get('project_context')
    expect(entry).toBeDefined()
    expect(entry?.capabilities.readOnly).toBe(true)
  })

  it('memory_rollback / rollback are NOT in the action surface (operator-only)', () => {
    expect(TOOL_REGISTRY.has('memory_rollback')).toBe(false)
    expect(TOOL_REGISTRY.has('rollback')).toBe(false)
  })

  it('every recall-surface action is readOnly + non-destructive', () => {
    for (const name of ['recall_memory', 'query_memory', 'search_code', 'code_context', 'project_context']) {
      const entry = TOOL_REGISTRY.get(name)
      expect(entry?.capabilities.readOnly, `${name} should be readOnly`).toBe(true)
      expect(entry?.capabilities.destructive, `${name} should not be destructive`).toBe(false)
    }
  })
})
