/**
 * Collab provider factory — P7#21 gated real-time collab.
 *
 * Creates Yjs document + provider configurations based on feature flag state.
 *
 * Flag OFF: y-indexeddb only (offline persistence, standalone editor).
 * Flag ON: y-indexeddb + HocuspocusProvider (WebSocket collab + cursors).
 *
 * y-indexeddb is ALWAYS on regardless of flag (PRD acceptance criteria).
 *
 * This module is client-side; it creates configuration objects but does NOT
 * instantiate actual providers (those need browser/DOM context).
 * The Svelte component uses these configs to wire up providers.
 *
 * C1: WebSocket path gated behind FULCRUM_FEATURES=real-time-collab-server.
 */

/**
 * Minimal Yjs Doc interface — avoids importing yjs in test environment.
 * Production code uses real Y.Doc from yjs package.
 */
interface YDoc {
  getXmlFragment(name: string): unknown;
}

/** Lightweight Y.Doc stub for config generation (no actual CRDT state). */
class YDocStub implements YDoc {
  getXmlFragment(_name: string): unknown {
    return {};
  }
}

export interface CollabProviderConfig {
  docId: string;
  flagEnabled: boolean;
  wsPort?: number;
  wsHost?: string;
  userName?: string;
  userColor?: string;
}

export interface WsProviderConfig {
  url: string;
  name: string;
  awareness: {
    userName: string;
    userColor: string;
  };
}

export interface CollabProviderResult {
  ydoc: YDoc;
  indexeddbProviderName: string;
  wsProviderConfig: WsProviderConfig | null;
  wsUrl: string | null;
}

const DEFAULT_PORT = 1234;
const DEFAULT_HOST = "localhost";

/**
 * Create collab provider configurations for a document.
 *
 * Returns a YDoc stub + provider configs. Actual provider instantiation
 * happens in the Svelte component (needs browser context for IndexedDB/WS).
 */
export function createCollabProviders(config: CollabProviderConfig): CollabProviderResult {
  const ydoc = new YDocStub();
  const indexeddbProviderName = `fulcrum-${config.docId}`;

  if (!config.flagEnabled) {
    return {
      ydoc,
      indexeddbProviderName,
      wsProviderConfig: null,
      wsUrl: null,
    };
  }

  const port = config.wsPort ?? DEFAULT_PORT;
  const host = config.wsHost ?? DEFAULT_HOST;
  const wsUrl = `ws://${host}:${port}/collab`;

  return {
    ydoc,
    indexeddbProviderName,
    wsProviderConfig: {
      url: wsUrl,
      name: config.docId,
      awareness: {
        userName: config.userName ?? "Anonymous",
        userColor: config.userColor ?? "#808080",
      },
    },
    wsUrl,
  };
}
