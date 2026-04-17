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
import { VaultOwnedPathError } from '../pci/singleton.js'
import { projectIdsFromPath } from 'fulcrum-agent-core'

const DAEMON_VERSION = '0.0.2'
const PING_PROBE_TIMEOUT_MS = 500

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
  })

  const ctx: DaemonContext = {
    version: DAEMON_VERSION,
    startedAt,
    registry,
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

  sock.on('data', async (chunk: Buffer) => {
    let messages: ReturnType<typeof decoder.feed>
    try {
      messages = decoder.feed(chunk)
    } catch (err) {
      process.stderr.write(`[fulcrum-indexer] decoder error; closing client — ${(err as Error).message}\n`)
      sock.end()
      return
    }
    for (const msg of messages) {
      // Only request messages are expected from clients.
      if (!isRequest(msg)) continue
      const response = await dispatch(ctx, msg)
      try { sock.write(encode(response)) } catch { /* peer closed */ }
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
  try {
    const handle = await startDaemon()
    // Keep the process alive until server.close() resolves.
    await new Promise<void>((resolve) => handle.server.on('close', resolve))
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
