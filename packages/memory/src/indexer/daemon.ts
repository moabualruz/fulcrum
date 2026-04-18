// Fulcrum Indexer Daemon — entrypoint.
//
// One node process per user. Listens on the platform socket (POSIX unix socket
// or Windows named pipe) resolved by `indexerSocketPath()`. Accepts NDJSON
// requests from clients (CLI, `fulcrum serve mcp`, `fulcrum serve monitor`,
// hook invocations) and dispatches them to `HANDLERS`.
//
// The socket binding IS the cross-process lock. If another daemon is already
// bound, `listen()` fails with EADDRINUSE; we probe the incumbent with a
// `ping` RPC and either exit quietly (another daemon is healthy) or reclaim a
// stale socket inode and retry.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md for the full
// architecture.

import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { createDecoder, encode, type IndexerRequest, type IndexerErrorResponse, type IndexerSuccessResponse } from './protocol.js'
import { indexerSocketPath, unlinkStaleSocket } from './socket-path.js'
import { HANDLERS, HandlerError, hasHandler, type DaemonContext } from './handlers.js'
import { createDaemonRegistry, type DaemonRegistry } from './registry.js'
import { VaultOwnedPathError } from '../pci/vault-guard.js'
import { projectIdsFromPath, getDb as getCoreDb } from 'fulcrum-agent-core'
import type { Db } from './types-db.js'

const DAEMON_VERSION = '0.0.2'
const PING_PROBE_TIMEOUT_MS = 500
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 min

export interface DaemonOptions {
  socketPath?: string
  /** Unused in PR 1; wired in PR 3 for the idle-exit timer. */
  idleTimeoutMs?: number
  /** Test hook: override the registry's workspace/project id derivation. */
  registry?: DaemonRegistry
}

export interface DaemonHandle {
  server: Server
  close(): Promise<void>
  /** For tests — resolves after `server.listen` actually binds. */
  readonly ready: Promise<void>
}

/**
 * Start the daemon. Resolves to a handle once the socket is bound; the daemon
 * process keeps running until `close()` is called, SIGTERM is received, or
 * `shutdown` is requested over the wire.
 *
 * Tests spawn this via a custom `socketPath` in `${tmpdir()}`; production
 * flows leave `socketPath` undefined and use the resolved per-user default.
 */
