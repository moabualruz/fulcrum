// packages/cli/src/tests/e2e-session.test.ts
//
// E2E session lifecycle test.
// Simulates the full hook sequence: SessionStart → SessionStop → PreCompact.
// Verifies the correct Fulcrum operations are invoked at each stage and that
// the session file is used as state-passing mechanism between start and stop.
//
// Pattern mirrors hook-session-lifecycle.test.ts — mocks @fulcrum/core and fs
// inline per test so vi.doMock + vi.resetModules() reliably picks up the right mock.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PassThrough } from 'stream'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeStdin(payload: unknown): void {
  const stream = new PassThrough()
  Object.defineProperty(process, 'stdin', { value: stream, configurable: true })
  setImmediate(() => {
    if (payload !== null) stream.push(JSON.stringify(payload))
    stream.push(null)
  })
}

function mockExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT_${code ?? 0}`)
  }) as never)
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

let exitSpy: ReturnType<typeof vi.spyOn>
let stderrSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  exitSpy   = mockExit()
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  exitSpy.mockRestore()
  stderrSpy.mockRestore()
  vi.resetModules()
  vi.restoreAllMocks()
  Object.defineProperty(process, 'stdin', { value: process.stdin, configurable: true })
})

// ── E2E tests ─────────────────────────────────────────────────────────────────

describe('E2E session lifecycle — full hook sequence', () => {
  it('Phase 1 — SessionStart: calls startAgentRun and writes session file', async () => {
    const startAgentRun = vi.fn().mockResolvedValue({ run_id: 'run_e2e_001' })
    vi.doMock('@fulcrum/core', () => ({
      startAgentRun,
      getDb:         vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_e2e', project_id: 'proj_e2e', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:     vi.fn(),
        writeFileSync: vi.fn(),
        readFileSync:  vi.fn().mockReturnValue('{}'),
        existsSync:    vi.fn().mockReturnValue(false),
      }
    })

    fakeStdin({ session_id: 'sess_e2e_start', model: 'claude-sonnet-4-6' })
    vi.resetModules()
    const { runSessionStartHook } = await import('../index.js')
    await expect(runSessionStartHook()).rejects.toThrow('EXIT_0')

    expect(startAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws_e2e' })
    )
  })

  it('Phase 2 — SessionStop: reads session file, calls completeAgentRun', async () => {
    const completeAgentRun = vi.fn().mockResolvedValue({})
    vi.doMock('@fulcrum/core', () => ({
      completeAgentRun,
      getDb:         vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_e2e', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:    vi.fn(),
        existsSync:   vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue(JSON.stringify({
          run_id:       'run_e2e_stop',
          workspace_id: 'ws_e2e',
          project_id:   'proj_e2e',
          started_at:   new Date().toISOString(),
        })),
        writeFileSync: vi.fn(),
        unlinkSync:    vi.fn(),
      }
    })

    fakeStdin({ session_id: 'sess_e2e_stop' })
    vi.resetModules()
    const { runSessionStopHook } = await import('../index.js')
    await expect(runSessionStopHook()).rejects.toThrow('EXIT_0')

    expect(completeAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 'run_e2e_stop' })
    )
  })

  it('Phase 3 — PreCompact: writes a memory entry from compact summary', async () => {
    const writeMemory = vi.fn().mockResolvedValue({ memory_id: 'mem_compact_001' })
    vi.doMock('@fulcrum/memory', () => ({ writeMemory }))
    vi.doMock('@fulcrum/core', () => ({
      getDb:         vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_e2e', project_id: 'proj_e2e', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:    vi.fn(),
        existsSync:   vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue(JSON.stringify({
          run_id:       'run_e2e_compact',
          workspace_id: 'ws_e2e',
          project_id:   'proj_e2e',
          started_at:   new Date().toISOString(),
        })),
        writeFileSync: vi.fn(),
      }
    })

    fakeStdin({
      session_id: 'sess_e2e_compact',
      summary: 'Context compacted after 50 turns discussing Fulcrum architecture and memory layers.',
    })
    vi.resetModules()
    const { runPreCompactHook } = await import('../index.js')
    await expect(runPreCompactHook()).rejects.toThrow('EXIT_0')

    expect(writeMemory).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws_e2e', kind: expect.any(String) })
    )
  })

  it('SessionStart + Stop chain: run_id flows from start → stop', async () => {
    // Phase 1: capture what was written to the session file
    const CHAIN_RUN_ID = 'run_chain_001'
    let sessionFileData = ''

    const startAgentRun = vi.fn().mockResolvedValue({ run_id: CHAIN_RUN_ID })
    vi.doMock('@fulcrum/core', () => ({
      startAgentRun,
      getDb:         vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_chain', project_id: 'proj_chain', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:     vi.fn(),
        writeFileSync: vi.fn().mockImplementation((_p: string, data: string) => { sessionFileData = data }),
        readFileSync:  vi.fn().mockReturnValue('{}'),
        existsSync:    vi.fn().mockReturnValue(false),
      }
    })

    fakeStdin({ session_id: 'sess_chain', model: 'claude-sonnet-4-6' })
    vi.resetModules()
    const { runSessionStartHook } = await import('../index.js')
    await expect(runSessionStartHook()).rejects.toThrow('EXIT_0')

    // Verify session file contains the run_id from startAgentRun
    const parsed = JSON.parse(sessionFileData) as { run_id: string }
    expect(parsed.run_id).toBe(CHAIN_RUN_ID)

    // Phase 2: stop using the captured session data
    const completeAgentRun = vi.fn().mockResolvedValue({})
    vi.resetModules()
    vi.doMock('@fulcrum/core', () => ({
      completeAgentRun,
      getDb:         vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_chain', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:    vi.fn(),
        existsSync:   vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue(sessionFileData),
        writeFileSync: vi.fn(),
        unlinkSync:    vi.fn(),
      }
    })

    fakeStdin({ session_id: 'sess_chain' })
    vi.resetModules()
    const { runSessionStopHook } = await import('../index.js')
    await expect(runSessionStopHook()).rejects.toThrow('EXIT_0')

    // completeAgentRun must receive the SAME run_id that startAgentRun returned
    expect(completeAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: CHAIN_RUN_ID })
    )
  })
})
