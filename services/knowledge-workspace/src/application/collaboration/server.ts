// Hocuspocus v4 collab server — gated behind FULCRUM_FEATURES=real-time-collab-server.
// Rooms keyed by "task:<task_id>". onLoadDocument hydrates from DB, onStoreDocument
// debounce-saves back. Shared by task editing and document editing flows.

import { isCollabEnabled } from "./feature-flag.ts";

/** Minimal SQL interface for collab persistence. */
export interface CollabDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Debounce interval for onStoreDocument saves (ms). */
export const STORE_DEBOUNCE_MS = 2000;

/**
 * Parse a Hocuspocus room name into its entity kind + ID.
 * Room format: "task:<ulid>" or "doc:<ulid>".
 */
export function parseRoom(name: string): { kind: "task" | "doc"; id: string } | null {
  const m = name.match(/^(task|doc):(.+)$/);
  const kind = m?.[1];
  const id = m?.[2];
  if ((kind !== "task" && kind !== "doc") || !id) return null;
  return { kind, id };
}

// --- Debounce bookkeeping (module-level, one per room) ---

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearDebounceTimers(): void {
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
}

/**
 * Schedule a debounced store for the given room.
 * Resets timer on each call; fires `saveFn` after STORE_DEBOUNCE_MS of inactivity.
 */
export function scheduleStore(
  roomName: string,
  saveFn: () => Promise<void>,
): void {
  const existing = debounceTimers.get(roomName);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    roomName,
    setTimeout(() => {
      debounceTimers.delete(roomName);
      saveFn().catch((err) => {
        console.error(`[collab] store failed for ${roomName}:`, err);
      });
    }, STORE_DEBOUNCE_MS),
  );
}

/**
 * Build the Hocuspocus onLoadDocument handler.
 * Fetches tiptap_content from tasks table and hydrates the Yjs doc.
 */
export function makeOnLoadDocument(db: CollabDb) {
  return async (data: { documentName: string; document: YDocLike }) => {
    const room = parseRoom(data.documentName);
    if (!room || room.kind !== "task") return;

    const rows = await db.query<{ tiptap_content: unknown }>(
      `SELECT tiptap_content FROM tasks WHERE id = $1`,
      [room.id],
    );
    const content = rows[0]?.tiptap_content;
    if (content && typeof content === "object") {
      // Hydrate the Y.Doc from stored TipTap JSON.
      // In production, uses Y.applyUpdate or TipTap's yDocToProsemirrorJSON utilities.
      data.document._hydrate(content);
    }
  };
}

/**
 * Build the Hocuspocus onStoreDocument handler (debounced).
 * Extracts TipTap JSON from Y.Doc and writes to DB.
 */
export function makeOnStoreDocument(db: CollabDb) {
  return (data: { documentName: string; document: YDocLike }) => {
    const room = parseRoom(data.documentName);
    if (!room || room.kind !== "task") return;

    const content = data.document._serialize();
    scheduleStore(data.documentName, async () => {
      await db.query(
        `UPDATE tasks SET tiptap_content = $1, updated_at = now() WHERE id = $2`,
        [JSON.stringify(content), room.id],
      );
    });
  };
}

/** Minimal Y.Doc interface for typing without importing yjs at module level. */
export interface YDocLike {
  _hydrate(content: unknown): void;
  _serialize(): unknown;
}

/**
 * Start the Hocuspocus collab server. Returns a stop function.
 * Does nothing when feature flag is OFF.
 */
export async function startCollabServer(
  db: CollabDb,
  opts: { port?: number } = {},
): Promise<{ stop: () => Promise<void> } | null> {
  if (!isCollabEnabled()) return null;

  // Dynamic import — @hocuspocus/server only loaded when flag is ON.
  const { Server } = await import("@hocuspocus/server");
  const port = opts.port ?? 1234;

  const server = Server.configure({
    port,
    onLoadDocument: makeOnLoadDocument(db),
    onStoreDocument: makeOnStoreDocument(db) as any,
  });

  await server.listen();

  return {
    stop: async () => {
      clearDebounceTimers();
      await server.destroy();
    },
  };
}
