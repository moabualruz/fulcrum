/**
 * Collab feature flag guard — P7#21.
 *
 * Pure functions that check `real-time-collab-server` flag from a features string.
 * No side effects, no imports beyond stdlib. Used by server startup and client provider factory.
 *
 * C1: gated behind FULCRUM_FEATURES=real-time-collab-server.
 */

const FLAG = "real-time-collab-server";

/** Parse comma-separated features string into trimmed set. */
function parseFeatures(features: string): Set<string> {
  return new Set(
    features
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean),
  );
}

/** Whether real-time collab is enabled in the given features string. */
export function isCollabEnabled(features: string): boolean {
  return parseFeatures(features).has(FLAG);
}

/** Whether the Hocuspocus server should start (same as isCollabEnabled). */
export function shouldStartCollabServer(features: string): boolean {
  return isCollabEnabled(features);
}

/**
 * Return the WebSocket collab endpoint URL, or null if flag is off.
 * Endpoint path is always `/collab`.
 */
export function getCollabEndpoint(features: string, port: number): string | null {
  if (!isCollabEnabled(features)) return null;
  return `ws://localhost:${port}/collab`;
}
