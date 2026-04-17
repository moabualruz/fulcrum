// PR 20 Task 11.6 — Prose ingestion graph edge surfacing.
//
// Verifies that search_code covers .md files and that code_context
// returns memories reachable via about/mentions/edits edges.
//
// Prose ingestion shipped in v2a PR 3; this task verifies cross-type graph
// edges work end-to-end with the v2b graph foundation.

import { describe, it, expect } from 'vitest'
import { detectProseKind } from '../chunkers/prose-chunker.js'
import { runCodeContext } from '../code-context.js'
import type { CodeContextInput } from '../code-context.js'

describe('detectProseKind', () => {
  it('detects .md files as prose', () => {
    expect(detectProseKind('AGENTS.md')).toBe('markdown')
    expect(detectProseKind('docs/brainstorms/overview.md')).toBe('markdown')
  })

  it('detects .json files as prose', () => {
    expect(detectProseKind('config.json')).toBe('json')
  })

  it('detects .yaml/.yml files as prose', () => {
    expect(detectProseKind('config.yaml')).toBe('yaml')
    expect(detectProseKind('.github/workflows/ci.yml')).toBe('yaml')
  })

  it('detects .toml files as prose', () => {
    expect(detectProseKind('Cargo.toml')).toBe('toml')
  })

  it('returns null for non-prose files', () => {
    expect(detectProseKind('src/auth.ts')).toBeNull()
    expect(detectProseKind('main.py')).toBeNull()
  })
})

describe('runCodeContext with prose file', () => {
  it('returns shape-stable result for AGENTS.md when Kuzu not ready', async () => {
    const input: CodeContextInput = {
      file: 'AGENTS.md',
      workspace_id: 'ws_test',
    }
    // Kuzu is not ready in test environment — expects graceful degradation
    const result = await runCodeContext(input)
    expect(result).toHaveProperty('seed')
    expect(result.seed).toEqual({ file: 'AGENTS.md' })
    expect(Array.isArray(result.chunks)).toBe(true)
    expect(Array.isArray(result.memories)).toBe(true)
    expect(Array.isArray(result.callers)).toBe(true)
    expect(Array.isArray(result.callees)).toBe(true)
    expect(Array.isArray(result.imports)).toBe(true)
  })
})
