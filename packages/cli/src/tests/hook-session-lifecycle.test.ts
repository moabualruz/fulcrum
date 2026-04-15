// packages/cli/src/tests/hook-session-lifecycle.test.ts
//
// Task 11 — SessionStart + Stop + PreCompact hook coverage.
// Tests exercise the three exported handler functions. Since each handler
// calls process.exit(0) at the end, we mock that call so the test runner
// survives. We also provide a controlled stdin stream so we can inject
// the hook payload.
//
// Strategy: import the functions directly and mock:
//   - process.exit  → throw so we can assert the "happy exit"
//   - process.stdin → a PassThrough stream we can write JSON into
//   - @fulcrum/core → stub startAgentRun / completeAgentRun / writeMemory
//   - fs (readFileSync / writeFileSync / existsSync / mkdirSync) → in-memory stubs
//     so no actual disk state is required

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PassThrough } from 'stream'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Replace process.stdin with a PassThrough, push payload, then end. */
function fakeStdin(payload: unknown): void {
  const stream = new PassThrough()
  Object.defineProperty(process, 'stdin', { value: stream, configurable: true })
  setImmediate(() => {
    if (payload !== null) {
      stream.push(JSON.stringify(payload))
    }
    stream.push(null) // EOF
  })
}

/** Exit mock that turns process.exit(0) into a thrown sentinel so tests survive. */
function mockExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT_${code ?? 0}`)
  }) as never)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runSessionStartHook', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let coreModuleMock: {
    startAgentRun: ReturnType<typeof vi.fn>
    getDb: ReturnType<typeof vi.fn>
    runMigrations: ReturnType<typeof vi.fn>
    loadConfig: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    exitSpy    = mockExit()
    stderrSpy  = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    coreModuleMock = {
      startAgentRun:  vi.fn().mockResolvedValue({ run_id: 'run_session_test' }),
      getDb:          vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations:  vi.fn(),
      loadConfig:     vi.fn().mockReturnValue({ workspace_id: 'ws_test', project_id: 'proj_test', db_path: ':memory:' }),
      globalDataDir:  vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }
  })

  afterEach(() => {
    exitSpy.mockRestore()
    stderrSpy.mockRestore()
    vi.resetModules()
    vi.restoreAllMocks()
    // Restore real stdin (vitest uses a TTY-like stream; reset to original)
    Object.defineProperty(process, 'stdin', {
      value: process.stdin,
      configurable: true,
    })
  })

  it('exports runSessionStartHook as a function', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runSessionStartHook).toBe('function')
  })

  it('exits 0 on valid session-start payload and calls startAgentRun', async () => {
    vi.doMock('@fulcrum/core', () => coreModuleMock)
    // Stub out fs helpers used by the session file writer
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

    fakeStdin({ session_id: 'sess_abc123', model: 'claude-sonnet-4-6' })

    vi.resetModules()
    const { runSessionStartHook } = await import('../index.js')

    await expect(runSessionStartHook()).rejects.toThrow('EXIT_0')
  })

  it('exits 0 even with empty stdin (uses fallback session_id)', async () => {
    vi.doMock('@fulcrum/core', () => coreModuleMock)
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn().mockReturnValue(false) }
    })

    fakeStdin(null)

    vi.resetModules()
    const { runSessionStartHook } = await import('../index.js')
    await expect(runSessionStartHook()).rejects.toThrow('EXIT_0')
  })

  it('writes workspace_snapshot and fetched_at to session file when pre-fetch succeeds', async () => {
    // The pre-fetch calls TOOL_REGISTRY handlers; mock the registry.
    const fakeStatusResult = { active_runs: 0, blocked_runs: 0, wip_count: 0 }
    const fakeTasksResult  = { tasks: [], total: 0 }
    const fakeRegistryMap = new Map<string, { handler: ReturnType<typeof vi.fn> }>()
    fakeRegistryMap.set('get_workspace_status', { handler: vi.fn().mockResolvedValue(fakeStatusResult) })
    fakeRegistryMap.set('list_tasks', { handler: vi.fn().mockResolvedValue(fakeTasksResult) })

    vi.doMock('../tool-registry.js', () => ({
      TOOL_REGISTRY: fakeRegistryMap,
      buildDeps: vi.fn().mockReturnValue({ db: {}, workspace_id: 'ws_test', project_id: 'proj_test' }),
    }))
    vi.doMock('@fulcrum/core', () => coreModuleMock)

    let capturedSessionData: Record<string, unknown> | null = null
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:     vi.fn(),
        existsSync:    vi.fn().mockReturnValue(false),
        writeFileSync: vi.fn().mockImplementation((_path: string, data: string) => {
          try { capturedSessionData = JSON.parse(data) as Record<string, unknown> } catch { /* ignore */ }
        }),
        readFileSync:  vi.fn().mockReturnValue('{}'),
      }
    })

    fakeStdin({ session_id: 'sess_snapshot_test', model: 'claude-sonnet-4-6' })

    vi.resetModules()
    const { runSessionStartHook } = await import('../index.js')
    await expect(runSessionStartHook()).rejects.toThrow('EXIT_0')

    expect(capturedSessionData).not.toBeNull()
    expect(capturedSessionData!['run_id']).toBe('run_session_test')
    expect(capturedSessionData!['workspace_snapshot']).toBeDefined()
    expect(capturedSessionData!['fetched_at']).toEqual(expect.any(String))
    const snap = capturedSessionData!['workspace_snapshot'] as Record<string, unknown>
    expect(snap['status']).toMatchObject(fakeStatusResult)
    expect(snap['tasks']).toMatchObject(fakeTasksResult)
  })

  it('writes session file without snapshot when pre-fetch fails', async () => {
    // Registry throws on both calls — snapshot should be absent but session still succeeds.
    const throwingHandler = { handler: vi.fn().mockRejectedValue(new Error('db error')) }
    vi.doMock('../tool-registry.js', () => ({
      TOOL_REGISTRY: new Map([
        ['get_workspace_status', throwingHandler],
        ['list_tasks',           throwingHandler],
      ]),
      buildDeps: vi.fn().mockReturnValue({ db: {}, workspace_id: 'ws_test', project_id: 'proj_test' }),
    }))
    vi.doMock('@fulcrum/core', () => coreModuleMock)

    let capturedSessionData: Record<string, unknown> | null = null
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        mkdirSync:     vi.fn(),
        existsSync:    vi.fn().mockReturnValue(false),
        writeFileSync: vi.fn().mockImplementation((_path: string, data: string) => {
          try { capturedSessionData = JSON.parse(data) as Record<string, unknown> } catch { /* ignore */ }
        }),
        readFileSync:  vi.fn().mockReturnValue('{}'),
      }
    })

    fakeStdin({ session_id: 'sess_no_snapshot', model: 'claude' })

    vi.resetModules()
    const { runSessionStartHook } = await import('../index.js')
    await expect(runSessionStartHook()).rejects.toThrow('EXIT_0')

    // Session file must still be written with run_id, but no snapshot
    expect(capturedSessionData).not.toBeNull()
    expect(capturedSessionData!['run_id']).toBe('run_session_test')
    expect(capturedSessionData!['workspace_snapshot']).toBeUndefined()
    expect(capturedSessionData!['fetched_at']).toBeUndefined()
  })
})

describe('runSessionStopHook', () => {
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

  it('exports runSessionStopHook as a function', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runSessionStopHook).toBe('function')
  })

  it('exits 0 gracefully when session file is missing', async () => {
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return { ...actual, existsSync: vi.fn().mockReturnValue(false) }
    })

    fakeStdin({ session_id: 'sess_gone' })

    vi.resetModules()
    const { runSessionStopHook } = await import('../index.js')
    await expect(runSessionStopHook()).rejects.toThrow('EXIT_0')
  })

  it('exits 0 gracefully when session_id is absent from stdin and env', async () => {
    const origEnv = process.env['CLAUDE_SESSION_ID']
    delete process.env['CLAUDE_SESSION_ID']

    fakeStdin({}) // no session_id key

    vi.resetModules()
    const { runSessionStopHook } = await import('../index.js')
    await expect(runSessionStopHook()).rejects.toThrow('EXIT_0')

    if (origEnv !== undefined) process.env['CLAUDE_SESSION_ID'] = origEnv
  })

  it('calls completeAgentRun when session file exists', async () => {
    const completeAgentRun = vi.fn().mockResolvedValue({})
    vi.doMock('@fulcrum/core', () => ({
      completeAgentRun,
      getDb:         vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_test', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs')
      return {
        ...actual,
        existsSync:   vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue(JSON.stringify({ run_id: 'run_stop_test', workspace_id: 'ws_test' })),
      }
    })

    fakeStdin({ session_id: 'sess_stop_test' })

    vi.resetModules()
    const { runSessionStopHook } = await import('../index.js')
    await expect(runSessionStopHook()).rejects.toThrow('EXIT_0')

    expect(completeAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 'run_stop_test' }),
    )
  })
})

describe('runPreCompactHook', () => {
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

  it('exports runPreCompactHook as a function', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.runPreCompactHook).toBe('function')
  })

  it('exits 0 immediately when stdin is empty', async () => {
    fakeStdin(null)

    vi.resetModules()
    const { runPreCompactHook } = await import('../index.js')
    await expect(runPreCompactHook()).rejects.toThrow('EXIT_0')
  })

  it('exits 0 immediately when summary is absent from payload', async () => {
    fakeStdin({ session_id: 'sess_no_summary' }) // no summary field

    vi.resetModules()
    const { runPreCompactHook } = await import('../index.js')
    await expect(runPreCompactHook()).rejects.toThrow('EXIT_0')
  })

  it('calls writeMemory with session-compact tag when summary is present', async () => {
    const writeMemory = vi.fn().mockResolvedValue({ memory_id: 'mem_compact' })
    vi.doMock('@fulcrum/core', () => ({
      getDb:         vi.fn().mockReturnValue({}),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_compact', project_id: 'proj_compact', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('@fulcrum/memory', () => ({ writeMemory }))

    fakeStdin({ session_id: 'sess_compact', summary: 'Agent finished building the auth module.' })

    vi.resetModules()
    const { runPreCompactHook } = await import('../index.js')
    await expect(runPreCompactHook()).rejects.toThrow('EXIT_0')

    expect(writeMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Agent finished building the auth module.',
        tags: expect.arrayContaining(['session-compact']),
      }),
    )
  })

  it('accepts compaction_summary as an alias for summary', async () => {
    const writeMemory = vi.fn().mockResolvedValue({ memory_id: 'mem_alias' })
    vi.doMock('@fulcrum/core', () => ({
      getDb:         vi.fn().mockReturnValue({}),
      runMigrations: vi.fn(),
      loadConfig:    vi.fn().mockReturnValue({ workspace_id: 'ws_alias', project_id: 'proj_alias', db_path: ':memory:' }),
      globalDataDir: vi.fn().mockReturnValue('/tmp/fulcrum-test'),
    }))
    vi.doMock('@fulcrum/memory', () => ({ writeMemory }))

    fakeStdin({ session_id: 'sess_alias', compaction_summary: 'Compacted via alias key.' })

    vi.resetModules()
    const { runPreCompactHook } = await import('../index.js')
    await expect(runPreCompactHook()).rejects.toThrow('EXIT_0')

    expect(writeMemory).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Compacted via alias key.' }),
    )
  })
})
