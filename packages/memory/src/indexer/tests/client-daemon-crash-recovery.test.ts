// Crash recovery — the daemon dies mid-request, client rejects with
// IndexerDisconnectedError, next call auto-respawns the daemon and succeeds.
//
// Plan Unit 5.1. Tests run against a temp-dir socket + a stub spawn command,
// NEVER the real per-user socket.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDaemon, type DaemonHandle } from '../daemon.js'
import {
  createIndexerClient,
  IndexerDisconnectedError,
} from '../client.js'

let tempDir: string
let socketPath: string
let daemon: DaemonHandle | null = null

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-crash-'))
  socketPath = join(tempDir, 'indexer.sock')
})

afterEach(async () => {
  if (daemon) { await daemon.close().catch(() => {}); daemon = null }
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
})

describe('crash recovery', () => {
  it('pending request rejects with IndexerDisconnectedError when the daemon is killed mid-flight', async () => {
    daemon = await startDaemon({ socketPath })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await client.ping() // prime the socket
      const pending = client.request('ping')
      // Kill the server forcefully by closing the TCP listener + destroying peers.
      await daemon.close()
      daemon = null
      await expect(pending).rejects.toBeInstanceOf(IndexerDisconnectedError)
    } finally {
      client.close()
    }
  })

  it('next request after a crash auto-respawns and succeeds end-to-end', async () => {
    // Start a daemon, kill it, then let the client auto-spawn a fresh one via
    // a test-local spawn command.
    const first = await startDaemon({ socketPath })
    await first.close()

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
      try { await client.shutdown() } catch { /* best-effort */ }
      client.close()
      await new Promise((r) => setTimeout(r, 200))
    }
  })
})
