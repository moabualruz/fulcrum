// packages/worker/src/tests/dispatch.test.ts
// Tests for dispatchClaudeCode — the fire-and-forget subprocess launcher.
// Mocks child_process.spawn so no real process is created.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// We need to intercept child_process.spawn before the module under test is
// loaded, so we use vi.mock hoisting.
const mockProc = {
  pid: 99999,
  unref: vi.fn(),
}

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => mockProc),
    execFileSync: vi.fn(() => '/usr/local/bin/claude'),
  }
})

import { spawn, execFileSync } from 'child_process'
import { dispatchClaudeCode, findClaudeBin } from '../adapters/claude-code.js'

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
const execFileSyncMock = execFileSync as unknown as ReturnType<typeof vi.fn>

describe('dispatchClaudeCode', () => {
  afterEach(() => {
    vi.clearAllMocks()
    // Reset mock proc state
    mockProc.unref.mockClear()
  })

  it('returns { pid } when spawn succeeds', () => {
    const result = dispatchClaudeCode({
      run_id: 'run_dispatch_1',
      workspace_id: 'ws_dispatch',
      agent_role: 'software_engineer',
    })
    expect(result).toEqual({ pid: 99999 })
  })

  it('spawns with detached: true', () => {
    dispatchClaudeCode({
      run_id: 'run_dispatch_2',
      workspace_id: 'ws_dispatch',
      agent_role: 'software_engineer',
    })
    expect(spawnMock).toHaveBeenCalledOnce()
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [string, string[], { detached?: boolean; stdio?: unknown; env?: NodeJS.ProcessEnv }]
    expect(spawnOpts.detached).toBe(true)
  })

  it('spawns with stdio: "ignore"', () => {
    dispatchClaudeCode({
      run_id: 'run_dispatch_3',
      workspace_id: 'ws_dispatch',
      agent_role: 'software_engineer',
    })
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [string, string[], { detached?: boolean; stdio?: unknown }]
    expect(spawnOpts.stdio).toBe('ignore')
  })

  it('calls proc.unref() to detach from parent', () => {
    dispatchClaudeCode({
      run_id: 'run_dispatch_4',
      workspace_id: 'ws_dispatch',
      agent_role: 'software_engineer',
    })
    expect(mockProc.unref).toHaveBeenCalledOnce()
  })

  it('passes FULCRUM_RUN_ID in env', () => {
    dispatchClaudeCode({
      run_id: 'run_env_test',
      workspace_id: 'ws_env',
      agent_role: 'software_engineer',
    })
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }]
    expect(spawnOpts.env?.['FULCRUM_RUN_ID']).toBe('run_env_test')
  })

  it('passes FULCRUM_WORKSPACE_ID in env', () => {
    dispatchClaudeCode({
      run_id: 'run_env_test2',
      workspace_id: 'ws_env_check',
      agent_role: 'software_engineer',
    })
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }]
    expect(spawnOpts.env?.['FULCRUM_WORKSPACE_ID']).toBe('ws_env_check')
  })

  it('passes FULCRUM_AGENT_ROLE in env', () => {
    dispatchClaudeCode({
      run_id: 'run_env_test3',
      workspace_id: 'ws_x',
      agent_role: 'code_reviewer',
    })
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }]
    expect(spawnOpts.env?.['FULCRUM_AGENT_ROLE']).toBe('code_reviewer')
  })

  it('includes task_id and project_id in env when provided', () => {
    dispatchClaudeCode({
      run_id: 'run_full',
      workspace_id: 'ws_full',
      project_id: 'proj_full',
      task_id: 'task_full',
      agent_role: 'software_engineer',
    })
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }]
    expect(spawnOpts.env?.['FULCRUM_PROJECT_ID']).toBe('proj_full')
    expect(spawnOpts.env?.['FULCRUM_TASK_ID']).toBe('task_full')
  })

  it('writes a prompt file with run_id, workspace_id, and agent_role', () => {
    const run_id = 'run_prompt_check'
    dispatchClaudeCode({
      run_id,
      workspace_id: 'ws_prompt',
      agent_role: 'qa_engineer',
    })

    const promptFile = join(tmpdir(), 'fulcrum-claude-code', `${run_id}.txt`)
    expect(existsSync(promptFile)).toBe(true)

    const content = readFileSync(promptFile, 'utf8')
    expect(content).toContain('qa_engineer')
    expect(content).toContain(run_id)
    expect(content).toContain('ws_prompt')

    // Cleanup
    try { unlinkSync(promptFile) } catch { /* ignore */ }
  })

  it('passes --prompt-file and --model args when model is provided', () => {
    dispatchClaudeCode({
      run_id: 'run_model_test',
      workspace_id: 'ws_m',
      agent_role: 'software_engineer',
      model: 'claude-sonnet-4-6',
    })
    const [, spawnArgs] = spawnMock.mock.calls[0] as [string, string[]]
    expect(spawnArgs).toContain('--prompt-file')
    expect(spawnArgs).toContain('--model')
    expect(spawnArgs).toContain('claude-sonnet-4-6')
  })

  it('throws when claude binary is not found', () => {
    // Temporarily make findClaudeBin return null by overriding PATH and FULCRUM_CLAUDE_BIN
    execFileSyncMock.mockImplementationOnce(() => { throw new Error('not found') })
    const origBin = process.env['FULCRUM_CLAUDE_BIN']
    delete process.env['FULCRUM_CLAUDE_BIN']

    try {
      expect(() => dispatchClaudeCode({
        run_id: 'run_no_bin',
        workspace_id: 'ws_x',
        agent_role: 'software_engineer',
      })).toThrow(/claude binary not found/i)
    } finally {
      if (origBin !== undefined) process.env['FULCRUM_CLAUDE_BIN'] = origBin
    }
  })

  it('is exported from fulcrum-worker index', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.dispatchClaudeCode).toBe('function')
  })
})

describe('findClaudeBin', () => {
  it('respects FULCRUM_CLAUDE_BIN override when path is absolute and executable', () => {
    const orig = process.env['FULCRUM_CLAUDE_BIN']
    // /bin/sh is guaranteed to be an absolute, executable path on any POSIX system
    process.env['FULCRUM_CLAUDE_BIN'] = '/bin/sh'
    try {
      expect(findClaudeBin()).toBe('/bin/sh')
    } finally {
      if (orig !== undefined) process.env['FULCRUM_CLAUDE_BIN'] = orig
      else delete process.env['FULCRUM_CLAUDE_BIN']
    }
  })

  it('throws when FULCRUM_CLAUDE_BIN is not an absolute path', () => {
    const orig = process.env['FULCRUM_CLAUDE_BIN']
    process.env['FULCRUM_CLAUDE_BIN'] = 'relative/claude'
    try {
      expect(() => findClaudeBin()).toThrow(/must be an absolute path/)
    } finally {
      if (orig !== undefined) process.env['FULCRUM_CLAUDE_BIN'] = orig
      else delete process.env['FULCRUM_CLAUDE_BIN']
    }
  })

  it('throws when FULCRUM_CLAUDE_BIN is not executable', () => {
    const orig = process.env['FULCRUM_CLAUDE_BIN']
    process.env['FULCRUM_CLAUDE_BIN'] = '/etc/hostname'
    try {
      expect(() => findClaudeBin()).toThrow(/not executable/)
    } finally {
      if (orig !== undefined) process.env['FULCRUM_CLAUDE_BIN'] = orig
      else delete process.env['FULCRUM_CLAUDE_BIN']
    }
  })
})
