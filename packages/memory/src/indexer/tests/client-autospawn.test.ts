// Client auto-spawn + RPC tests. See plan Unit 1.4.
//
// These tests use a custom socket path under ${tmpdir()} to avoid touching the
// real per-user daemon; where spawn behavior matters, they pass a
// `spawnCommand` that runs the test-compiled daemon directly instead of
// relying on a `fulcrum` binary on PATH.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createIndexerClient,
  IndexerDisconnectedError,
  IndexerError,
  IndexerUnreachableError,
} from '../client.js'
import { startDaemon, type DaemonHandle } from '../daemon.js'

let tempDir: string
let socketPath: string
let daemon: DaemonHandle | null = null

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-client-'))
  socketPath = join(tempDir, 'indexer.sock')
  daemon = null
})

afterEach(async () => {
  if (daemon) { await daemon.close().catch(() => {}); daemon = null }
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
})

describe('IndexerClient — basic RPC', () => {
  it('round-trips ping against a running daemon', async () => {
    daemon = await startDaemon({ socketPath })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    const resp = await client.ping()
    expect(resp.ok).toBe(true)
    expect(typeof resp.version).toBe('string')
    client.close()
  })

  it('propagates typed errors (unknown_method)', async () => {
    daemon = await startDaemon({ socketPath })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    await expect(client.request('not_a_real_method')).rejects.toBeInstanceOf(IndexerError)
    await expect(client.request('not_a_real_method')).rejects.toMatchObject({ code: 'unknown_method' })
    client.close()
  })

  it('serves two concurrent requests on the same socket — each gets its own id', async () => {
    daemon = await startDaemon({ socketPath })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    const [a, b] = await Promise.all([client.ping(), client.ping()])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    client.close()
  })
})

describe('IndexerClient — auto-spawn', () => {
  it('when the daemon is not running and auto-spawn is disabled, surfaces Unreachable', async () => {
    const client = createIndexerClient({
      socketPath,
      disableAutoSpawn: true,
      connectAttempts: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 20,
    })
    await expect(client.ping()).rejects.toBeInstanceOf(IndexerUnreachableError)
    client.close()
  })

  it('spawns the configured command when no daemon is listening, then retries connect', async () => {
    // The stub helper (./helpers/spawn-daemon-stub.mjs) dynamically imports
    // daemon.ts, so the spawned subprocess must run under tsx. Wire it via
    // node --import tsx/esm.
    const spawnHelper = fileURLToPath(new URL('./helpers/spawn-daemon-stub.mjs', import.meta.url))
    const tsxLoader = fileURLToPath(new URL('../../../../../node_modules/tsx/dist/esm/index.mjs', import.meta.url))
    const client = createIndexerClient({
      socketPath,
      spawnCommand: { command: process.execPath, args: ['--import', tsxLoader, spawnHelper, socketPath] },
      connectAttempts: 20,
      initialBackoffMs: 50,
      maxBackoffMs: 150,
    })
    try {
      const resp = await client.ping()
      expect(resp.ok).toBe(true)
    } finally {
      try { await client.shutdown() } catch { /* daemon may have already exited */ }
      client.close()
      // Give the subprocess a moment to exit cleanly after shutdown RPC.
      await new Promise((r) => setTimeout(r, 200))
    }
  })
})

describe('IndexerClient — disconnect behaviour', () => {
  it('rejects a pending request with IndexerDisconnectedError when the daemon closes mid-request', async () => {
    daemon = await startDaemon({ socketPath })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    await client.ping() // prime the connection
    // Kill the daemon; existing socket gets 'close'.
    const pending = client.request('ping')
    await daemon.close(); daemon = null
    await expect(pending).rejects.toBeInstanceOf(IndexerDisconnectedError)
    client.close()
  })
})
