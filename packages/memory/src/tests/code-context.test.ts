// v2b PR 13 Task 4.1 — code_context action tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runCodeContext, type CodeContextInput } from '../code-context.js'

describe('code_context — v2b PR 13 Task 4.1', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
  })

  afterEach(() => {
    resetTestDb()
  })

  it('returns shape with seed, callers, callees, imports, chunks, memories', async () => {
    const result = await runCodeContext({
      symbol: 'writeMemory',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    expect(result).toHaveProperty('seed')
    expect(result).toHaveProperty('callers')
    expect(result).toHaveProperty('callees')
    expect(result).toHaveProperty('imports')
    expect(result).toHaveProperty('chunks')
    expect(result).toHaveProperty('memories')
  })

  it('returns empty groups when Kuzu is not ready (graceful degradation)', async () => {
    const result = await runCodeContext({
      symbol: 'nonexistentSymbol',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    expect(Array.isArray(result.callers)).toBe(true)
    expect(Array.isArray(result.callees)).toBe(true)
    expect(Array.isArray(result.chunks)).toBe(true)
  })

  it('accepts file input as alternative to symbol', async () => {
    const result = await runCodeContext({
      file: 'packages/memory/src/write.ts',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    expect(result).toHaveProperty('seed')
  })
})
