import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from '../tool-registry.js'

describe('memory rollback — v2a PR 5 Task 28 (operator-only)', () => {
  it('memory_rollback is NOT registered in the action surface', () => {
    expect(TOOL_REGISTRY.has('memory_rollback')).toBe(false)
    expect(TOOL_REGISTRY.has('rollback')).toBe(false)
  })

  it('the action registry exposes recall_memory + write_memory + query_memory + search_code (smoke check)', () => {
    expect(TOOL_REGISTRY.has('recall_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('write_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('query_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('search_code')).toBe(true)
  })
})
