// TipTap collaboration extensions — wired when FULCRUM_FEATURES=real-time-collab-server.
// Flag OFF → TipTap mounts without collab extensions, no WebSocket.

import { isCollabEnabled } from "./feature-flag.ts";
import { userColor } from "./color.ts";

/** Extension descriptor — avoids importing TipTap at module level. */
export interface CollabExtensionDescriptor {
  name: string;
  config: Record<string, unknown>;
}

/**
 * Build the list of collab-related TipTap extensions for the task editor.
 *
 * @param taskId  - current task ULID (room = "task:<taskId>")
 * @param user    - { id, name } of current user
 * @returns array of extension descriptors (empty when flag OFF)
 */
export function buildCollabExtensions(
  taskId: string,
  user: { id: string; name: string },
  env?: Record<string, string | undefined>,
): CollabExtensionDescriptor[] {
  if (!isCollabEnabled(env)) return [];

  return [
    {
      name: "collaboration",
      config: {
        document: null, // placeholder — Y.Doc injected by provider at mount time
        room: `task:${taskId}`,
      },
    },
    {
      name: "collaborationCursor",
      config: {
        provider: null, // HocuspocusProvider injected at mount time
        user: {
          name: user.name,
          color: userColor(user.id),
        },
      },
    },
  ];
}

/**
 * Build a WebSocket provider URL for the collab server.
 * Returns null when flag OFF.
 */
export function collabProviderUrl(
  taskId: string,
  opts: { host?: string; port?: number } = {},
  env?: Record<string, string | undefined>,
): string | null {
  if (!isCollabEnabled(env)) return null;
  const host = opts.host ?? "localhost";
  const port = opts.port ?? 1234;
  return `ws://${host}:${port}/task:${taskId}`;
}
