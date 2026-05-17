// Feature flag for real-time collaboration server.
// Gate: FULCRUM_FEATURES must contain "real-time-collab-server".

const FLAG = "real-time-collab-server";

export function isCollabEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.FULCRUM_FEATURES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .includes(FLAG);
}
