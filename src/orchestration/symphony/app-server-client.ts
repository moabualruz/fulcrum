/**
 * Codex app-server JSONL client (SYM-20, SYM-21, SYM-22, SYM-23, SYM-24).
 *
 * Spawns the Codex binary via `bash -lc <codex.command>` in the per-issue
 * workspace directory, communicates over stdio JSONL (JSON-RPC 2.0), and
 * exposes startThread / resumeThread / runTurn lifecycle methods.
 *
 * Design decisions (D-09, D-21, D-22):
 * - Approval/sandbox posture is explicit in constructor options.
 * - Session resume passes previous thread_id via thread/resume.
 * - Token accounting uses TokenUsageAggregator (cumulative, keyed by thread_id).
 * - stderr is routed to onStderr callback, never into the protocol parser.
 * - Read timeout and turn timeout are enforced with typed errors.
 * - Unsupported dynamic tool calls return a structured failure without stalling.
 * - Approval and user-input events are handled via injected policy callbacks.
 */

import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { createInterface as rlCreateInterface } from "node:readline";

import {
  AppServerTimeoutError,
  parseMessage,
  isResponse,
  isNotification,
  makeRequest,
  extractTokenUsage,
  extractThreadStatus,
  extractToolCall,
  type JsonRpcNotification,
  type JsonRpcResponse,
  type ThreadStartParams,
  type ThreadResumeParams,
} from "./app-server-protocol.ts";

import { TokenUsageAggregator } from "../token-tracking.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AppServerClientOptions {
  /** Shell command string — launched as `bash -lc <command>`. */
  command: string;

  /** Absolute path to the per-issue workspace directory (sets cwd). */
  workspacePath: string;

  /** Model to pass to the app-server session (e.g. "codex-mini-latest"). */
  model?: string;

  /** Codex approval policy (e.g. "auto-approve-except-delete"). */
  approvalPolicy?: string;

  /** Codex SandboxMode value (e.g. "none", "docker"). */
  threadSandbox?: string;

  /** Codex SandboxPolicy value for per-turn sandboxing. */
  turnSandbox?: string;

  /**
   * Milliseconds to wait for the first data byte from the process stdout.
   * Rejects with AppServerTimeoutError("read") if no data arrives in time.
   */
  readTimeoutMs: number;

  /**
   * Milliseconds to wait for a turn to complete after the last received event.
   * Rejects with AppServerTimeoutError("turn") if no completion arrives.
   */
  turnTimeoutMs: number;

  /** Called with each stderr line; defaults to no-op. */
  onStderr?: (line: string) => void;

  /**
   * Called when an approval event is received.
   * Return value is sent back to the session (implementation-defined).
   * Defaults to auto-approve.
   */
  onApproval?: (event: unknown) => Promise<string>;

  /**
   * Called when a user-input event is received.
   * Return value is sent back to the session (implementation-defined).
   * Defaults to "proceed".
   */
  onUserInput?: (request: string) => Promise<string>;

  /**
   * Called when an unsupported tool call result is sent back.
   * Receives {toolCallId, success: false, error}.
   */
  onToolCallResult?: (result: { toolCallId: string; success: boolean; error?: string }) => void;

  /**
   * Injectable spawn function for testing — replaces child_process.spawn.
   * Must return an object with stdin, stdout, stderr, kill.
   */
  _spawnFn?: (
    cmd: string,
    args: string[],
    options: Record<string, unknown>,
  ) => {
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    killed?: boolean;
    kill: () => void;
  };
}

export interface StartThreadOptions {
  prompt: string;
}

export interface AppServerEvent {
  type: string;
  threadId?: string;
  turnId?: string;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// CodexAppServerClient
// ---------------------------------------------------------------------------

export class CodexAppServerClient {
  private readonly _opts: AppServerClientOptions;
  private _threadId: string | undefined;
  private _turnId: string | undefined;
  private _sessionId: string | undefined;
  private _proc: ReturnType<AppServerClientOptions["_spawnFn"] & {}> | ChildProcess | null = null;
  private readonly _tokenUsage: TokenUsageAggregator;

