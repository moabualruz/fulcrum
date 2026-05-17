/**
 * Collaboration module.
 *
 * Re-exports for collab subsystem. All WebSocket/Hocuspocus paths
 * gated behind FULCRUM_FEATURES=real-time-collab-server.
 * y-indexeddb offline persistence is always-on (flag-independent).
 */

export { isCollabEnabled, shouldStartCollabServer, getCollabEndpoint } from "./collab-flag-guard.ts";
export {
  createHocuspocusConfig,
  HocuspocusPersistenceAdapter,
  parseCollabPort,
  type HocuspocusServerConfig,
} from "./hocuspocus-server.ts";
export {
  createCollabProviders,
  type CollabProviderConfig,
  type CollabProviderResult,
  type WsProviderConfig,
} from "./collab-provider-factory.ts";
export {
  createCollabRoomManager,
  type CollabRoom,
  type CollabRoomManager,
} from "./bun-ws-collab-server.ts";
