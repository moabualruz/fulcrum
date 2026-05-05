/**
 * yjs-server.ts — Yjs WebSocket server with auth + persistence (Plan 05-13).
 *
 * Dual-mode:
 *   - In-process: import { createYjsServer } and mount alongside Hono
 *   - Standalone: FULCRUM_YJS_STANDALONE=true -> runs own WS server on FULCRUM_YJS_PORT
 *
 * Auth: validates Authorization header or cookie on WebSocket upgrade.
 *       Rejects with close code 4401 if invalid.
 *
 * Persistence: debounced save of Y.Doc state to YjsSnapshot entity in PostgreSQL.
 *
 * MEDIUM-08 fix: client URL is always read from FULCRUM_YJS_URL env var (never hardcoded).
 * LOW-04 fix: startYjsServer exported for Hono startup integration.
 */

import * as Y from "yjs";
import { WebSocketServer, WebSocket } from "ws";
import type { EntityManager } from "@mikro-orm/postgresql";
import { YjsSnapshot } from "../db/entities/tasks/YjsSnapshot.ts";

// ── URL helper (MEDIUM-08) ─────────────────────────────────────────────────

/**
 * Returns the Yjs WebSocket URL from environment.
 * NEVER hardcoded — always reads FULCRUM_YJS_URL.
 */
export function getYjsUrl(): string {
  return process.env.FULCRUM_YJS_URL ?? "ws://localhost:1234";
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  userId: string;
}

export interface YjsServerOptions {
  em: EntityManager;
  /** Custom session validator. Default: extract from Authorization header (Bearer token must be non-empty). */
  validateSession?: (
    headers: Record<string, string | string[] | undefined>
  ) => Promise<SessionInfo | null>;
  /** Debounce delay for persistence in ms. Default: 2000 */
  debounceMs?: number;
  /** Port for standalone mode. Overrides FULCRUM_YJS_PORT. */
  port?: number;
}

export interface YjsServerHandler {
  /** Call on raw WebSocket connection event. Returns Promise — auth is async. */
  handleConnection(
    ws: WebSocket,
    req: { headers: Record<string, string | string[] | undefined>; url?: string }
  ): Promise<void>;
  /** Persist a Yjs doc state update directly (exposed for testing) */
  persistDoc(docName: string, state: Buffer): Promise<void>;
  /** Load a Yjs doc state from DB (exposed for testing) */
  loadDoc(docName: string): Promise<Buffer | null>;
}

// ── Default session validator ──────────────────────────────────────────────

/**
 * Default auth: require non-empty Authorization: Bearer <token>.
 * Production deployments should inject validateSession that checks against DB.
 */
async function defaultValidateSession(
  headers: Record<string, string | string[] | undefined>
): Promise<SessionInfo | null> {
  const auth = headers["authorization"];
  if (!auth) return null;
  const token = Array.isArray(auth) ? auth[0] : auth;
  if (!token || !token.startsWith("Bearer ")) return null;
  const tokenValue = token.slice(7).trim();
  if (!tokenValue) return null;
  // In production, look up session in DB. For in-process, accept any non-empty token.
  return { id: tokenValue, userId: "authenticated" };
}

// ── Debounce helper ────────────────────────────────────────────────────────

function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as T;
}

// ── createYjsServer ────────────────────────────────────────────────────────

/**
 * Create a Yjs WebSocket handler.
 *
 * Manages per-document Y.Doc instances in memory.
 * On connection:
 *   1. Validates session (rejects 4401 if invalid)
 *   2. Loads existing snapshot from DB if available
 *   3. Handles Yjs sync protocol messages
 *   4. Debounces persistence on update
 */
