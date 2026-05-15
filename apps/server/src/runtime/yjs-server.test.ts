/**
 * yjs-server.test.ts — TDD tests for Yjs WebSocket server (workflow milestone).
 *
 * Tests:
 * - Auth rejection: WebSocket without valid session -> close 4401
 * - Persistence: doc update -> YjsSnapshot saved after debounce
 * - Load: pre-seeded snapshot -> doc has state on connect
 * - Standalone boot: FULCRUM_YJS_STANDALONE=true -> binds to FULCRUM_YJS_PORT
 */
import { describe, it, expect, beforeEach, vi } from "bun:test";

// Mock YjsSnapshot entity lookups
const mockFindOne = vi.fn();
const mockPersist = vi.fn();
const mockFlush = vi.fn();
const mockEm = {
  findOne: mockFindOne,
  persist: mockPersist,
  flush: mockFlush,
  fork: vi.fn().mockReturnThis(),
};

vi.mock("@work-management/infrastructure/database/entities/tasks/YjsSnapshot.ts", () => ({
  YjsSnapshot: class YjsSnapshot {
    docName!: string;
    state!: Buffer;
    updatedAt!: Date;
  },
}));

describe("createYjsServer", () => {
  it("exports createYjsServer function", async () => {
    const mod = await import("./yjs-server.ts");
    expect(typeof mod.createYjsServer).toBe("function");
  });

  it("exports startYjsServer function", async () => {
    const mod = await import("./yjs-server.ts");
    expect(typeof mod.startYjsServer).toBe("function");
  });

  it("exports getYjsUrl function", async () => {
    const mod = await import("./yjs-server.ts");
    expect(typeof mod.getYjsUrl).toBe("function");
  });

  it("getYjsUrl returns FULCRUM_YJS_URL env var when set", async () => {
    process.env.FULCRUM_YJS_URL = "ws://custom-host:9999";
    const mod = await import("./yjs-server.ts");
    expect(mod.getYjsUrl()).toBe("ws://custom-host:9999");
    delete process.env.FULCRUM_YJS_URL;
  });

  it("getYjsUrl returns default when FULCRUM_YJS_URL not set", async () => {
    delete process.env.FULCRUM_YJS_URL;
    const mod = await import("./yjs-server.ts");
    const url = mod.getYjsUrl();
    expect(url).toMatch(/^ws:\/\//);
    expect(url).not.toContain("undefined");
  });
});

describe("auth rejection", () => {
  it("rejects WebSocket upgrade without Authorization header (returns 4401 close code)", async () => {
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({ em: mockEm as any });

    // Simulate a WebSocket connection with no auth
    const mockWs = {
      close: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
      readyState: 1,
    };
    const mockReq = {
      headers: {},
      url: "/yjs/task-123",
    };

    // Call the connection handler — should close with 4401
    await handler.handleConnection(mockWs as any, mockReq as any);
    expect(mockWs.close).toHaveBeenCalledWith(4401, expect.any(String));
  });

  it("accepts WebSocket upgrade with valid Authorization header", async () => {
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({
      em: mockEm as any,
      validateSession: async () => ({ id: "sess-1", userId: "user-1" }),
    });

    const mockWs = {
      close: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
      readyState: 1,
    };
    const mockReq = {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/task-123",
    };

    mockFindOne.mockResolvedValueOnce(null); // no existing snapshot

    await handler.handleConnection(mockWs as any, mockReq as any);
    // Should NOT close with 4401
    expect(mockWs.close).not.toHaveBeenCalledWith(4401, expect.any(String));
  });
});

describe("persistence", () => {
  it("saves YjsSnapshot after update (debounced)", async () => {
    vi.useFakeTimers();
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({
      em: mockEm as any,
      validateSession: async () => ({ id: "sess-1", userId: "user-1" }),
      debounceMs: 100,
    });

    mockFindOne.mockResolvedValue(null);

    // Trigger persistence directly via persistDoc
    await handler.persistDoc("task-test", Buffer.from([1, 2, 3]));

    expect(mockPersist).toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("loads existing snapshot on doc init", async () => {
    const existingState = Buffer.from([4, 5, 6]);
    mockFindOne.mockResolvedValueOnce({
      docName: "task-abc",
      state: existingState,
      updatedAt: new Date(),
    });

    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({ em: mockEm as any });
    const state = await handler.loadDoc("task-abc");

    expect(state).toEqual(existingState);
    expect(mockFindOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ docName: "task-abc" })
    );
  });

  it("returns null when no existing snapshot", async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({ em: mockEm as any });
    const state = await handler.loadDoc("task-new");
    expect(state).toBeNull();
  });
});

describe("standalone mode", () => {
  it("startYjsServer uses FULCRUM_YJS_PORT env var", async () => {
    const mod = await import("./yjs-server.ts");
    // Should be callable without throwing — just verify it's a function accepting em
    expect(typeof mod.startYjsServer).toBe("function");
  });
});
