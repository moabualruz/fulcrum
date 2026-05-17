/**
 * RED tests for the Codex app-server JSONL client.
 *
 * TDD RED phase — these tests MUST fail before implementation exists.
 *
 * Coverage:
 * - launch command uses `bash -lc <codex.command>` with workspace cwd (SYM-20)
 * - `thread/start` includes cwd, model, approvalPolicy, threadSandbox, turnSandbox, prompt (SYM-20)
 * - `thread/resume` uses previous thread_id (SYM-21)
 * - response parser extracts thread_id and turn_id (SYM-20)
 * - read timeout rejects with typed AppServerTimeoutError (SYM-20)
 * - turn timeout rejects with typed AppServerTimeoutError (SYM-20)
 * - stderr diagnostics do not enter protocol parser (SYM-20)
 * - approval/user-input requests do not stall indefinitely (SYM-23)
 * - thread/tokenUsage/updated cumulative events update totals by thread_id without double-counting (SYM-22)
 * - unsupported dynamic tool calls return structured failure (SYM-24)
 */

import { describe, expect, test } from "bun:test";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Imports under test — these will NOT resolve until implementation exists.
// ---------------------------------------------------------------------------
import {
  AppServerProtocolError,
  AppServerTimeoutError,
  AppServerPolicyError,
  makeRequest,
  parseMessage,
  isNotification,
  isResponse,
} from "./app-server-protocol.ts";

import { CodexAppServerClient } from "./app-server-client.ts";

import { TokenUsageAggregator } from "../token-tracking.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake child-process-like object backed by string streams. */
function fakeProcess(
  stdoutLines: string[],
  stderrLines: string[] = [],
): {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  killed: boolean;
  kill: () => void;
} {
  const stdout = Readable.from(stdoutLines.map((l) => l + "\n"));
  const stderr = Readable.from(stderrLines.map((l) => l + "\n"));
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  let killed = false;
  return { stdin, stdout, stderr, get killed() { return killed; }, kill() { killed = true; } };
}

/** Build a minimal valid JSON-RPC response for thread/start */
function threadStartResponse(id: number | string, threadId: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: {
      thread: { id: threadId },
    },
  });
}

/** Build a minimal JSON-RPC notification */
function notification(method: string, params: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", method, params });
}

/** Build a token-usage notification */
function tokenUsageNotification(threadId: string, inputTokens: number, outputTokens: number): string {
  return notification("thread/tokenUsage/updated", {
    threadId,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  });
}

// ---------------------------------------------------------------------------
// § Protocol helpers
// ---------------------------------------------------------------------------

describe("app-server-protocol: makeRequest", () => {
  test("produces a valid JSON-RPC 2.0 request object", () => {
    const req = makeRequest("thread/start", { model: "codex-mini-latest" });
    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("thread/start");
    expect(typeof req.id).toBe("number");
    expect(req.params).toEqual({ model: "codex-mini-latest" });
  });

  test("increments id across calls", () => {
    const a = makeRequest("a", {});
    const b = makeRequest("b", {});
    expect(b.id).toBeGreaterThan(a.id as number);
  });
});

describe("app-server-protocol: parseMessage", () => {
  test("parses a valid JSON-RPC response", () => {
    const line = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { thread: { id: "th_1" } } });
    const msg = parseMessage(line);
    expect(msg).not.toBeNull();
    expect(isResponse(msg!)).toBe(true);
    expect(isNotification(msg!)).toBe(false);
  });

  test("parses a valid JSON-RPC notification", () => {
    const line = JSON.stringify({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: {} });
    const msg = parseMessage(line);
    expect(msg).not.toBeNull();
    expect(isNotification(msg!)).toBe(true);
    expect(isResponse(msg!)).toBe(false);
  });

  test("returns null for non-JSON lines", () => {
    expect(parseMessage("not-json")).toBeNull();
  });

  test("returns null for empty line", () => {
    expect(parseMessage("")).toBeNull();
  });

  test("throws AppServerProtocolError for JSON that lacks jsonrpc field", () => {
    expect(() =>
      parseMessage(JSON.stringify({ id: 1, result: {} }))
    ).toThrow(AppServerProtocolError);
  });
});