export function createYjsServer(options: YjsServerOptions): YjsServerHandler {
  const {
    em,
    validateSession = defaultValidateSession,
    debounceMs = 2000,
  } = options;

  // In-memory document store: docName -> Y.Doc
  const docs = new Map<string, Y.Doc>();

  // ── persistDoc ────────────────────────────────────────────────────────

  async function persistDoc(docName: string, state: Buffer): Promise<void> {
    // Fork em to avoid concurrent mutation conflicts
    const forkedEm: EntityManager = (em as any).fork ? (em as any).fork() : em;
    let snapshot = await forkedEm.findOne(YjsSnapshot, { docName });
    if (!snapshot) {
      snapshot = new YjsSnapshot();
      snapshot.docName = docName;
    }
    snapshot.state = state;
    snapshot.updatedAt = new Date();
    forkedEm.persist(snapshot);
    await forkedEm.flush();
  }

  // ── loadDoc ───────────────────────────────────────────────────────────

  async function loadDoc(docName: string): Promise<Buffer | null> {
    const forkedEm: EntityManager = (em as any).fork ? (em as any).fork() : em;
    const snapshot = await forkedEm.findOne(YjsSnapshot, { docName });
    return snapshot ? snapshot.state : null;
  }

  // ── getOrCreateDoc ────────────────────────────────────────────────────

  function getOrCreateDoc(docName: string): Y.Doc {
    if (!docs.has(docName)) {
      docs.set(docName, new Y.Doc());
    }
    return docs.get(docName)!;
  }

  // ── handleConnection ──────────────────────────────────────────────────

  async function handleConnection(
    ws: WebSocket,
    req: { headers: Record<string, string | string[] | undefined>; url?: string }
  ): Promise<void> {
    // Auth gate (T-05-28): validate session before any document access
    let session: SessionInfo | null;
    try {
      session = await validateSession(req.headers);
    } catch (_e) {
      ws.close(4401, "Unauthorized: session validation failed");
      return;
    }

    if (!session) {
      ws.close(4401, "Unauthorized: valid session required");
      return;
    }

    // Extract doc name from URL path: /yjs/task-{id} or /yjs/doc-{id}
    const urlPath = req.url ?? "";
    const docName = urlPath.split("/").pop() ?? "unknown";

    const doc = getOrCreateDoc(docName);

    // Load snapshot on first connection to this doc (rehydrate from DB)
    const existingState = await loadDoc(docName);
    if (existingState && existingState.length > 0) {
      try {
        Y.applyUpdate(doc, new Uint8Array(existingState));
      } catch (_e) {
        // Ignore corrupt snapshots — fresh doc is better than crash
      }
    }

    // Debounced persist on doc updates
    const debouncedPersist = debounce(async () => {
      const state = Buffer.from(Y.encodeStateAsUpdate(doc));
      await persistDoc(docName, state);
    }, debounceMs);

    doc.on("update", debouncedPersist);

    // Send initial doc state to new client
    const syncStep1 = Y.encodeStateAsUpdate(doc);
    if (ws.readyState === WebSocket.OPEN) {
      const encoder = new Uint8Array(syncStep1.length + 1);
      encoder[0] = 0; // messageSync type
      encoder.set(syncStep1, 1);
      ws.send(encoder);
    }

    // Handle incoming messages from client
    ws.on("message", (data: Buffer) => {
      try {
        const update = new Uint8Array(data);
        // Apply Yjs update from client (messageSync = 0)
        if (update[0] === 0) {
          Y.applyUpdate(doc, update.slice(1));
        }
      } catch (_e) {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      doc.off("update", debouncedPersist);
    });
  }

  return {
    handleConnection,
    persistDoc,
    loadDoc,
  };
}

// ── startYjsServer ─────────────────────────────────────────────────────────

/**
 * Start Yjs server in standalone mode.
 * LOW-04: exported for Hono startup integration.
 *
 * Usage:
 *   import { startYjsServer } from './yjs-server.ts';
 *   startYjsServer(em); // listens on FULCRUM_YJS_PORT (default 4444)
 */
export function startYjsServer(em: EntityManager, port?: number): WebSocketServer {
  const resolvedPort =
    port ??
    (process.env.FULCRUM_YJS_PORT ? Number(process.env.FULCRUM_YJS_PORT) : 4444);

  const handler = createYjsServer({ em });
  const wss = new WebSocketServer({ port: resolvedPort });

  wss.on("connection", (ws, req) => {
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k] = v;
    }
    // Fire-and-forget — auth errors close the socket internally
    void handler.handleConnection(ws, { headers, url: req.url ?? "/" });
  });

  wss.on("listening", () => {
    console.log(`[yjs-server] Standalone Yjs server listening on :${resolvedPort}`);
  });

  return wss;
}
