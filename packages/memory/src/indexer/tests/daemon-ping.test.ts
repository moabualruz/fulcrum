// Integration test — spawn the daemon on a temp-dir socket path, connect a
// real client, send ping + shutdown, assert round-trip behavior.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.3.

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { startDaemon, DaemonAlreadyRunningError } from '../daemon.js'
import { createDecoder, encode, type IndexerMessage, type IndexerResponse } from '../protocol.js'

function withTempSocket(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'fulcrum-daemon-'))
  const path = join(dir, 'indexer.sock')
  return { path, cleanup: () => { try { rmSync(dir, { recursive: true, force: true }) } catch {} } }
}

function roundtrip(sockPath: string, method: string, params: Record<string, unknown> = {}): Promise<IndexerResponse> {
  return new Promise((resolve, reject) => {
    const dec = createDecoder()
    const client = createConnection(sockPath)
    const timer = setTimeout(() => { client.destroy(); reject(new Error('roundtrip timeout')) }, 3000)
    client.on('connect', () => {
      client.write(encode({ id: 1, method, params }))
    })
    client.on('data', (chunk: Buffer) => {
      try {
        const msgs = dec.feed(chunk) as IndexerMessage[]
        for (const m of msgs) {
          if ('id' in m && m.id === 1) {
            clearTimeout(timer)
            client.end()
            resolve(m as IndexerResponse)
            return
          }
        }
      } catch (err) {
        clearTimeout(timer); client.destroy(); reject(err as Error)
      }
    })
    client.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

describe('daemon — ping round-trip', () => {
  it('responds to ping with ok + version + active_watches', async () => {
    const { path, cleanup } = withTempSocket()
    const daemon = await startDaemon({ socketPath: path })
    try {
      const resp = await roundtrip(path, 'ping')
      expect('result' in resp).toBe(true)
      if ('result' in resp) {
        const r = resp.result as { ok: boolean; version: string; started_at: string; active_watches: number }
        expect(r.ok).toBe(true)
        expect(typeof r.version).toBe('string')
        expect(r.active_watches).toBe(0)
        expect(typeof r.started_at).toBe('string')
      }
    } finally {
      await daemon.close()
      cleanup()
    }
  })

  it('replies to unknown methods with error.code=unknown_method, keeps connection open', async () => {
    const { path, cleanup } = withTempSocket()
    const daemon = await startDaemon({ socketPath: path })
    try {
      const resp = await roundtrip(path, 'not_a_real_method')
      expect('error' in resp).toBe(true)
      if ('error' in resp) {
        expect(resp.error.code).toBe('unknown_method')
      }
      // Second request on a fresh connection should still succeed.
      const ok = await roundtrip(path, 'ping')
      expect('result' in ok).toBe(true)
    } finally {
      await daemon.close()
      cleanup()
    }
  })
})

describe('daemon — shutdown', () => {
  it('returns {ok:true} then the server stops accepting new connections', async () => {
    const { path, cleanup } = withTempSocket()
    const daemon = await startDaemon({ socketPath: path })
    try {
      const resp = await roundtrip(path, 'shutdown')
      expect('result' in resp).toBe(true)
      // Give shutdown a tick to close the listener.
      await new Promise((r) => setTimeout(r, 150))
      // New connect should fail (listener gone).
      await expect(new Promise((resolve, reject) => {
        const c = createConnection(path)
        c.on('connect', () => { c.destroy(); resolve('connected') })
        c.on('error', (err) => reject(err))
        setTimeout(() => { c.destroy(); reject(new Error('no error (still listening?)')) }, 500)
      })).rejects.toThrow()
    } finally {
      await daemon.close().catch(() => {})
      cleanup()
    }
  })
})

describe('daemon — EADDRINUSE fallback', () => {
  it('second daemon on the same socket exits cleanly via DaemonAlreadyRunningError', async () => {
    const { path, cleanup } = withTempSocket()
    const first = await startDaemon({ socketPath: path })
    try {
      await expect(startDaemon({ socketPath: path })).rejects.toBeInstanceOf(DaemonAlreadyRunningError)
    } finally {
      await first.close()
      cleanup()
    }
  })

  it('reclaims a stale socket inode when no live listener is behind it', async () => {
    const { path, cleanup } = withTempSocket()
    // Start + stop the daemon so the socket inode is left behind momentarily.
    const first = await startDaemon({ socketPath: path })
    await first.close()
    // Second start should unlink + bind, not throw.
    const second = await startDaemon({ socketPath: path })
    await second.close()
    cleanup()
  })
})
