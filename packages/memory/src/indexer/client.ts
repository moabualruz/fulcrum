// Client side of the fulcrum-indexer RPC.
//
// Every caller inside `packages/cli` or `packages/memory` uses this module to
// send requests to the daemon. If the daemon is not running, the client
// auto-spawns it and retries the connect. If the daemon crashes mid-request,
// pending requests reject with `IndexerDisconnectedError`; the caller decides
// whether to retry.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.4.

import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection, type Socket } from 'node:net'
import {
  allocateRequestId,
  createDecoder,
  encode,
  type IndexerErrorCode,
  type IndexerRequest,
  type IndexerResponse,
} from './protocol.js'
import { indexerSocketPath } from './socket-path.js'

const DEFAULT_CONNECT_ATTEMPTS = 10
const DEFAULT_INITIAL_BACKOFF_MS = 100
const DEFAULT_MAX_BACKOFF_MS = 500

export interface IndexerClientOptions {
  /** Override the socket path (tests). Defaults to `indexerSocketPath()`. */
  socketPath?: string
  /** Override the spawn argv for the daemon (tests). */
  spawnCommand?: { command: string; args: readonly string[] }
  /** Skip the auto-spawn step (tests that want to assert connect-only behavior). */
  disableAutoSpawn?: boolean
  /** Override the number of connect attempts after a spawn. */
  connectAttempts?: number
  /** Override the initial back-off in ms between connect retries. */
  initialBackoffMs?: number
  /** Cap on the back-off doubling. */
  maxBackoffMs?: number
}

export class IndexerError extends Error {
  constructor(
    public readonly code: IndexerErrorCode,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'IndexerError'
  }
}

export class IndexerUnreachableError extends Error {
  constructor(socketPath: string, public readonly cause?: unknown) {
    super(`indexer daemon unreachable at ${socketPath}`)
    this.name = 'IndexerUnreachableError'
  }
}

