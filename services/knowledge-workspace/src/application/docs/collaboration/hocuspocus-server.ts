/**
 * Hocuspocus server factory.
 *
 * Creates configuration for a Hocuspocus v4 WebSocket server.
 * Server runs in-process on `fulcrum web` when flag ON.
 *
 * Persistence: onStoreDocument writes Yjs binary to doc_versions table
 * alongside existing snapshot/delta path. onLoadDocument reads latest Yjs binary.
 *
 * Room naming: `doc:<doc_id>` for documents, `task:<task_id>` for task descriptions.
 * Shared server, different room prefixes.
 *
 * Entire module gated behind FULCRUM_FEATURES=real-time-collab-server.
 * Fallback: if Hocuspocus v4 unavailable → custom Bun WS + y-websocket protocol.
 */

/** Default Hocuspocus port. */
const DEFAULT_PORT = 1234;

/** Parse HOCUSPOCUS_PORT env, default 1234. */
export function parseCollabPort(): number {
  const envPort = Number.parseInt(process.env.HOCUSPOCUS_PORT ?? "", 10);
  return Number.isInteger(envPort) && envPort > 0 ? envPort : DEFAULT_PORT;
}

export interface HocuspocusServerConfig {
  port: number;
  name: string;
  quiet: boolean;
  onStoreDocument: (data: { documentName: string; state: Uint8Array }) => Promise<void>;
  onLoadDocument: (data: { documentName: string }) => Promise<Uint8Array | null>;
}

export interface CreateHocuspocusConfigOptions {
  port?: number;
  quiet?: boolean;
  onStore?: (data: { documentName: string; state: Uint8Array }) => Promise<void>;
  onLoad?: (data: { documentName: string }) => Promise<Uint8Array | null>;
}

/**
 * Create Hocuspocus server configuration.
 * Does NOT start the server — caller is responsible for instantiation.
 */
export function createHocuspocusConfig(
  options?: CreateHocuspocusConfigOptions,
): HocuspocusServerConfig {
  const port = options?.port ?? DEFAULT_PORT;

  return {
    port,
    name: "fulcrum-collab",
    quiet: options?.quiet ?? false,
    onStoreDocument:
      options?.onStore ??
      (async (_data) => {
        // Default no-op; wired to doc_versions persistence in production.
      }),
    onLoadDocument:
      options?.onLoad ??
      (async (_data) => {
        // Default returns null; wired to doc_versions load in production.
        return null;
      }),
  };
}

/**
 * Persistence adapter — serializes/deserializes Yjs state for DB storage.
 *
 * Yjs state is stored as binary (Uint8Array) in doc_versions.yjs_state (bytea column).
 * This adapter handles the conversion between Yjs state vectors and Buffer for DB I/O.
 */
export class HocuspocusPersistenceAdapter {
  /** Serialize Yjs state to Buffer for DB storage. */
  serializeState(state: Uint8Array): Buffer {
    return Buffer.from(state);
  }

  /** Deserialize Buffer from DB to Yjs state. */
  deserializeState(buf: Buffer): Uint8Array {
    return new Uint8Array(buf);
  }

  /**
   * Extract document ID from room name.
   * Only `doc:` prefixed rooms map to Document entities.
   * `task:` rooms are handled by the task editing collaboration adapter.
   */
  extractDocId(roomName: string): string | null {
    if (roomName.startsWith("doc:")) {
      return roomName.slice(4);
    }
    // task: rooms are not persisted by the document collaboration adapter.
    return null;
  }
}
