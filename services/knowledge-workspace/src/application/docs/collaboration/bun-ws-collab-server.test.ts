/**
 * Tests for Bun WebSocket collaboration server fallback behavior.
 *
 * The Bun WS server implements y-websocket protocol directly,
 * serving as primary (or fallback if Hocuspocus v4 unstable under Bun).
 *
 * Tests the server factory, room management, and message routing.
 */

import { describe, test, expect } from "bun:test";
import {
  createCollabRoomManager,
  type CollabRoom,
  type CollabRoomManager,
} from "./bun-ws-collab-server.ts";

describe("bun-ws-collab-server", () => {
  describe("CollabRoomManager", () => {
    test("getOrCreateRoom creates room on first access", () => {
      const mgr = createCollabRoomManager();
      const room = mgr.getOrCreateRoom("doc:test-1");
      expect(room).toBeDefined();
      expect(room.name).toBe("doc:test-1");
      expect(room.connections).toBe(0);
    });

    test("getOrCreateRoom returns same room on second access", () => {
      const mgr = createCollabRoomManager();
      const room1 = mgr.getOrCreateRoom("doc:test-2");
      const room2 = mgr.getOrCreateRoom("doc:test-2");
      expect(room1).toBe(room2);
    });

    test("addConnection increments count", () => {
      const mgr = createCollabRoomManager();
      const room = mgr.getOrCreateRoom("doc:test-3");
      mgr.addConnection("doc:test-3");
      expect(room.connections).toBe(1);
      mgr.addConnection("doc:test-3");
      expect(room.connections).toBe(2);
    });

    test("removeConnection decrements count", () => {
      const mgr = createCollabRoomManager();
      mgr.getOrCreateRoom("doc:test-4");
      mgr.addConnection("doc:test-4");
      mgr.addConnection("doc:test-4");
      mgr.removeConnection("doc:test-4");
      expect(mgr.getOrCreateRoom("doc:test-4").connections).toBe(1);
    });

    test("removeConnection cleans up room when connections reach 0", () => {
      const mgr = createCollabRoomManager();
      mgr.getOrCreateRoom("doc:test-5");
      mgr.addConnection("doc:test-5");
      mgr.removeConnection("doc:test-5");
      expect(mgr.roomCount()).toBe(0);
    });

    test("roomCount returns number of active rooms", () => {
      const mgr = createCollabRoomManager();
      expect(mgr.roomCount()).toBe(0);
      mgr.getOrCreateRoom("doc:a");
      mgr.addConnection("doc:a");
      mgr.getOrCreateRoom("doc:b");
      mgr.addConnection("doc:b");
      expect(mgr.roomCount()).toBe(2);
    });

    test("listRooms returns room names", () => {
      const mgr = createCollabRoomManager();
      mgr.getOrCreateRoom("doc:x");
      mgr.addConnection("doc:x");
      mgr.getOrCreateRoom("task:y");
      mgr.addConnection("task:y");
      const names = mgr.listRooms();
      expect(names).toContain("doc:x");
      expect(names).toContain("task:y");
    });
  });
});
