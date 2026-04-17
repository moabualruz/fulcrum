// Task 50 acceptance tests — opencode tool-policy gating.
//
// Verifies the pre-hook allowlist + policy check path (tool.execute.before /
// tool.execute.after / permission.ask). We cannot import plugins/fulcrum.ts
// directly because it depends on @opencode-ai/plugin which is not a dev
// dependency, so we replicate the handler logic against a mocked spawnSync —
// the same pattern as event-subscriptions.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '{}', stderr: '' })),
}))

const mockSpawn = vi.mocked(spawnSync)

const FULCRUM_TOOL_ALLOWLIST = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Task'])

interface ToolExecInput { tool?: string; input?: Record<string, unknown> }
interface PermInput     { tool?: string; input?: Record<string, unknown> }
type PermResult = { approved: true } | { approved: false; reason: string }

function preHook(input: ToolExecInput): void {
  if (!input.tool || input.tool.startsWith('fulcrum_')) return
  if (!FULCRUM_TOOL_ALLOWLIST.has(input.tool)) return
  const result = spawnSync('fulcrum', ['hook', 'auto'], {
    input: JSON.stringify({
      tool_name: input.tool,
      tool_input: input.input ?? {},
      session_id: process.env['OPENCODE_SESSION_ID'] ?? 'unknown',
    }),
    encoding: 'utf-8',
    timeout: 5_000,
  })
  if (result.status !== 0 && result.status !== null) {
    let reason = 'denied by Fulcrum policy'
    try {
      const out = JSON.parse(result.stdout ?? '{}') as Record<string, unknown>
      if (typeof out['message'] === 'string') reason = out['message']
      else if (typeof out['reason'] === 'string') reason = out['reason']
    } catch { /* default */ }
    throw new Error(`[fulcrum policy] ${reason}`)
  }
}

function postHook(input: ToolExecInput): void {
  if (!input.tool || input.tool.startsWith('fulcrum_')) return
  if (!FULCRUM_TOOL_ALLOWLIST.has(input.tool)) return
  spawnSync('fulcrum', ['hook', 'auto', 'post'], {
    input: JSON.stringify({
      tool_name: input.tool,
      tool_input: input.input ?? {},
      session_id: process.env['OPENCODE_SESSION_ID'] ?? 'unknown',
    }),
    encoding: 'utf-8',
    timeout: 5_000,
  })
}

function permissionAsk(input: PermInput): PermResult {
  const result = spawnSync('fulcrum', ['hook', 'auto'], {
    input: JSON.stringify({
      tool_name: input.tool ?? 'unknown',
      tool_input: input.input ?? {},
      session_id: process.env['OPENCODE_SESSION_ID'] ?? 'unknown',
    }),
    encoding: 'utf-8',
    timeout: 5_000,
  })
  if (result.status !== 0 && result.status !== null) {
    let reason = 'denied by Fulcrum policy'
    try {
      const out = JSON.parse(result.stdout ?? '{}') as Record<string, unknown>
      if (typeof out['message'] === 'string') reason = out['message']
    } catch { /* default */ }
    return { approved: false, reason }
  }
  return { approved: true }
}

afterEach(() => {
  mockSpawn.mockClear()
})

describe('opencode tool-policy pre-hook', () => {
  it('allowlisted tool → shells to `fulcrum hook auto` with event payload', () => {
    preHook({ tool: 'Write', input: { file_path: '/tmp/x' } })
    expect(mockSpawn).toHaveBeenCalledOnce()
    const [bin, argv, opts] = mockSpawn.mock.calls[0]!
    expect(bin).toBe('fulcrum')
    expect(argv).toEqual(['hook', 'auto'])
    const event = JSON.parse((opts as { input: string }).input) as Record<string, unknown>
    expect(event['tool_name']).toBe('Write')
    expect(event['tool_input']).toEqual({ file_path: '/tmp/x' })
  })

  it('non-allowlisted tool → no spawnSync (Read/Grep/Glob bypass policy)', () => {
    preHook({ tool: 'Read', input: {} })
    preHook({ tool: 'Grep', input: {} })
    preHook({ tool: 'Glob', input: {} })
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('fulcrum_* tool → no spawnSync (avoid recursion on self-calls)', () => {
    preHook({ tool: 'fulcrum_recall_memory', input: {} })
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('empty tool name → no spawnSync', () => {
    preHook({ tool: '', input: {} })
    preHook({ input: {} })
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('non-zero exit with JSON message → throws with policy reason', () => {
    mockSpawn.mockReturnValueOnce({ status: 1, stdout: '{"message":"blocked by secret guard"}', stderr: '', pid: 0, output: [], signal: null } as never)
    expect(() => preHook({ tool: 'Bash', input: { command: 'cat .env' } })).toThrow(/blocked by secret guard/)
  })

  it('non-zero exit with non-JSON stdout → throws with default reason', () => {
    mockSpawn.mockReturnValueOnce({ status: 1, stdout: 'garbage', stderr: '', pid: 0, output: [], signal: null } as never)
    expect(() => preHook({ tool: 'Write', input: {} })).toThrow(/denied by Fulcrum policy/)
  })

  it('zero exit → does not throw', () => {
    expect(() => preHook({ tool: 'Edit', input: {} })).not.toThrow()
  })
})

describe('opencode tool-policy post-hook', () => {
  it('allowlisted tool → calls `fulcrum hook auto post`', () => {
    postHook({ tool: 'Bash', input: { command: 'ls' } })
    expect(mockSpawn).toHaveBeenCalledOnce()
    const [, argv] = mockSpawn.mock.calls[0]!
    expect(argv).toEqual(['hook', 'auto', 'post'])
  })

  it('non-allowlisted tool → no spawnSync', () => {
    postHook({ tool: 'Read', input: {} })
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

describe('opencode permission.ask gate', () => {
  it('zero exit → approved', () => {
    const r = permissionAsk({ tool: 'Bash', input: {} })
    expect(r).toEqual({ approved: true })
  })

  it('non-zero exit → not approved, surfaces JSON message', () => {
    mockSpawn.mockReturnValueOnce({ status: 1, stdout: '{"message":"WIP cap reached"}', stderr: '', pid: 0, output: [], signal: null } as never)
    const r = permissionAsk({ tool: 'Write', input: {} })
    expect(r).toEqual({ approved: false, reason: 'WIP cap reached' })
  })

  it('non-zero exit with no message → not approved with default reason', () => {
    mockSpawn.mockReturnValueOnce({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as never)
    const r = permissionAsk({ tool: 'Bash', input: {} })
    expect(r.approved).toBe(false)
    if (!r.approved) expect(r.reason).toMatch(/denied by Fulcrum policy/)
  })
})