export class IndexerDisconnectedError extends Error {
  constructor() {
    super('indexer daemon connection closed mid-request')
    this.name = 'IndexerDisconnectedError'
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

export interface EnsureWatchingResult {
  watch: string
  relative_path: string
  already_watched: boolean
}

export interface ReleaseWatchingResult {
  watch: string
  refcount: number
}

export interface IndexerProjectStatus {
  root: string
  workspace_id: string
  project_id: string
  refcount: number
  watcher_active: boolean
  watch?: {
    root: string
    workspace_id: string
    project_id: string
    refcount: number
    watcher_active: boolean
  }
  coverage?: {
    code_files_count: number
    code_chunks_count: number
    memories_count: number
    current_vectors_count: number
    pending_vectors_count: number
  } | null
  coverage_reason?: string
  code_chunks_count: number
  memories_count: number
}

export interface IndexerStatus {
  version: string
  daemon_started_at: string
  active_watches: number
  projects: IndexerProjectStatus[]
}

export interface IndexerClient {
  ping(): Promise<{ ok: boolean; version: string; started_at: string; active_watches: number }>
  shutdown(): Promise<{ ok: boolean }>
  ensureWatching(root: string): Promise<EnsureWatchingResult>
  releaseWatching(root: string): Promise<ReleaseWatchingResult>
  getStatus(): Promise<IndexerStatus>
  /** Generic RPC — escape hatch for methods not yet in the typed surface. */
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
  /** Close the underlying socket; the daemon itself is NOT stopped. */
  close(): void
}

export function createIndexerClient(opts: IndexerClientOptions = {}): IndexerClient {
  const socketPath = opts.socketPath ?? indexerSocketPath()
  const spawnCmd = opts.spawnCommand ?? { command: 'fulcrum', args: ['daemon', 'indexer'] }
  const connectAttempts = opts.connectAttempts ?? DEFAULT_CONNECT_ATTEMPTS
  const initialBackoffMs = opts.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS

  const pending = new Map<number, Pending>()
  let sock: Socket | null = null
  let decoder = createDecoder()
  let connectPromise: Promise<void> | null = null
  let spawnedOnce = false

  function rejectAllPending(err: Error): void {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
  }

  async function connect(): Promise<void> {
    if (sock && !sock.destroyed) return
    if (connectPromise) return connectPromise

    connectPromise = (async () => {
      try {
        await connectOnce()
      } catch (err) {
        if (opts.disableAutoSpawn) throw new IndexerUnreachableError(socketPath, err)
        if (spawnedOnce) throw new IndexerUnreachableError(socketPath, err)
        await spawnDaemon()
        spawnedOnce = true
        await retryUntilConnected()
      }
    })().finally(() => { connectPromise = null })

    return connectPromise
  }

  function connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = createConnection(socketPath)
      const onError = (err: NodeJS.ErrnoException): void => {
        s.removeListener('connect', onConnect)
        reject(err)
      }
      const onConnect = (): void => {
        s.removeListener('error', onError)
        attachSocket(s)
        resolve()
      }
      s.once('error', onError)
      s.once('connect', onConnect)
    })
  }

  async function retryUntilConnected(): Promise<void> {
    let lastErr: unknown
    for (let attempt = 0; attempt < connectAttempts; attempt++) {
      try {
        await connectOnce()
        return
      } catch (err) {
        lastErr = err
        const delay = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    throw new IndexerUnreachableError(socketPath, lastErr)
  }

  function spawnDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      let child: ChildProcess
      try {
        child = spawn(spawnCmd.command, spawnCmd.args as string[], {
          detached: true,
          stdio: 'ignore',
        })
      } catch (err) {
        reject(new IndexerUnreachableError(socketPath, err))
        return
      }
      // Detach so the parent can exit independently.
      child.unref()
      child.on('error', (err) => reject(new IndexerUnreachableError(socketPath, err)))
      // Give the daemon a beat to start listening before resolve. The caller
      // immediately follows with retryUntilConnected, which owns the back-off.
      setTimeout(resolve, 50)
    })
  }

  function attachSocket(s: Socket): void {
    sock = s
    decoder = createDecoder()

    s.setNoDelay(true)
    s.on('data', (chunk: Buffer) => {
      let msgs: ReturnType<typeof decoder.feed>
      try {
        msgs = decoder.feed(chunk)
      } catch (err) {
        rejectAllPending(err as Error)
        s.destroy()
        return
      }
      for (const m of msgs) {
        if (typeof (m as IndexerResponse).id !== 'number') continue
        const resp = m as IndexerResponse
        const p = pending.get(resp.id)
        if (!p) continue
        pending.delete(resp.id)
        if ('error' in resp) {
          p.reject(new IndexerError(resp.error.code, resp.error.message, resp.error.detail))
        } else {
          p.resolve(resp.result)
        }
      }
    })
    s.on('close', () => {
      sock = null
      rejectAllPending(new IndexerDisconnectedError())
    })
    s.on('error', () => {
      // 'close' handles cleanup.
    })
  }

  function request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    // Build the pending promise FIRST and keep it as the returned object so
    // the caller's await attaches directly — no outer async wrapper to race
    // with the 'close' rejection path.
    const id = allocateRequestId()
    let rejectFn!: (err: Error) => void
    const promise = new Promise<T>((resolve, reject) => {
      rejectFn = reject
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    })
    // Mark the promise as having a handler so node does not flag
    // unhandledRejection if the socket closes before the caller awaits.
    // The caller's await still receives the rejection.
    promise.catch(() => { /* suppress pre-await warning */ })

    const req: IndexerRequest = { id, method, params }
    connect().then(() => {
      if (!sock || sock.destroyed) {
        pending.delete(id)
        rejectFn(new IndexerDisconnectedError())
        return
      }
      try {
        sock.write(encode(req))
      } catch (err) {
        pending.delete(id)
        rejectFn(err as Error)
      }
    }, (err: Error) => {
      pending.delete(id)
      rejectFn(err)
    })

    return promise
  }

  return {
    request,
    ping: () => request('ping'),
    shutdown: () => request('shutdown'),
    ensureWatching: (root: string) => request<EnsureWatchingResult>('ensureWatching', { root }),
    releaseWatching: (root: string) => request<ReleaseWatchingResult>('releaseWatching', { root }),
    getStatus: () => request<IndexerStatus>('getStatus'),
    close: () => {
      if (sock && !sock.destroyed) sock.end()
      sock = null
    },
  }
}

// ── Module-level default singleton ────────────────────────────────────────
// Most callers want "the indexer for this user" without threading an object
// through. They import `indexerClient` and go. Tests that need isolation use
// `createIndexerClient` directly.

let _singleton: IndexerClient | null = null
export function indexerClient(): IndexerClient {
  if (!_singleton) _singleton = createIndexerClient()
  return _singleton
}
export function _resetIndexerClientForTest(): void {
  if (_singleton) _singleton.close()
  _singleton = null
}