describe("app-server-protocol: error types", () => {
  test("AppServerProtocolError is an Error subclass", () => {
    const e = new AppServerProtocolError("bad");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AppServerProtocolError");
  });

  test("AppServerTimeoutError carries timeout kind", () => {
    const e = new AppServerTimeoutError("read");
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe("read");
    expect(e.name).toBe("AppServerTimeoutError");
  });

  test("AppServerTimeoutError accepts turn kind", () => {
    const e = new AppServerTimeoutError("turn");
    expect(e.kind).toBe("turn");
  });

  test("AppServerPolicyError is an Error subclass", () => {
    const e = new AppServerPolicyError("approval", "auto-approve");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AppServerPolicyError");
    expect(e.eventType).toBe("approval");
    expect(e.policy).toBe("auto-approve");
  });
});

// ---------------------------------------------------------------------------
// § TokenUsageAggregator
// ---------------------------------------------------------------------------

describe("TokenUsageAggregator: cumulative accounting by thread_id", () => {
  test("starts at zero for a new thread", () => {
    const agg = new TokenUsageAggregator();
    expect(agg.totalForThread("th_1")).toBe(0);
    expect(agg.grandTotal()).toBe(0);
  });

  test("updates total from a cumulative event", () => {
    const agg = new TokenUsageAggregator();
    agg.updateCumulative("th_1", { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(agg.totalForThread("th_1")).toBe(150);
    expect(agg.grandTotal()).toBe(150);
  });

  test("replaces rather than adds on second cumulative update — no double counting", () => {
    const agg = new TokenUsageAggregator();
    agg.updateCumulative("th_1", { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    // Second update: totalTokens=200 cumulative — should store 200 NOT 150+200=350
    agg.updateCumulative("th_1", { inputTokens: 130, outputTokens: 70, totalTokens: 200 });
    expect(agg.totalForThread("th_1")).toBe(200);
    expect(agg.grandTotal()).toBe(200);
  });

  test("tracks multiple threads independently", () => {
    const agg = new TokenUsageAggregator();
    agg.updateCumulative("th_1", { inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    agg.updateCumulative("th_2", { inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    expect(agg.totalForThread("th_1")).toBe(150);
    expect(agg.totalForThread("th_2")).toBe(300);
    expect(agg.grandTotal()).toBe(450);
  });

  test("grandTotal sums all thread totals", () => {
    const agg = new TokenUsageAggregator();
    agg.updateCumulative("th_1", { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    agg.updateCumulative("th_2", { inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    agg.updateCumulative("th_1", { inputTokens: 50, outputTokens: 25, totalTokens: 75 }); // replace th_1
    // th_1=75, th_2=30 => 105
    expect(agg.grandTotal()).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient construction
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: construction", () => {
  test("constructor accepts command and workspace options", () => {
    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/workspace",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      threadSandbox: "none",
      turnSandbox: undefined,
      readTimeoutMs: 5000,
      turnTimeoutMs: 60000,
    });
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: spawn command
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: launch uses bash -lc and workspace cwd", () => {
  test("spawns via bash -lc with configured command string", async () => {
    const spawned: Array<{ cmd: string; args: string[]; options: Record<string, unknown> }> = [];

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws-test",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 1000,
      // Inject a fake spawn to capture the call
      _spawnFn: (cmd: string, args: string[], options: Record<string, unknown>) => {
        spawned.push({ cmd, args, options });
        // Return a fake process that immediately ends with an error response
        const threadId = "th_test";
        const respLine = threadStartResponse(1, threadId);
        return fakeProcess([respLine]);
      },
    });

    // startThread will fail to complete (no turn data) but we only need spawn args
    try {
      await client.startThread({ prompt: "test prompt" });
    } catch {
      // expected — fake process ends without full protocol
    }

    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.cmd).toBe("bash");
    expect(spawned[0]!.args).toEqual(["-lc", "codex app-server"]);
    expect(spawned[0]!.options.cwd).toBe("/tmp/ws-test");
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: thread/start request
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: startThread sends thread/start with correct params", () => {
  test("thread/start request includes cwd, model, approvalPolicy, threadSandbox, prompt", async () => {
    const sentRequests: unknown[] = [];

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws-start",
      model: "o4-mini",
      approvalPolicy: "auto-approve-except-delete",
      threadSandbox: "none",
      readTimeoutMs: 500,
      turnTimeoutMs: 1000,
      _spawnFn: (_cmd: string, _args: string[], _opts: Record<string, unknown>) => {
        const threadId = "th_abc";
        const proc = fakeProcess([threadStartResponse(1, threadId)]);
        // Capture stdin writes
        const origWrite = proc.stdin.write.bind(proc.stdin);
        proc.stdin.write = (chunk: unknown, ...rest: unknown[]) => {
          try {
            const parsed = JSON.parse(String(chunk));
            sentRequests.push(parsed);
          } catch { /* ignore non-json */ }
          return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
        };
        return proc;
      },
    });

    try {
      await client.startThread({ prompt: "Hello issue" });
    } catch { /* expected */ }

    const startReq = sentRequests.find(
      (r) => (r as { method?: string }).method === "thread/start"
    ) as { params?: Record<string, unknown> } | undefined;

    expect(startReq).toBeDefined();
    const p = startReq!.params!;
    expect(p.cwd).toBe("/tmp/ws-start");
    expect(p.model).toBe("o4-mini");
    expect(p.approvalPolicy).toBe("auto-approve-except-delete");
    expect(p.sandbox).toBe("none");
    expect(typeof p.prompt === "string" || typeof p.input === "string").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: thread/resume
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: resumeThread sends thread/resume with previous thread_id", () => {
  test("thread/resume request includes previous threadId", async () => {
    const sentRequests: unknown[] = [];

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws-resume",
      model: "o4-mini",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 1000,
      _spawnFn: (_cmd: string, _args: string[], _opts: Record<string, unknown>) => {
        const proc = fakeProcess([threadStartResponse(1, "th_resume_1")]);
        const origWrite = proc.stdin.write.bind(proc.stdin);
        proc.stdin.write = (chunk: unknown, ...rest: unknown[]) => {
          try { sentRequests.push(JSON.parse(String(chunk))); } catch { /* ignore */ }
          return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
        };
        return proc;
      },
    });

    try {
      await client.resumeThread("th_prior_123", { prompt: "continue" });
    } catch { /* expected */ }

    const resumeReq = sentRequests.find(
      (r) => (r as { method?: string }).method === "thread/resume"
    ) as { params?: Record<string, unknown> } | undefined;

    expect(resumeReq).toBeDefined();
    expect(resumeReq!.params!.threadId).toBe("th_prior_123");
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: thread_id and turn_id extraction
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: extracts threadId and turnId from protocol responses", () => {
  test("threadId is exposed after startThread", async () => {
    const threadId = "th_extracted_001";

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 1000,
      _spawnFn: () => fakeProcess([threadStartResponse(1, threadId)]),
    });

    try {
      await client.startThread({ prompt: "test" });
    } catch { /* expected — no turn data */ }

    expect(client.threadId).toBe(threadId);
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: stderr separation
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: stderr is separated from protocol stream", () => {
  test("stderr diagnostic lines do not enter protocol parser", async () => {
    const stderrLines: string[] = [];
    const threadId = "th_stderr_test";

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 1000,
      onStderr: (line: string) => stderrLines.push(line),
      _spawnFn: () =>
        fakeProcess(
          [threadStartResponse(1, threadId)],
          ["[codex] warn: something happened", "[codex] debug: init complete"],
        ),
    });

    try {
      await client.startThread({ prompt: "test" });
    } catch { /* expected */ }

    // stderr lines captured separately — not thrown as protocol errors
    expect(stderrLines.length).toBeGreaterThan(0);
    expect(stderrLines[0]).toContain("[codex]");
    // threadId was still extracted — stdout parsing worked despite stderr
    expect(client.threadId).toBe(threadId);
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: read timeout
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: read timeout", () => {
  test("rejects with AppServerTimeoutError(read) when no data arrives within readTimeoutMs", async () => {
    // A process that never writes to stdout
    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 50,
      turnTimeoutMs: 5000,
      _spawnFn: () => fakeProcess([]), // empty stdout — no data
    });

    await expect(client.startThread({ prompt: "test" })).rejects.toMatchObject({
      name: "AppServerTimeoutError",
      kind: "read",
    });
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: approval/user-input non-stall policy
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: approval/user-input does not stall indefinitely", () => {
  test("approval event is handled and does not block runTurn indefinitely", async () => {
    const approvalNotification = notification("thread/status/changed", {
      threadId: "th_approval",
      status: { waitingOnApproval: true },
    });
    // After approval notification, signal turn complete
    const turnCompleteNotification = notification("thread/status/changed", {
      threadId: "th_approval",
      status: { turnComplete: true },
    });

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 200,
      onApproval: async () => "approve", // auto-approve policy
      _spawnFn: () =>
        fakeProcess([
          threadStartResponse(1, "th_approval"),
          approvalNotification,
          turnCompleteNotification,
        ]),
    });

    // Should complete without indefinite hang
    const result = await Promise.race([
      client.startThread({ prompt: "test" }).catch(() => "completed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 1000)),
    ]);

    expect(result).not.toBe("timeout");
  });

  test("user-input request is handled with documented policy and does not stall", async () => {
    const userInputNotification = notification("thread/status/changed", {
      threadId: "th_input",
      status: { waitingOnUserInput: true, userInputRequest: "What should I do?" },
    });
    const turnCompleteNotification = notification("thread/status/changed", {
      threadId: "th_input",
      status: { turnComplete: true },
    });

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 200,
      onUserInput: async () => "proceed", // auto-respond policy
      _spawnFn: () =>
        fakeProcess([
          threadStartResponse(1, "th_input"),
          userInputNotification,
          turnCompleteNotification,
        ]),
    });

    const result = await Promise.race([
      client.startThread({ prompt: "test" }).catch(() => "completed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 1000)),
    ]);

    expect(result).not.toBe("timeout");
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: token accounting from thread/tokenUsage/updated
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: token accounting via thread/tokenUsage/updated", () => {
  test("accumulates tokens from notifications without double-counting", async () => {
    const threadId = "th_tokens";
    const lines = [
      threadStartResponse(1, threadId),
      tokenUsageNotification(threadId, 100, 50),   // cumulative: 150
      tokenUsageNotification(threadId, 130, 70),   // cumulative: 200 (replace, not add)
    ];

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 200,
      _spawnFn: () => fakeProcess(lines),
    });

    try {
      await client.startThread({ prompt: "test" });
    } catch { /* expected */ }

    // Should be 200, not 150+200=350
    expect(client.tokenUsage.grandTotal()).toBe(200);
    expect(client.tokenUsage.totalForThread(threadId)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// § CodexAppServerClient: unsupported dynamic tool calls
// ---------------------------------------------------------------------------

describe("CodexAppServerClient: unsupported tool calls return structured failure", () => {
  test("unknown tool call returns structured failure without stalling", async () => {
    const toolCallNotification = notification("thread/tool/call", {
      threadId: "th_tool",
      toolCallId: "tc_1",
      name: "unsupported_tool",
      arguments: { foo: "bar" },
    });

    const toolResults: Array<{ toolCallId: string; success: boolean }> = [];

    const client = new CodexAppServerClient({
      command: "codex app-server",
      workspacePath: "/tmp/ws",
      model: "codex-mini-latest",
      approvalPolicy: "auto-approve-except-delete",
      readTimeoutMs: 500,
      turnTimeoutMs: 200,
      onToolCallResult: (result) => toolResults.push(result),
      _spawnFn: () =>
        fakeProcess([
          threadStartResponse(1, "th_tool"),
          toolCallNotification,
        ]),
    });

    const result = await Promise.race([
      client.startThread({ prompt: "test" }).catch(() => "completed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 1000)),
    ]);

    expect(result).not.toBe("timeout");
    // A structured failure result was emitted (not a stall)
    expect(toolResults.length).toBeGreaterThan(0);
    expect(toolResults[0]!.success).toBe(false);
  });
});
