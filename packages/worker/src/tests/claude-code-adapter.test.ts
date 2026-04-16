// packages/worker/src/tests/claude-code-adapter.test.ts
// Tests for the Claude Code agent adapter.
// Focus on the contractual behaviour that doesn't require spawning a real process.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { claudeCodeAdapter } from '../adapters/claude-code.js'
import type { SpawnContext } from '../types.js'

const baseCtx: SpawnContext = {
  run_id: 'run_claude_test',
  workspace_id: 'ws_test',
  project_id: 'proj_test',
  task_id: 'task_test',
  role: 'software_engineer',
  model: null,
  handoff: null,
  worktree_path: null,
  heartbeat: vi.fn().mockResolvedValue(undefined),
}

describe('claudeCodeAdapter', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('has name "claude-code"', () => {
    expect(claudeCodeAdapter.name).toBe('claude-code')
  })

  it('is exported from @moabualruz/fulcrum-worker index', async () => {
    const mod = await import('../index.js')
    expect(mod.claudeCodeAdapter).toBe(claudeCodeAdapter)
  })

  it('implements the AgentAdapter contract (has name + spawn)', () => {
    expect(typeof claudeCodeAdapter.name).toBe('string')
    expect(typeof claudeCodeAdapter.spawn).toBe('function')
  })

  it('returns blocked with clear error when claude binary is not found', async () => {
    // Override PATH to ensure claude cannot be found
    const origPath = process.env['PATH']
    const origBin = process.env['FULCRUM_CLAUDE_BIN']
    process.env['PATH'] = '/nonexistent'
    delete process.env['FULCRUM_CLAUDE_BIN']

    try {
      const result = await claudeCodeAdapter.spawn(baseCtx)
      expect(result.status).toBe('blocked')
      expect(result.error).toMatch(/claude binary not found/i)
    } finally {
      if (origPath !== undefined) process.env['PATH'] = origPath
      if (origBin !== undefined) process.env['FULCRUM_CLAUDE_BIN'] = origBin
    }
  })

  it('uses FULCRUM_CLAUDE_BIN when set to an absolute executable — verifies env override', async () => {
    // Set FULCRUM_CLAUDE_BIN to /bin/false: absolute, executable, exits non-zero immediately.
    // The adapter will find the binary, spawn it, and it will fail with a non-zero exit code.
    const origBin = process.env['FULCRUM_CLAUDE_BIN']
    process.env['FULCRUM_CLAUDE_BIN'] = '/bin/false'

    try {
      const result = await claudeCodeAdapter.spawn({ ...baseCtx, heartbeat: vi.fn().mockResolvedValue(undefined) })
      // /bin/false exits 1 → the adapter treats non-zero exit as blocked
      expect(result.status).toBe('blocked')
      // Should NOT say "binary not found" — it found the binary but it failed
      expect(result.error).not.toMatch(/binary not found/i)
    } finally {
      if (origBin !== undefined) process.env['FULCRUM_CLAUDE_BIN'] = origBin
      else delete process.env['FULCRUM_CLAUDE_BIN']
    }
  })
})
