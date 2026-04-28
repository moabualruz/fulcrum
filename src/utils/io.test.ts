// Tests for I/O utilities — envelope parsing with error diagnostics.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readHookEvent } from "./io.ts";

// Mock stdin and capture stderr
let stderrOutput: string[] = [];
const originalStderr = process.stderr.write;

beforeEach(() => {
  stderrOutput = [];
  (process.stderr.write as any) = (msg: string) => {
    stderrOutput.push(msg);
    return msg.length;
  };
  // Clear FULCRUM_DEBUG and FULCRUM_HOOK_NAME for each test
  delete process.env["FULCRUM_DEBUG"];
  delete process.env["FULCRUM_HOOK_NAME"];
});

afterEach(() => {
  process.stderr.write = originalStderr;
});

describe("readHookEvent", () => {
  test("returns {} when stdin is empty", async () => {
    process.env["FULCRUM_HOOK_NAME"] = "format";
    // Mock stdin as empty
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      // Empty stdin should not log anything unconditionally
      const unconditionalOutput = stderrOutput.filter((s) => !s.startsWith("[io]"));
      expect(unconditionalOutput).toHaveLength(0);
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("parses valid JSON envelope", async () => {
    process.env["FULCRUM_HOOK_NAME"] = "format";
    const original = Bun.stdin.text;
    const envelope = { tool_name: "Edit", tool_input: { file_path: "/tmp/test.py" } };
    Bun.stdin.text = async () => JSON.stringify(envelope);
    try {
      const event = await readHookEvent();
      expect(event).toEqual(envelope);
      // No errors should be logged
      expect(stderrOutput).toHaveLength(0);
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("emits one-liner to stderr on invalid JSON parse failure", async () => {
    process.env["FULCRUM_HOOK_NAME"] = "format";
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "{ invalid json }";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      // Should emit exactly one unconditional message
      const unconditionalOutput = stderrOutput.filter((s) => !s.startsWith("[io]"));
      expect(unconditionalOutput.length).toBe(1);
      const msg = unconditionalOutput[0];
      // Check format: fulcrum hook <name>: envelope parse failed (<reason>): <truncated>
      expect(msg).toMatch(/^fulcrum hook format: envelope parse failed \(invalid JSON\): /);
      expect(msg).toContain("invalid json");
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("truncates long input to ~80 chars in error message", async () => {
    process.env["FULCRUM_HOOK_NAME"] = "lint-gate";
    const original = Bun.stdin.text;
    const longJson = "{ " + "x".repeat(200) + " }";
    Bun.stdin.text = async () => longJson;
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      const unconditionalOutput = stderrOutput.filter((s) => !s.startsWith("[io]"));
      const msg = unconditionalOutput[0];
      // Extract the truncated part (after the last colon and space)
      const parts = msg!.split(": ");
      const truncated = parts[parts.length - 1];
      expect(truncated!.length).toBeLessThanOrEqual(85); // ~80 chars plus newline
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("includes hook name in error message", async () => {
    process.env["FULCRUM_HOOK_NAME"] = "audit-log";
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "not json";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      const unconditionalOutput = stderrOutput.filter((s) => !s.startsWith("[io]"));
      const msg = unconditionalOutput[0];
      expect(msg).toContain("fulcrum hook audit-log:");
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("uses 'hook' as default hook name when FULCRUM_HOOK_NAME not set", async () => {
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "{ bad }";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      const unconditionalOutput = stderrOutput.filter((s) => !s.startsWith("[io]"));
      const msg = unconditionalOutput[0];
      expect(msg).toContain("fulcrum hook hook:");
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("emits verbose debug log when FULCRUM_DEBUG is set", async () => {
    process.env["FULCRUM_DEBUG"] = "1";
    process.env["FULCRUM_HOOK_NAME"] = "test-on-edit";
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "invalid";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      // Should have the unconditional one-liner PLUS debug output
      const allOutput = stderrOutput.join("");
      expect(allOutput).toContain("fulcrum hook test-on-edit: envelope parse failed");
      expect(allOutput).toContain("[io] parse err:");
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("does not log empty stdin when FULCRUM_DEBUG is not set", async () => {
    process.env["FULCRUM_HOOK_NAME"] = "format";
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      // No output at all on empty stdin without debug
      expect(stderrOutput).toHaveLength(0);
    } finally {
      Bun.stdin.text = original;
    }
  });

  test("logs empty stdin to debug when FULCRUM_DEBUG is set", async () => {
    process.env["FULCRUM_DEBUG"] = "1";
    const original = Bun.stdin.text;
    Bun.stdin.text = async () => "";
    try {
      const event = await readHookEvent();
      expect(event).toEqual({});
      const output = stderrOutput.join("");
      expect(output).toContain("[io] empty stdin");
    } finally {
      Bun.stdin.text = original;
    }
  });
});