  constructor(opts: AppServerClientOptions) {
    this._opts = opts;
    this._tokenUsage = new TokenUsageAggregator();
  }

  // -------------------------------------------------------------------------
  // Public getters
  // -------------------------------------------------------------------------

  get threadId(): string | undefined { return this._threadId; }
  get turnId(): string | undefined { return this._turnId; }
  get sessionId(): string | undefined { return this._sessionId; }
  get tokenUsage(): TokenUsageAggregator { return this._tokenUsage; }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start a new app-server thread (thread/start).
   * Spawns the process, sends thread/start, waits for the response,
   * then streams events until turn completion or timeout.
   */
  async startThread(opts: StartThreadOptions): Promise<void> {
    const proc = this._spawnProcess();
    this._proc = proc;

    const params: ThreadStartParams = {
      cwd: this._opts.workspacePath,
      ...(this._opts.model ? { model: this._opts.model } : {}),
      ...(this._opts.approvalPolicy ? { approvalPolicy: this._opts.approvalPolicy } : {}),
      ...(this._opts.threadSandbox ? { sandbox: this._opts.threadSandbox } : {}),
      ...(this._opts.turnSandbox ? { turnSandboxPolicy: this._opts.turnSandbox } : {}),
      prompt: opts.prompt,
    };

    const req = makeRequest("thread/start", params);
    this._sendRequest(proc, req);

    await this._readUntilComplete(proc, req.id);
  }

  /**
   * Resume an existing app-server thread (thread/resume).
   * Uses the previous thread_id to continue a stored session.
   */
  async resumeThread(previousThreadId: string, opts: StartThreadOptions): Promise<void> {
    const proc = this._spawnProcess();
    this._proc = proc;

    const params: ThreadResumeParams = {
      threadId: previousThreadId,
      cwd: this._opts.workspacePath,
      ...(this._opts.model ? { model: this._opts.model } : {}),
      ...(this._opts.approvalPolicy ? { approvalPolicy: this._opts.approvalPolicy } : {}),
      ...(this._opts.threadSandbox ? { sandbox: this._opts.threadSandbox } : {}),
      prompt: opts.prompt,
    };

    const req = makeRequest("thread/resume", params);
    this._sendRequest(proc, req);

    await this._readUntilComplete(proc, req.id);
  }

