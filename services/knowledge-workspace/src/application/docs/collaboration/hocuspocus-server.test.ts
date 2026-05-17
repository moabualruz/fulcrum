/**
 * Tests for Hocuspocus server factory.
 *
 * Covers server creation, lifecycle, and persistence adapter behavior.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  createHocuspocusConfig,
  type HocuspocusServerConfig,
  HocuspocusPersistenceAdapter,
  parseCollabPort,
} from "./hocuspocus-server.ts";

describe("hocuspocus-server", () => {
  describe("parseCollabPort", () => {
    test("returns HOCUSPOCUS_PORT env when set", () => {
      const prev = process.env.HOCUSPOCUS_PORT;
      process.env.HOCUSPOCUS_PORT = "5678";
      expect(parseCollabPort()).toBe(5678);
      if (prev !== undefined) process.env.HOCUSPOCUS_PORT = prev;
      else delete process.env.HOCUSPOCUS_PORT;
    });

    test("defaults to 1234", () => {
      const prev = process.env.HOCUSPOCUS_PORT;
      delete process.env.HOCUSPOCUS_PORT;
      expect(parseCollabPort()).toBe(1234);
      if (prev !== undefined) process.env.HOCUSPOCUS_PORT = prev;
    });

    test("returns default on non-numeric env", () => {
      const prev = process.env.HOCUSPOCUS_PORT;
      process.env.HOCUSPOCUS_PORT = "abc";
      expect(parseCollabPort()).toBe(1234);
      if (prev !== undefined) process.env.HOCUSPOCUS_PORT = prev;
      else delete process.env.HOCUSPOCUS_PORT;
    });
  });

  describe("createHocuspocusConfig", () => {
    test("returns config with port and name", () => {
      const config = createHocuspocusConfig({ port: 4567 });
      expect(config.port).toBe(4567);
      expect(config.name).toBe("fulcrum-collab");
    });

    test("default port is 1234", () => {
      const config = createHocuspocusConfig();
      expect(config.port).toBe(1234);
    });

    test("includes onStoreDocument hook placeholder", () => {
      const config = createHocuspocusConfig();
      expect(config.onStoreDocument).toBeDefined();
      expect(typeof config.onStoreDocument).toBe("function");
    });

    test("includes onLoadDocument hook placeholder", () => {
      const config = createHocuspocusConfig();
      expect(config.onLoadDocument).toBeDefined();
      expect(typeof config.onLoadDocument).toBe("function");
    });

    test("quiet mode suppresses logging", () => {
      const config = createHocuspocusConfig({ quiet: true });
      expect(config.quiet).toBe(true);
    });
  });

  describe("HocuspocusPersistenceAdapter", () => {
    test("storeYjsBinary serializes Yjs state to Buffer", async () => {
      const adapter = new HocuspocusPersistenceAdapter();
      // Adapter stores Yjs state vector as Uint8Array
      const mockState = new Uint8Array([1, 2, 3, 4]);
      const result = adapter.serializeState(mockState);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(4);
    });

    test("deserializeState returns Uint8Array from Buffer", () => {
      const adapter = new HocuspocusPersistenceAdapter();
      const buf = Buffer.from([5, 6, 7, 8]);
      const result = adapter.deserializeState(buf);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(4);
      expect(result[0]).toBe(5);
    });

    test("extractDocId parses doc:xxx room names", () => {
      const adapter = new HocuspocusPersistenceAdapter();
      expect(adapter.extractDocId("doc:abc-123")).toBe("abc-123");
    });

    test("extractDocId returns null for task: rooms", () => {
      const adapter = new HocuspocusPersistenceAdapter();
      expect(adapter.extractDocId("task:abc-123")).toBeNull();
    });

    test("extractDocId returns null for unknown prefix", () => {
      const adapter = new HocuspocusPersistenceAdapter();
      expect(adapter.extractDocId("unknown:abc")).toBeNull();
    });
  });
});
