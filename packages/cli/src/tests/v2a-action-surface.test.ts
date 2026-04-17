import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from '../tool-registry.js'

describe('v2a action surface — PR 9 Tasks 43 + 44', () => {
  it('Task 43 — recall_memory / write_memory / query_memory / search_code present', () => {
    expect(TOOL_REGISTRY.has('recall_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('write_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('query_memory')).toBe(true)
    expect(TOOL_REGISTRY.has('search_code')).toBe(true)
  })

  it('Task 44 — code_context registered as v2b-deferred shape-stable stub', async () => {
    const entry = TOOL_REGISTRY.get('code_context')
    expect(entry).toBeDefined()
    const result = await entry!.handler({}, {
      db: undefined as never,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    } as Parameters<typeof entry.handler>[1]) as { results: unknown[]; reason?: string; message?: string }
    expect(result.results).toEqual([])
    expect(result.reason).toBe('deferred-v2b')
    expect(result.message).toMatch(/v2b/)
  })

  it('Task 44 — project_context registered as v2b-deferred shape-stable stub', async () => {
    const entry = TOOL_REGISTRY.get('project_context')
    expect(entry).toBeDefined()
    const result = await entry!.handler({}, {
      db: undefined as never,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    } as Parameters<typeof entry.handler>[1]) as { results: unknown[]; reason?: string; message?: string }
    expect(result.results).toEqual([])
    expect(result.reason).toBe('deferred-v2b')
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