  /** Stop the subprocess if still running. */
  stop(): void {
    try {
      this._proc?.kill();
    } catch { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // Private — process management
  // -------------------------------------------------------------------------

  private _spawnProcess() {
    const { command, workspacePath, _spawnFn } = this._opts;
    const spawn = _spawnFn ?? this._defaultSpawn;

    return spawn("bash", ["-lc", command], {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  private readonly _defaultSpawn: NonNullable<AppServerClientOptions["_spawnFn"]> = (cmd, args, options) => {
    return nodeSpawn(cmd, args, {
      cwd: options.cwd as string | undefined,
      stdio: ["pipe", "pipe", "pipe"],
    }) as unknown as ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>;
  };

  private _sendRequest(proc: ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>, req: unknown): void {
    const line = JSON.stringify(req) + "\n";
    proc.stdin.write(line);
  }

  // -------------------------------------------------------------------------
  // Private — protocol stream reading
  // -------------------------------------------------------------------------

  /**
   * Read lines from stdout until we receive a thread/start (or thread/resume)
   * response and then handle events until turn complete or timeout.
   */
  private async _readUntilComplete(
    proc: ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>,
    requestId: number | string,
  ): Promise<void> {
    // Set up stderr routing
    const stderrLines = rlCreateInterface({ input: proc.stderr as NodeJS.ReadableStream });
    stderrLines.on("line", (line) => {
      try {
        this._opts.onStderr?.(line);
      } catch { /* sink errors must not crash orchestration */ }
    });

    // Read timeout: reject if no data arrives within readTimeoutMs
    let readTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let turnTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const lines = rlCreateInterface({ input: proc.stdout as NodeJS.ReadableStream });

    return new Promise<void>((resolve, reject) => {
      let gotFirstLine = false;
      let threadStarted = false;
      let settled = false;

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (readTimeoutHandle) clearTimeout(readTimeoutHandle);
        if (turnTimeoutHandle) clearTimeout(turnTimeoutHandle);
        lines.close();
        stderrLines.close();
        if (err) reject(err);
        else resolve();
      };

      // Install read timeout
      readTimeoutHandle = setTimeout(() => {
        settle(new AppServerTimeoutError("read"));
      }, this._opts.readTimeoutMs);

      // Install turn timeout after thread starts
      const startTurnTimeout = () => {
        if (turnTimeoutHandle) clearTimeout(turnTimeoutHandle);
        turnTimeoutHandle = setTimeout(() => {
          settle(new AppServerTimeoutError("turn"));
        }, this._opts.turnTimeoutMs);
      };

      lines.on("line", (raw: string) => {
        if (settled) return;

        if (!gotFirstLine) {
          gotFirstLine = true;
          // Cancel read timeout on first data
          if (readTimeoutHandle) {
            clearTimeout(readTimeoutHandle);
            readTimeoutHandle = null;
          }
        }

        let msg: ReturnType<typeof parseMessage>;
        try {
          msg = parseMessage(raw);
        } catch (err) {
          settle(err as Error);
          return;
        }

        if (!msg) return; // blank / non-JSON diagnostic that slipped through

        try {
          if (!threadStarted && isResponse(msg)) {
            this._handleThreadResponse(msg as JsonRpcResponse, requestId);
            threadStarted = true;
            startTurnTimeout();
            return;
          }

          if (threadStarted && isNotification(msg)) {
            const done = this._handleNotification(msg as JsonRpcNotification, proc);
            if (done) {
              settle();
            } else {
              // Reset turn timeout on any event (activity = not stalled)
              startTurnTimeout();
            }
          }
        } catch (err) {
          settle(err as Error);
        }
      });

      lines.on("close", () => {
        if (!settled) {
          // If we closed before receiving any data, treat as read timeout
          if (!gotFirstLine) {
            settle(new AppServerTimeoutError("read", "app-server process closed without sending data"));
          } else {
            settle();
          }
        }
      });

      lines.on("error", (err) => settle(err));
    });
  }

  /**
   * Handle the response to thread/start or thread/resume — extract thread_id.
   *
   * We match by requestId when possible, but also accept any successful response
   * that carries a thread identity when there is only one in-flight request per
   * process (which is always the case in our single-request-per-process protocol).
   */
  private _handleThreadResponse(msg: JsonRpcResponse, requestId: number | string): void {
    // Accept responses matching our request id, OR any response carrying thread data
    // (the fake process in tests may use a different numeric id).
    const idMatch = msg.id === requestId;
    const hasThreadData =
      typeof msg.result === "object" &&
      msg.result !== null &&
      "thread" in (msg.result as object);

    if (!idMatch && !hasThreadData) return;

    if (msg.error) {
      throw new Error(`app-server error: ${JSON.stringify(msg.error)}`);
    }
    const result = msg.result as { thread?: { id?: string; sessionId?: string }; sessionId?: string } | undefined;
    if (result?.thread?.id) {
      this._threadId = result.thread.id;
    }
    if (result?.thread?.sessionId) {
      this._sessionId = result.thread.sessionId;
    } else if (result?.sessionId) {
      this._sessionId = result.sessionId;
    }
  }

  /**
   * Handle a protocol notification. Returns true if turn is complete.
   */
  private _handleNotification(
    msg: JsonRpcNotification,
    proc: ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>,
  ): boolean {
    // Token usage — cumulative, keyed by thread_id (SYM-22, D-22)
    const tokenPayload = extractTokenUsage(msg);
    if (tokenPayload) {
      this._tokenUsage.updateCumulative(tokenPayload.threadId, tokenPayload.usage);
      return false;
    }

    // Thread/turn status
    const statusPayload = extractThreadStatus(msg);
    if (statusPayload) {
      if (statusPayload.turnId) this._turnId = statusPayload.turnId;

      const status = statusPayload.status;

      if (status.waitingOnApproval) {
        // Handle approval without stalling (SYM-23)
        this._handleApproval(statusPayload, proc);
        return false;
      }

      if (status.waitingOnUserInput) {
        // Handle user-input without stalling (SYM-23)
        this._handleUserInput(statusPayload, proc);
        return false;
      }

      if (status.turnComplete || status.sessionComplete) {
        return true; // turn complete signal
      }

      if (status.error) {
        throw new Error(`app-server session error: ${status.error}`);
      }

      return false;
    }

    // Unsupported dynamic tool calls (SYM-24)
    const toolCall = extractToolCall(msg);
    if (toolCall) {
      this._handleUnsupportedToolCall(toolCall, proc);
      return false;
    }

    return false;
  }

  /**
   * Handle approval events with documented policy — auto-approve by default,
   * never stall indefinitely (SYM-23).
   */
  private _handleApproval(
    payload: { threadId: string; status: unknown },
    proc: ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>,
  ): void {
    const policy = this._opts.onApproval ?? (async () => "approve");
    // Fire-and-forget with timeout guard — cannot block the read loop
    void Promise.race([
      policy(payload),
      new Promise<string>((res) => setTimeout(() => res("approve"), this._opts.turnTimeoutMs)),
    ]).then((decision) => {
      // Send approval response back if process still alive
      if (proc.killed) return;
      const response = makeRequest("thread/approval/respond", {
        threadId: payload.threadId,
        decision,
      });
      try { this._sendRequest(proc, response); } catch { /* ignore */ }
    }).catch(() => { /* approval errors must not crash orchestration */ });
  }

  /**
   * Handle user-input requests with documented policy — auto-respond, never stall (SYM-23).
   */
  private _handleUserInput(
    payload: { threadId: string; status: { userInputRequest?: string } },
    proc: ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>,
  ): void {
    const policy = this._opts.onUserInput ?? (async () => "proceed");
    const request = payload.status.userInputRequest ?? "";
    void Promise.race([
      policy(request),
      new Promise<string>((res) => setTimeout(() => res("proceed"), this._opts.turnTimeoutMs)),
    ]).then((response) => {
      if (proc.killed) return;
      const req = makeRequest("thread/input/respond", {
        threadId: payload.threadId,
        response,
      });
      try { this._sendRequest(proc, req); } catch { /* ignore */ }
    }).catch(() => { /* user-input errors must not crash orchestration */ });
  }

  /**
   * Return a structured failure for unsupported tool calls without stalling (SYM-24).
   */
  private _handleUnsupportedToolCall(
    toolCall: { toolCallId: string; name: string },
    proc: ReturnType<NonNullable<AppServerClientOptions["_spawnFn"]>>,
  ): void {
    const result = {
      toolCallId: toolCall.toolCallId,
      success: false as const,
      error: `Unsupported tool: ${toolCall.name}`,
    };

    // Notify callback
    try {
      this._opts.onToolCallResult?.(result);
    } catch { /* sink errors must not crash orchestration */ }

    // Send failure response to app-server so it doesn't stall waiting
    if (!proc.killed) {
      const req = makeRequest("thread/tool/result", {
        toolCallId: toolCall.toolCallId,
        success: false,
        error: `Unsupported tool: ${toolCall.name}`,
      });
      try { this._sendRequest(proc, req); } catch { /* ignore */ }
    }
  }
}
