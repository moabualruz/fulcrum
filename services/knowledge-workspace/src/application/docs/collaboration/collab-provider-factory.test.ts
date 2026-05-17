/**
 * Tests for collaboration provider factory.
 *
 * Covers the provider factory that creates Yjs doc and providers
 * based on feature flag state.
 *
 * Flag OFF: only y-indexeddb provider (offline persistence).
 * Flag ON: y-indexeddb + HocuspocusProvider (WebSocket collab).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  createCollabProviders,
  type CollabProviderConfig,
  type CollabProviderResult,
} from "./collab-provider-factory.ts";

describe("collab-provider-factory", () => {
  const baseConfig: CollabProviderConfig = {
    docId: "doc:test-doc-123",
    flagEnabled: false,
  };

  describe("flag OFF (standalone mode)", () => {
    test("returns ydoc instance", () => {
      const result = createCollabProviders(baseConfig);
      expect(result.ydoc).toBeDefined();
      expect(result.ydoc.getXmlFragment).toBeDefined();
    });

    test("returns indexeddb provider name", () => {
      const result = createCollabProviders(baseConfig);
      expect(result.indexeddbProviderName).toBe("fulcrum-doc:test-doc-123");
    });

    test("does NOT return websocket provider config", () => {
      const result = createCollabProviders(baseConfig);
      expect(result.wsProviderConfig).toBeNull();
    });

    test("no websocket URL generated", () => {
      const result = createCollabProviders(baseConfig);
      expect(result.wsUrl).toBeNull();
    });
  });

  describe("flag ON (collab mode)", () => {
    const collabConfig: CollabProviderConfig = {
      docId: "doc:test-doc-456",
      flagEnabled: true,
      wsPort: 1234,
      wsHost: "localhost",
      userName: "Alice",
      userColor: "#ff0000",
    };

    test("returns ydoc instance", () => {
      const result = createCollabProviders(collabConfig);
      expect(result.ydoc).toBeDefined();
    });

    test("returns indexeddb provider name (always on)", () => {
      const result = createCollabProviders(collabConfig);
      expect(result.indexeddbProviderName).toBe("fulcrum-doc:test-doc-456");
    });

    test("returns websocket provider config", () => {
      const result = createCollabProviders(collabConfig);
      expect(result.wsProviderConfig).not.toBeNull();
      expect(result.wsProviderConfig!.url).toBe("ws://localhost:1234/collab");
      expect(result.wsProviderConfig!.name).toBe("doc:test-doc-456");
    });

    test("returns wsUrl", () => {
      const result = createCollabProviders(collabConfig);
      expect(result.wsUrl).toBe("ws://localhost:1234/collab");
    });

    test("includes awareness config with user info", () => {
      const result = createCollabProviders(collabConfig);
      expect(result.wsProviderConfig!.awareness).toEqual({
        userName: "Alice",
        userColor: "#ff0000",
      });
    });

    test("defaults wsPort to 1234 from HOCUSPOCUS_PORT", () => {
      const result = createCollabProviders({
        docId: "doc:x",
        flagEnabled: true,
      });
      expect(result.wsProviderConfig!.url).toBe("ws://localhost:1234/collab");
    });
  });

  describe("room naming", () => {
    test("doc room uses doc: prefix", () => {
      const result = createCollabProviders({
        docId: "doc:my-doc",
        flagEnabled: true,
      });
      expect(result.wsProviderConfig!.name).toBe("doc:my-doc");
    });

    test("task room uses task: prefix", () => {
      const result = createCollabProviders({
        docId: "task:task-abc",
        flagEnabled: true,
      });
      expect(result.wsProviderConfig!.name).toBe("task:task-abc");
    });

    test("indexeddb name prefixed with fulcrum-", () => {
      const result = createCollabProviders({
        docId: "doc:abc",
        flagEnabled: false,
      });
      expect(result.indexeddbProviderName).toBe("fulcrum-doc:abc");
    });
  });
});