export async function startDaemon(opts: DaemonOptions = {}): Promise<DaemonHandle> {
  const socketPath = opts.socketPath ?? indexerSocketPath()
  const startedAt = new Date().toISOString()

  // Daemon context shared with handlers. Mutable bits (active_watches, exit
  // trigger) live here so handlers don't import daemon internals.
  let shuttingDown = false
  const openSockets = new Set<Socket>()

  const registry: DaemonRegistry = opts.registry ?? createDaemonRegistry({
    workspaceIdFor: (root) => projectIdsFromPath(root).workspace_id,
    projectIdFor: (root) => projectIdsFromPath(root).project_id,
    ensureRows: (realpath, workspaceId, projectId) => {
      // Auto-create workspace+project rows so code_chunks/memories FKs resolve.
      // Daemon is long-lived and serves paths beyond its own cwd — the caller
      // that invoked `fulcrum daemon indexer` only initialized its own cwd's
      // project. Subsequent ensureWatching() calls would otherwise FK-fail on
      // every insert during initial scan.
      try {
        const db = getCoreDb()
        const basename = realpath.split('/').pop() || 'project'
        const sanitized = basename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'project'
        db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)')
          .run(workspaceId, sanitized, 'active', new Date().toISOString())
        db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at, root_path, root_realpath) VALUES (?, ?, ?, ?, ?, ?)')
          .run(projectId, workspaceId, sanitized, new Date().toISOString(), realpath, realpath)
      } catch (err) {
        process.stderr.write(`[fulcrum-indexer] ensureRows failed for ${realpath}: ${err instanceof Error ? err.message : String(err)}\n`)
      }
    },
  })

  // Lazy DB handle — loaded on first getStatus / triggerReindex call so a
  // bootstrap daemon that never serves those methods doesn't open SQLite.
  let cachedDb: Db | null | undefined
  const getDb = (): Db | null => {
    if (cachedDb !== undefined) return cachedDb
    try {
      // Dynamic import, synchronous pattern: we swallow failures so the daemon
      // remains usable even when the DB cannot be opened (e.g., permission).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const core = require('fulcrum-agent-core') as { getDb: () => Db }
      cachedDb = core.getDb()
    } catch {
      cachedDb = null
    }
    return cachedDb
  }

  // ── Idle-timer state ────────────────────────────────────────────────────
  // Rule: the daemon self-exits once active_watches === 0 AND
  // `idleTimeoutMs` has elapsed since the last request OR watch acquisition.
  // An active watch keeps the daemon alive indefinitely; every request resets
  // the clock.
  const idleMs = resolveIdleMs(opts.idleTimeoutMs)
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function armIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer)
    if (registry.activeWatches() > 0) {
      idleTimer = null
      return
    }
    idleTimer = setTimeout(() => {
      if (registry.activeWatches() > 0) { armIdleTimer(); return }
      process.stderr.write(`[fulcrum-indexer] idle timeout reached; exiting\n`)
      ctx.requestShutdown()
    }, idleMs)
    idleTimer.unref?.()
  }

  const bumpActivity = (): void => { armIdleTimer() }

  const ctx: DaemonContext = {
    version: DAEMON_VERSION,
    startedAt,
    registry,
    getDb,
    bumpActivity,
    activeWatches: () => registry.activeWatches(),
    requestShutdown: () => {
      if (shuttingDown) return
      shuttingDown = true
      void gracefulClose()
    },
  }

  const server = createServer((sock) => handleConnection(sock, ctx, () => openSockets))
  openSockets.clear()
  server.on('connection', (sock) => openSockets.add(sock))

  let resolveReady!: () => void
  const ready = new Promise<void>((res) => { resolveReady = res })
  // Swallow any attach-time rejection — we only resolve this promise, never
  // reject it; when startDaemon itself throws we tear down without touching
  // `ready`, so no dangling consumer exists.
  ready.catch(() => { /* unreachable */ })

  const bindOnce = (): Promise<void> => new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(socketPath)
  })

  try {
    await bindOnce()
    logStart(socketPath)
    resolveReady()
    armIdleTimer() // start the idle countdown once we're serving
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'EADDRINUSE') {
      // Either another daemon is alive, or a stale socket inode is blocking us.
      const alive = await probeExistingDaemon(socketPath)
      if (alive) {
        try { server.close() } catch { /* not listening */ }
        throw new DaemonAlreadyRunningError(socketPath)
      }
      // Stale socket — unlink and retry once.
      unlinkStaleSocket(socketPath)
      await bindOnce()
      logStart(socketPath)
      resolveReady()
    } else {
      try { server.close() } catch { /* not listening */ }
      throw e
    }
  }

  // Register signal handlers only if we actually bound.
  const onSignal = (sig: NodeJS.Signals): void => {
    process.stderr.write(`[fulcrum-indexer] received ${sig}; graceful shutdown\n`)
    ctx.requestShutdown()
  }
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)

  const gracefulClose = async (): Promise<void> => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    try { server.close() } catch { /* already closed */ }
    for (const s of openSockets) {
      try { s.end() } catch { /* best-effort */ }
    }
    // Give sockets a beat to flush, then force-destroy any that linger.
    await new Promise<void>((res) => setTimeout(res, 50))
    for (const s of openSockets) {
      try { s.destroy() } catch { /* already */ }
    }
    try { registry.shutdownAll() } catch { /* best-effort */ }
    process.stderr.write(`[fulcrum-indexer] shutdown complete\n`)
  }

  return {
    server,
    ready,
    close: gracefulClose,
  }
}

/** Thrown by `startDaemon` when another live daemon already owns the socket. */
export class DaemonAlreadyRunningError extends Error {
  constructor(public readonly socketPath: string) {
    super(`another fulcrum-indexer daemon is already running on ${socketPath}`)
    this.name = 'DaemonAlreadyRunningError'
  }
}

function resolveIdleMs(optValue: number | undefined): number {
  if (typeof optValue === 'number' && optValue > 0) return optValue
  const env = process.env['FULCRUM_INDEXER_IDLE_MS']
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_IDLE_TIMEOUT_MS
}

function logStart(socketPath: string): void {
  process.stderr.write(`[fulcrum-indexer] listening on ${socketPath} (v${DAEMON_VERSION})\n`)
}

// ── Per-connection loop ────────────────────────────────────────────────────

function handleConnection(
  sock: Socket,
  ctx: DaemonContext,
  getOpenSockets: () => Set<Socket>,
): void {
  const decoder = createDecoder()
  sock.setNoDelay(true)
  sock.on('error', () => { /* ECONNRESET etc — swallow; socket will close */ })
  sock.on('close', () => { getOpenSockets().delete(sock) })

  sock.on('data', (chunk: Buffer) => {
    let messages: ReturnType<typeof decoder.feed>
    try {
      messages = decoder.feed(chunk)
    } catch (err) {
      process.stderr.write(`[fulcrum-indexer] decoder error; closing client — ${(err as Error).message}\n`)
      sock.end()
      return
    }
    // Dispatch each request concurrently — serial await would serialise every
    // client request and defeat the in-flight dedup inside long-running
    // handlers (e.g. triggerReindex). The client correlates responses by id,
    // so out-of-order writes are fine.
    for (const msg of messages) {
      if (!isRequest(msg)) continue
      dispatch(ctx, msg).then(
        (response) => { try { sock.write(encode(response)) } catch { /* peer closed */ } },
        () => { /* dispatch always resolves — handler errors become error responses */ },
      )
    }
  })
}

