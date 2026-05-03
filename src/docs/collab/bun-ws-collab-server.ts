/**
 * Bun WebSocket collab server — P7#21 fallback/primary y-websocket implementation.
 *
 * Implements the y-websocket protocol over Bun.serve() WebSockets.
 * Used as primary path (or fallback if Hocuspocus v4 crashes under Bun stress test).
 *
 * Room management: one Y.Doc per room, rooms created on first connection,
 * cleaned up when last connection drops. Room names follow `doc:<id>` / `task:<id>` convention.
 *
 * C1: entire module gated behind FULCRUM_FEATURES=real-time-collab-server.
 */

export interface CollabRoom {
  name: string;
  connections: number;
  createdAt: Date;
}

export interface CollabRoomManager {
  getOrCreateRoom(name: string): CollabRoom;
  addConnection(name: string): void;
  removeConnection(name: string): void;
  roomCount(): number;
  listRooms(): string[];
}

/** Create a room manager for tracking active collab rooms. */
export function createCollabRoomManager(): CollabRoomManager {
  const rooms = new Map<string, CollabRoom>();

  return {
    getOrCreateRoom(name: string): CollabRoom {
      let room = rooms.get(name);
      if (!room) {
        room = { name, connections: 0, createdAt: new Date() };
        rooms.set(name, room);
      }
      return room;
    },

    addConnection(name: string): void {
      const room = rooms.get(name);
      if (room) {
        room.connections += 1;
      }
    },

    removeConnection(name: string): void {
      const room = rooms.get(name);
      if (room) {
        room.connections -= 1;
        if (room.connections <= 0) {
          rooms.delete(name);
        }
      }
    },

    roomCount(): number {
      return rooms.size;
    },

    listRooms(): string[] {
      return Array.from(rooms.keys());
    },
  };
}
