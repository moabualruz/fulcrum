// Spawn-race coverage (plan Unit 5.2).
//
// Two clients concurrently observe "no daemon running" and both try to spawn.
// Exactly ONE daemon wins the listen() bind; the other exits cleanly via the
// DaemonAlreadyRunningError path. Both clients end up talking to the same
// live daemon.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIndexerClient } from '../client.js'

let tempDir: string
let socketPath: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-race-'))
  socketPath = join(tempDir, 'indexer.sock')
})

afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
})

describe('spawn race — two concurrent auto-spawns', () => {
  it('converges on exactly one live daemon; both clients succeed', async () => {
    const spawnHelper = fileURLToPath(new URL('./helpers/spawn-daemon-stub.mjs', import.meta.url))
    const tsxLoader = fileURLToPath(new URL('../../../../../node_modules/tsx/dist/esm/index.mjs', import.meta.url))

    const makeClient = () => createIndexerClient({
      socketPath,
      spawnCommand: { command: process.execPath, args: ['--import', tsxLoader, spawnHelper, socketPath] },
      connectAttempts: 25,
      initialBackoffMs: 50,
      maxBackoffMs: 200,
    })

    const clientA = makeClient()
    const clientB = makeClient()
    try {
      const [a, b] = await Promise.all([clientA.ping(), clientB.ping()])
      expect(a.ok).toBe(true)
      expect(b.ok).toBe(true)
      // started_at must be identical — proves both hit the SAME daemon.
      expect(a.started_at).toBe(b.started_at)
    } finally {
      try { await clientA.shutdown() } catch { /* best-effort */ }
      clientA.close()
      clientB.close()
      await new Promise((r) => setTimeout(r, 200))
    }
  })
})