function isRequest(m: unknown): m is IndexerRequest {
  return !!m && typeof m === 'object' &&
    typeof (m as IndexerRequest).id === 'number' &&
    typeof (m as IndexerRequest).method === 'string'
}

async function dispatch(
  ctx: DaemonContext,
  req: IndexerRequest,
): Promise<IndexerSuccessResponse | IndexerErrorResponse> {
  if (!hasHandler(req.method)) {
    return { id: req.id, error: { code: 'unknown_method', message: `no handler for '${req.method}'` } }
  }
  ctx.bumpActivity()
  try {
    const result = await HANDLERS[req.method]!(ctx, req.params ?? {})
    return { id: req.id, result }
  } catch (err) {
    if (err instanceof VaultOwnedPathError) {
      return { id: req.id, error: { code: 'vault_owned_path', message: err.message } }
    }
    if (err instanceof HandlerError) {
      return { id: req.id, error: { code: err.code, message: err.message, detail: err.detail } }
    }
    process.stderr.write(`[fulcrum-indexer] handler crashed in '${req.method}': ${(err as Error).stack ?? String(err)}\n`)
    return { id: req.id, error: { code: 'internal', message: (err as Error).message } }
  }
}

// ── Existing-daemon probe ──────────────────────────────────────────────────

async function probeExistingDaemon(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = createConnection(socketPath)
    const timer = setTimeout(() => {
      client.destroy()
      resolve(false)
    }, PING_PROBE_TIMEOUT_MS)

    const cleanup = (alive: boolean): void => {
      clearTimeout(timer)
      client.destroy()
      resolve(alive)
    }

    const dec = createDecoder()
    client.on('connect', () => {
      client.write(encode({ id: 1, method: 'ping' }))
    })
    client.on('data', (chunk: Buffer) => {
      try {
        const msgs = dec.feed(chunk)
        if (msgs.length > 0) cleanup(true)
      } catch {
        cleanup(false)
      }
    })
    client.on('error', () => cleanup(false))
    client.on('close', () => cleanup(false))
  })
}

// ── CLI entrypoint ─────────────────────────────────────────────────────────
// Used by `fulcrum daemon indexer` (wired in Unit 1.5).

export async function runDaemonMain(): Promise<void> {
  // Install a single uncaughtException + unhandledRejection guard so anything
  // the handlers miss lands in one consistent log line before we exit.
  const onFatal = (err: unknown): void => {
    process.stderr.write(`[fulcrum-indexer] uncaught: ${(err as Error)?.stack ?? String(err)}\n`)
    process.exit(1)
  }
  process.once('uncaughtException', onFatal)
  process.once('unhandledRejection', onFatal)

  try {
    // Warm the embedder BEFORE startDaemon so the first ensureWatching's initial
    // scan can embed chunks + memories inline (vec_chunks / vec_memories were
    // silently empty before this wiring). Embedding init downloads models on
    // first run and is idempotent — safe to call every daemon start.
    try {
      const { initEmbedding, loadConfig, getTextEmbedder } = await import('fulcrum-agent-core')
      await initEmbedding(loadConfig())
      if (!getTextEmbedder()) {
        process.stderr.write(`[fulcrum-indexer] embedder init returned but getTextEmbedder() is null — vec tables will not be populated\n`)
      }
    } catch (err) {
      process.stderr.write(`[fulcrum-indexer] embedder init failed: ${err instanceof Error ? err.message : String(err)} — vec tables will not be populated\n`)
    }

    const handle = await startDaemon()
    await new Promise<void>((resolve) => handle.server.on('close', resolve))
    process.stderr.write(`[fulcrum-indexer] exited normally\n`)
    process.exit(0)
  } catch (err) {
    if (err instanceof DaemonAlreadyRunningError) {
      process.stderr.write(`[fulcrum-indexer] another daemon already owns ${err.socketPath}; exiting cleanly\n`)
      process.exit(0)
    }
    process.stderr.write(`[fulcrum-indexer] fatal: ${(err as Error).message}\n`)
    process.exit(1)
  }
}
