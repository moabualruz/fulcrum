/**
 * Tests for collaboration feature flag guard.
 *
 * Ensures real-time-collab-server flag gates all WebSocket/Hocuspocus code paths.
 * y-indexeddb path is always available regardless of flag.
 */

import { describe, test, expect } from "bun:test";
import {
  isCollabEnabled,
  shouldStartCollabServer,
  getCollabEndpoint,
} from "./collab-flag-guard.ts";

describe("collab-flag-guard", () => {
  describe("isCollabEnabled", () => {
    test("returns false when FULCRUM_FEATURES does not include real-time-collab-server", () => {
      expect(isCollabEnabled("")).toBe(false);
      expect(isCollabEnabled("embeddings,router-llm")).toBe(false);
    });

    test("returns true when FULCRUM_FEATURES includes real-time-collab-server", () => {
      expect(isCollabEnabled("real-time-collab-server")).toBe(true);
      expect(isCollabEnabled("embeddings,real-time-collab-server,router-llm")).toBe(true);
    });

    test("trims whitespace", () => {
      expect(isCollabEnabled(" real-time-collab-server , embeddings ")).toBe(true);
    });
  });

  describe("shouldStartCollabServer", () => {
    test("returns false when flag off", () => {
      expect(shouldStartCollabServer("")).toBe(false);
    });

    test("returns true when flag on", () => {
      expect(shouldStartCollabServer("real-time-collab-server")).toBe(true);
    });
  });

  describe("getCollabEndpoint", () => {
    test("returns null when flag off", () => {
      expect(getCollabEndpoint("", 1234)).toBeNull();
    });

    test("returns ws URL when flag on", () => {
      expect(getCollabEndpoint("real-time-collab-server", 1234)).toBe(
        "ws://localhost:1234/collab",
      );
    });

    test("uses custom port", () => {
      expect(getCollabEndpoint("real-time-collab-server", 5678)).toBe(
        "ws://localhost:5678/collab",
      );
    });
  });
});
