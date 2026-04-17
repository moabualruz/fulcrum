// `fulcrum daemon <subcommand>` dispatcher tests. See plan Unit 1.5.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('runDaemon()', () => {
  const origLog = console.log
  const origErr = console.error
  const origExit = process.exit
  const logged: string[] = []
  const errored: string[] = []
  const exits: number[] = []

  beforeEach(() => {
    logged.length = 0
    errored.length = 0
    exits.length = 0
    console.log = (msg?: unknown) => { logged.push(String(msg ?? '')) }
    console.error = (msg?: unknown) => { errored.push(String(msg ?? '')) }
    // Throw on exit so we can assert without killing vitest.
    process.exit = ((code?: number) => {
      exits.push(code ?? 0)
      throw new Error(`EXIT_${code ?? 0}`)
    }) as typeof process.exit
  })

  afterEach(() => {
    console.log = origLog
    console.error = origErr
    process.exit = origExit
    vi.resetModules()
    vi.doUnmock('fulcrum-memory')
  })

  it('prints usage to stderr and exits 1 when called with no subcommand', async () => {
    const { runDaemon } = await import('../commands/daemon.js')
    await expect(runDaemon([])).rejects.toThrow('EXIT_1')
    expect(errored.join('\n')).toMatch(/fulcrum daemon indexer/)
  })

  it('prints usage to stderr and exits 0 for --help', async () => {
    const { runDaemon } = await import('../commands/daemon.js')
    await expect(runDaemon(['--help'])).rejects.toThrow('EXIT_0')
  })

  it('rejects unknown subcommands, prints usage, exits 1', async () => {
    const { runDaemon } = await import('../commands/daemon.js')
    await expect(runDaemon(['not-a-thing'])).rejects.toThrow('EXIT_1')
    expect(errored.join('\n')).toMatch(/Unknown daemon subcommand/)
  })

  it('sockname prints a path when fulcrum-memory returns one', async () => {
    vi.doMock('fulcrum-memory', () => ({
      indexerSocketPath: () => '/tmp/test-indexer.sock',
      createIndexerClient: () => ({ ping: () => Promise.resolve({ ok: true }), close: () => {} }),
    }))
    const { runDaemon } = await import('../commands/daemon.js')
    await runDaemon(['sockname'])
    expect(logged).toEqual(['/tmp/test-indexer.sock'])
  })

  it('sockname --ensure pings the daemon before printing', async () => {
    const pingSpy = vi.fn(() => Promise.resolve({ ok: true }))
    const closeSpy = vi.fn(() => {})
    vi.doMock('fulcrum-memory', () => ({
      indexerSocketPath: () => '/tmp/test-indexer.sock',
      createIndexerClient: () => ({ ping: pingSpy, close: closeSpy }),
    }))
    const { runDaemon } = await import('../commands/daemon.js')
    await runDaemon(['sockname', '--ensure'])
    expect(pingSpy).toHaveBeenCalledOnce()
    expect(closeSpy).toHaveBeenCalledOnce()
    expect(logged).toEqual(['/tmp/test-indexer.sock'])
  })
})
