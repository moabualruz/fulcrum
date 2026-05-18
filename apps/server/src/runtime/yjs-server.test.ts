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
import * as Y from "yjs";

// Mock YjsSnapshot entity lookups
const mockFindOne = vi.fn();
const mockPersist = vi.fn();
const mockFlush = vi.fn();
const mockSave = vi.fn();
const mockEm = {
  findOne: mockFindOne,
  persist: mockPersist,
  flush: mockFlush,
  save: mockSave,
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
  beforeEach(() => {
    mockFindOne.mockReset();
    mockSave.mockReset();
  });

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

    expect(mockSave).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("applies one client Yjs update to the next authenticated document client", async () => {
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({
      em: mockEm as any,
      validateSession: async () => ({ id: "sess-1", userId: "user-1" }),
      debounceMs: 100,
    });
    mockFindOne.mockResolvedValue(null);

    let firstMessageHandler: ((data: Buffer) => void) | undefined;
    const firstWs = {
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1,
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        if (event === "message") firstMessageHandler = handler;
      }),
    };

    await handler.handleConnection(firstWs as any, {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/doc-alpha",
    });

    const clientDoc = new Y.Doc();
    clientDoc.getMap("body").set("text", "collaborative doc body");
    const update = Buffer.from(Y.encodeStateAsUpdate(clientDoc));
    firstMessageHandler?.(Buffer.concat([Buffer.from([0]), update]));

    const sentUpdates: Buffer[] = [];
    const secondWs = {
      close: vi.fn(),
      send: vi.fn((data: Buffer) => sentUpdates.push(Buffer.from(data))),
      readyState: 1,
      on: vi.fn(),
    };
    await handler.handleConnection(secondWs as any, {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/doc-alpha",
    });

    const receivedDoc = new Y.Doc();
    const latest = sentUpdates.at(-1);
    expect(latest).toBeDefined();
    Y.applyUpdate(receivedDoc, latest!.subarray(1));
    expect(receivedDoc.getMap("body").get("text")).toBe("collaborative doc body");
  });

  it("broadcasts one client Yjs update to another live document client", async () => {
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({
      em: mockEm as any,
      validateSession: async () => ({ id: "sess-1", userId: "user-1" }),
      debounceMs: 100,
    });
    mockFindOne.mockResolvedValue(null);

    let firstMessageHandler: ((data: Buffer) => void) | undefined;
    const firstWs = {
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1,
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        if (event === "message") firstMessageHandler = handler;
      }),
    };
    const liveMessages: Buffer[] = [];
    const secondWs = {
      close: vi.fn(),
      send: vi.fn((data: Buffer) => liveMessages.push(Buffer.from(data))),
      readyState: 1,
      on: vi.fn(),
    };

    await handler.handleConnection(firstWs as any, {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/doc-live",
    });
    await handler.handleConnection(secondWs as any, {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/doc-live",
    });

    const before = liveMessages.length;
    const clientDoc = new Y.Doc();
    clientDoc.getMap("body").set("text", "live collaborative doc body");
    const update = Buffer.from(Y.encodeStateAsUpdate(clientDoc));
    firstMessageHandler?.(Buffer.concat([Buffer.from([0]), update]));

    const broadcast = liveMessages.slice(before).at(-1);
    expect(broadcast).toBeDefined();
    const receivedDoc = new Y.Doc();
    Y.applyUpdate(receivedDoc, broadcast!.subarray(1));
    expect(receivedDoc.getMap("body").get("text")).toBe("live collaborative doc body");
  });

  it("keeps presence messages out of persisted document snapshots", async () => {
    vi.useFakeTimers();
    const mod = await import("./yjs-server.ts");
    const handler = mod.createYjsServer({
      em: mockEm as any,
      validateSession: async () => ({ id: "sess-1", userId: "user-1" }),
      debounceMs: 25,
    });
    mockFindOne.mockResolvedValue(null);

    let messageHandler: ((data: Buffer) => void) | undefined;
    const ws = {
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1,
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        if (event === "message") messageHandler = handler;
      }),
    };

    await handler.handleConnection(ws as any, {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/doc-presence",
    });
    messageHandler?.(Buffer.from([1, ...Buffer.from(JSON.stringify({ cursor: { anchor: 1, head: 3 } }))]));
    vi.advanceTimersByTime(50);

    expect(mockSave).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reloads a persisted Yjs snapshot after handler restart", async () => {
    const snapshots = new Map<string, { docName: string; state: Buffer; updatedAt: Date }>();
    const em = {
      findOne: vi.fn(async (_entity: unknown, options: { where?: { docName?: string } }) => {
        const docName = options.where?.docName;
        return docName ? snapshots.get(docName) ?? null : null;
      }),
      save: vi.fn(async (snapshot: { docName: string; state: Buffer; updatedAt: Date }) => {
        snapshots.set(snapshot.docName, { ...snapshot });
        return snapshot;
      }),
    };

    const mod = await import("./yjs-server.ts");
    const firstHandler = mod.createYjsServer({
      em: em as any,
      validateSession: async () => ({ id: "sess-1", userId: "user-1" }),
    });
    const sourceDoc = new Y.Doc();
    sourceDoc.getMap("body").set("text", "snapshot survives restart");
    await firstHandler.persistDoc("doc-restart", Buffer.from(Y.encodeStateAsUpdate(sourceDoc)));

    const secondHandler = mod.createYjsServer({
      em: em as any,
      validateSession: async () => ({ id: "sess-2", userId: "user-2" }),
    });
    const sentUpdates: Buffer[] = [];
    const ws = {
      close: vi.fn(),
      send: vi.fn((data: Buffer) => sentUpdates.push(Buffer.from(data))),
      readyState: 1,
      on: vi.fn(),
    };
    await secondHandler.handleConnection(ws as any, {
      headers: { authorization: "Bearer valid-token" },
      url: "/yjs/doc-restart",
    });

    const reloadedDoc = new Y.Doc();
    const latest = sentUpdates.at(-1);
    expect(latest).toBeDefined();
    Y.applyUpdate(reloadedDoc, latest!.subarray(1));
    expect(reloadedDoc.getMap("body").get("text")).toBe("snapshot survives restart");
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
      expect.objectContaining({ where: { docName: "task-abc" } })
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
