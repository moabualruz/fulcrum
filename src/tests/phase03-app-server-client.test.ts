/**
 * Phase 03 integration tests — App-Server Client (JSONL protocol).
 *
 * Tests JSONL message parsing, token usage aggregation, and protocol errors
 * without spawning a real process.
 */

import { describe, expect, test } from "bun:test";
import {
  parseMessage,
  isResponse,
  isNotification,
  makeRequest,
  extractTokenUsage,
  extractThreadStatus,
  extractToolCall,
  _resetIdCounter,
  AppServerProtocolError,
  AppServerTimeoutError,
  AppServerPolicyError,
  type JsonRpcNotification,
} from "../orchestration/symphony/app-server-protocol.ts";
import { TokenUsageAggregator } from "../orchestration/token-tracking.ts";

describe("Phase 03: App-Server Client — JSONL Protocol", () => {
  // --- parseMessage ---

  test("parseMessage returns null for blank lines", () => {
    expect(parseMessage("")).toBeNull();
    expect(parseMessage("   ")).toBeNull();
  });

  test("parseMessage returns null for non-JSON diagnostic lines", () => {
    expect(parseMessage("INFO: server starting...")).toBeNull();
  });

  test("parseMessage throws AppServerProtocolError for JSON without jsonrpc field", () => {
    expect(() => parseMessage('{"method":"foo"}')).toThrow(AppServerProtocolError);
  });

  test("parseMessage parses valid JSON-RPC response", () => {
    const msg = parseMessage('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}');
    expect(msg).not.toBeNull();
    expect(isResponse(msg!)).toBe(true);
    expect(isNotification(msg!)).toBe(false);
  });

  test("parseMessage parses valid JSON-RPC notification", () => {
    const msg = parseMessage('{"jsonrpc":"2.0","method":"thread/status/changed","params":{}}');
    expect(msg).not.toBeNull();
    expect(isNotification(msg!)).toBe(true);
    expect(isResponse(msg!)).toBe(false);
  });

  // --- makeRequest ---

  test("makeRequest produces valid JSON-RPC request", () => {
    _resetIdCounter(100);
    const req = makeRequest("thread/start", { cwd: "/tmp" });
    expect(req.jsonrpc).toBe("2.0");
    expect(req.id).toBe(100);
    expect(req.method).toBe("thread/start");
    expect(req.params).toEqual({ cwd: "/tmp" });
  });

  // --- extractTokenUsage ---

  test("extractTokenUsage extracts from tokenUsage/updated notification", () => {
    const notif: JsonRpcNotification = {
      jsonrpc: "2.0",
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "t-1",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    };
    const result = extractTokenUsage(notif);
    expect(result).not.toBeNull();
    expect(result!.threadId).toBe("t-1");
    expect(result!.usage.totalTokens).toBe(150);
  });

  test("extractTokenUsage returns null for non-matching method", () => {
    const notif: JsonRpcNotification = {
      jsonrpc: "2.0",
      method: "thread/status/changed",
      params: {},
    };
    expect(extractTokenUsage(notif)).toBeNull();
  });

  // --- TokenUsageAggregator ---

  test("TokenUsageAggregator replaces cumulative totals per thread", () => {
    const agg = new TokenUsageAggregator();
    agg.updateCumulative("t-1", { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    agg.updateCumulative("t-2", { inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    expect(agg.grandTotal()).toBe(450);

    // Update t-1 with new cumulative (replace, not add)
    agg.updateCumulative("t-1", { inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    expect(agg.grandTotal()).toBe(600);
    expect(agg.totalForThread("t-1")).toBe(300);
  });

  test("TokenUsageAggregator returns 0 for unknown thread", () => {
    const agg = new TokenUsageAggregator();
    expect(agg.totalForThread("nonexistent")).toBe(0);
    expect(agg.grandTotal()).toBe(0);
  });

  // --- Error types ---

  test("AppServerTimeoutError carries kind", () => {
    const err = new AppServerTimeoutError("read");
    expect(err.kind).toBe("read");
    expect(err.name).toBe("AppServerTimeoutError");
  });

  test("AppServerPolicyError carries eventType and policy", () => {
    const err = new AppServerPolicyError("approval", "auto-approve");
    expect(err.eventType).toBe("approval");
    expect(err.policy).toBe("auto-approve");
  });
});
