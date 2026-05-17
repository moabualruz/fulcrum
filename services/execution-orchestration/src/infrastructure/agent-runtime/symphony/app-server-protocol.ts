/**
 * Codex app-server JSONL protocol helpers.
 *
 * JSON-RPC 2.0 over stdio — typed request/response/notification schemas,
 * helpers, and typed error classes.
 *
 * SYM-20: protocol framing, thread/start, thread/resume, event extraction.
 * SYM-22: thread/tokenUsage/updated schema.
 * SYM-23: approval/user-input event schemas.
 * SYM-24: unsupported tool-call schema.
 *
 * Note: actual field names used by the Codex app-server are implementation-defined
 * by the targeted version. These schemas are based on the Symphony SPEC.md §10/§17.5
 * guidance and the official Codex app-server documentation.
 */

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a received message violates the JSON-RPC 2.0 envelope rules
 * or does not contain the expected Symphony-required fields.
 */
export class AppServerProtocolError extends Error {
  override name = "AppServerProtocolError" as const;

  constructor(message: string, public readonly raw?: string) {
    super(message);
  }
}

/**
 * Thrown when a read timeout or turn timeout expires before the expected
 * protocol event arrives.
 */
export class AppServerTimeoutError extends Error {
  override name = "AppServerTimeoutError" as const;

  constructor(
    /** "read" = no data arrived; "turn" = turn did not complete in time. */
    public readonly kind: "read" | "turn",
    message?: string,
  ) {
    super(message ?? `app-server ${kind} timeout`);
  }
}

/**
 * Thrown when an approval or sandbox policy event is encountered and the
 * configured policy cannot be applied (e.g. policy config error).
 */
export class AppServerPolicyError extends Error {
  override name = "AppServerPolicyError" as const;

  constructor(
    /** Event type that triggered the policy check. */
    public readonly eventType: string,
    /** Policy value that was applied (or attempted). */
    public readonly policy: string,
    message?: string,
  ) {
    super(message ?? `app-server policy error for ${eventType}: ${policy}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelope types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  // No `id` field on notifications
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

// ---------------------------------------------------------------------------
// Typed event schemas
// ---------------------------------------------------------------------------

/** thread/start params */
export interface ThreadStartParams {
  cwd: string;
  model?: string;
  approvalPolicy?: string;
  /** SandboxMode value (e.g. "none", "docker"). */
  sandbox?: string;
  /** SandboxPolicy value for per-turn sandboxing. */
  turnSandboxPolicy?: string;
  /** Prompt / initial user message. */
  prompt?: string;
  /** Some Codex versions use "input" rather than "prompt". */
  input?: string;
}

/** thread/resume params */
export interface ThreadResumeParams {
  threadId: string;
  cwd?: string;
  model?: string;
  prompt?: string;
  input?: string;
  approvalPolicy?: string;
  sandbox?: string;
}

/** thread identity returned in thread/start / thread/resume response. */
export interface ThreadIdentity {
  id: string;
  sessionId?: string;
}

/** Turn identity returned in turn events. */
export interface TurnIdentity {
  id: string;
}

/** Token usage payload from thread/tokenUsage/updated. */
export interface TokenUsagePayload {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** thread/tokenUsage/updated notification params. */
export interface TokenUsageUpdatedParams {
  threadId: string;
  usage: TokenUsagePayload;
}

/** thread/status/changed notification params. */
export interface ThreadStatusChangedParams {
  threadId: string;
  status: {
    waitingOnApproval?: boolean;
    waitingOnUserInput?: boolean;
    userInputRequest?: string;
    turnComplete?: boolean;
    sessionComplete?: boolean;
    error?: string;
  };
  turnId?: string;
}

/** thread/tool/call notification params. */
export interface ToolCallParams {
  threadId: string;
  toolCallId: string;
  name: string;
  arguments: unknown;
}

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------

let _nextId = 1;

/**
 * Build a JSON-RPC 2.0 request object with auto-incrementing id.
 * Exported for test injection of id sequences.
 */
export function makeRequest(method: string, params?: unknown): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: _nextId++,
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

/** Reset the request ID counter (for isolated tests only). */
export function _resetIdCounter(value = 1): void {
  _nextId = value;
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single JSONL line into a JsonRpcMessage.
 *
 * Returns null for empty / blank lines (common at EOF).
 * Returns null for non-JSON lines (e.g. diagnostic output that leaked through;
 *   callers should route those to the stderr handler instead).
 * Throws AppServerProtocolError if the line is JSON but lacks `jsonrpc: "2.0"`.
 */
export function parseMessage(line: string): JsonRpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null; // non-JSON diagnostic line
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new AppServerProtocolError("Expected JSON object", trimmed);
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["jsonrpc"] !== "2.0") {
    throw new AppServerProtocolError(
      `Expected jsonrpc: "2.0", got: ${JSON.stringify(obj["jsonrpc"])}`,
      trimmed,
    );
  }

  return parsed as JsonRpcMessage;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** True if the message is a JSON-RPC response (has `id` and `result`/`error`). */
export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return "id" in msg;
}

/** True if the message is a JSON-RPC notification (has `method`, no `id`). */
export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return "method" in msg && !("id" in msg);
}

/** Extract the token usage payload from a thread/tokenUsage/updated notification. */
export function extractTokenUsage(msg: JsonRpcNotification): TokenUsageUpdatedParams | null {
  if (msg.method !== "thread/tokenUsage/updated") return null;
  const params = msg.params as TokenUsageUpdatedParams | undefined;
  if (!params?.threadId || !params?.usage) return null;
  return params;
}

/** Extract the thread/status/changed payload. */
export function extractThreadStatus(msg: JsonRpcNotification): ThreadStatusChangedParams | null {
  if (msg.method !== "thread/status/changed") return null;
  return msg.params as ThreadStatusChangedParams | null;
}

/** Extract the tool call payload from a thread/tool/call notification. */
export function extractToolCall(msg: JsonRpcNotification): ToolCallParams | null {
  if (msg.method !== "thread/tool/call") return null;
  return msg.params as ToolCallParams | null;
}
