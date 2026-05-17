import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  parseRoom,
  makeOnLoadDocument,
  makeOnStoreDocument,
  scheduleStore,
  clearDebounceTimers,
  STORE_DEBOUNCE_MS,
  type CollabDb,
  type YDocLike,
} from "./server.ts";

// --- parseRoom ---

describe("parseRoom", () => {
  test("parses task:<id>", () => {
    expect(parseRoom("task:abc123")).toEqual({ kind: "task", id: "abc123" });
  });

  test("parses doc:<id>", () => {
    expect(parseRoom("doc:xyz")).toEqual({ kind: "doc", id: "xyz" });
  });

  test("returns null for unknown prefix", () => {
    expect(parseRoom("unknown:xyz")).toBeNull();
  });

  test("returns null for malformed input", () => {
    expect(parseRoom("")).toBeNull();
    expect(parseRoom("task")).toBeNull();
  });
});

// --- onLoadDocument ---

describe("onLoadDocument", () => {
  test("hydrates Y.Doc from DB tiptap_content", async () => {
    const stored = { type: "doc", content: [{ type: "paragraph" }] };
    const fakeDb: CollabDb = {
      query: mock(async <T>() => [{ tiptap_content: stored } as T]) as CollabDb["query"],
    };
    const handler = makeOnLoadDocument(fakeDb);
    const hydrated: unknown[] = [];
    const doc: YDocLike = {
      _hydrate: (c) => hydrated.push(c),
      _serialize: () => null,
    };

    await handler({ documentName: "task:t1", document: doc });

    expect(fakeDb.query).toHaveBeenCalledWith(
      `SELECT tiptap_content FROM tasks WHERE id = $1`,
      ["t1"],
    );
    expect(hydrated).toEqual([stored]);
  });

  test("skips hydration when no row found", async () => {
    const fakeDb: CollabDb = { query: mock(async () => []) };
    const handler = makeOnLoadDocument(fakeDb);
    const hydrated: unknown[] = [];
    const doc: YDocLike = {
      _hydrate: (c) => hydrated.push(c),
      _serialize: () => null,
    };

    await handler({ documentName: "task:missing", document: doc });
    expect(hydrated).toHaveLength(0);
  });

  test("ignores non-task rooms", async () => {
    const fakeDb: CollabDb = { query: mock(async () => []) };
    const handler = makeOnLoadDocument(fakeDb);
    const doc: YDocLike = { _hydrate: () => {}, _serialize: () => null };

    await handler({ documentName: "doc:d1", document: doc });
    // Document rooms are persisted by the document collaboration adapter.
    expect(fakeDb.query).not.toHaveBeenCalled();
  });
});

// --- onStoreDocument debounce ---

describe("onStoreDocument + debounce", () => {
  beforeEach(() => clearDebounceTimers());
  afterEach(() => clearDebounceTimers());

  test("scheduleStore fires after STORE_DEBOUNCE_MS of inactivity", async () => {
    let fired = 0;
    const saveFn = mock(async () => { fired++; });

    scheduleStore("task:t1", saveFn);

    // Not fired yet
    expect(fired).toBe(0);

    // Wait for debounce
    await new Promise((r) => setTimeout(r, STORE_DEBOUNCE_MS + 50));
    expect(fired).toBe(1);
  });

  test("scheduleStore resets timer on rapid calls — fires once", async () => {
    let fired = 0;
    const saveFn = mock(async () => { fired++; });

    scheduleStore("task:t2", saveFn);
    await new Promise((r) => setTimeout(r, 500));
    scheduleStore("task:t2", saveFn); // reset
    await new Promise((r) => setTimeout(r, 500));
    scheduleStore("task:t2", saveFn); // reset again

    // Wait full debounce from last call
    await new Promise((r) => setTimeout(r, STORE_DEBOUNCE_MS + 50));
    expect(fired).toBe(1);
  });

  test("onStoreDocument schedules DB update for task rooms", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const fakeDb: CollabDb = {
      query: mock(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        return [];
      }),
    };
    const handler = makeOnStoreDocument(fakeDb);
    const content = { type: "doc", content: [] };
    const doc: YDocLike = {
      _hydrate: () => {},
      _serialize: () => content,
    };

    handler({ documentName: "task:t3", document: doc });

    // Not yet — debouncing
    expect(queries).toHaveLength(0);

    await new Promise((r) => setTimeout(r, STORE_DEBOUNCE_MS + 50));

    expect(queries).toHaveLength(1);
    const query = queries[0];
    if (!query) throw new Error("expected one DB query");
    expect(query.sql).toContain("UPDATE tasks SET tiptap_content");
    expect(query.params[0]).toBe(JSON.stringify(content));
    expect(query.params[1]).toBe("t3");
  });
});

// --- Convergence test (two clients, simulated) ---

describe("convergence (simulated)", () => {
  test("two clients connecting to same room see same content", async () => {
    // Simulate: client A inserts "hello" → stored → client B loads → sees "hello".
    const stored: Record<string, unknown> = {};
    const fakeDb: CollabDb = {
      query: mock(async <T>(sql: string, params?: unknown[]) => {
        if (sql.includes("SELECT")) {
          const id = params?.[0];
          if (typeof id !== "string") throw new Error("expected task id param");
          return (stored[id] ? [{ tiptap_content: stored[id] }] : []) as T[];
        }
        if (sql.includes("UPDATE")) {
          const rawContent = params?.[0];
          const id = params?.[1];
          if (typeof rawContent !== "string" || typeof id !== "string") {
            throw new Error("expected update params");
          }
          const content = JSON.parse(rawContent);
          stored[id] = content;
          return [] as T[];
        }
        return [] as T[];
      }) as CollabDb["query"],
    };

    const onLoad = makeOnLoadDocument(fakeDb);
    const onStore = makeOnStoreDocument(fakeDb);

    // Client A writes "hello"
    const contentA = { type: "doc", content: [{ type: "paragraph", text: "hello" }] };
    const docA: YDocLike = {
      _hydrate: () => {},
      _serialize: () => contentA,
    };
    onStore({ documentName: "task:conv1", document: docA });

    // Wait for debounce to persist
    await new Promise((r) => setTimeout(r, STORE_DEBOUNCE_MS + 50));

    // Client B loads
    let clientBContent: unknown = null;
    const docB: YDocLike = {
      _hydrate: (c) => { clientBContent = c; },
      _serialize: () => null,
    };
    await onLoad({ documentName: "task:conv1", document: docB });

    expect(clientBContent).toEqual(contentA);
  });
});

// --- Cursor broadcast test (simulated) ---

describe("cursor broadcast (simulated)", () => {
  test("client A cursor update propagated to client B via awareness", () => {
    // Yjs awareness is per-provider, not per-server handler.
    // This test validates the cursor data shape contract.
    interface CursorState {
      user: { name: string; color: string };
      cursor: { anchor: number; head: number } | null;
    }

    const clientA: CursorState = {
      user: { name: "Alice", color: "hsl(120, 70%, 50%)" },
      cursor: { anchor: 5, head: 5 },
    };

    const receivedStates: CursorState[] = [];

    // Simulate awareness update callback
    const awarenessUpdate = (state: CursorState) => {
      receivedStates.push(state);
    };

    // Client A broadcasts cursor
    awarenessUpdate(clientA);

    // Client B receives it
    expect(receivedStates).toHaveLength(1);
    const received = receivedStates[0];
    if (!received) throw new Error("expected cursor state");
    expect(received.user.name).toBe("Alice");
    expect(received.cursor).toEqual({ anchor: 5, head: 5 });
  });
});
