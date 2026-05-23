# Agent Client Protocol (ACP)

Fulcrum's bridge to external coding agents (Claude Code, Codex, Gemini, etc.) over the Agent Client Protocol. Owns ACP session lifecycle, JSON-RPC transport plumbing, and the tool-call / permission handshake. No business logic — it speaks ACP on behalf of higher services.

## Language

**AcpSession**:
One live conversation between Fulcrum (host) and one external agent process, identified by an `sessionId` issued by the agent.
_Avoid_: Conversation, chat, thread.

**SavedSession**:
The persisted record of an `AcpSession` (id, agent name, cwd, last update, `supportsLoadSession`) that can be reopened later via `session/load`.
_Avoid_: History entry, transcript.

**AcpClientBridge**:
The Fulcrum-side JSON-RPC client that owns one transport, multiplexes requests/responses/notifications, and exposes typed methods (`initialize`, `newSession`, `prompt`, `cancel`, …).
_Avoid_: Adapter, proxy, client wrapper.

**AcpAgent**:
The external process or remote endpoint speaking ACP on the other side of the transport (Claude Code, Codex, etc.). Configured via `AgentConfig`.
_Avoid_: Model, LLM, backend.

**Transport**:
The byte channel (`AcpTransport`) underneath the bridge: `stdio` via `ProcessTransport`, `websocket` via `WebSocketTransport`. Pure send/receive; no protocol semantics.
_Avoid_: Connection, socket, channel.

**JsonRpcEnvelope**:
A `JsonRpcRequest`, `JsonRpcNotification`, or `JsonRpcResponse` (success or error) — the wire frame carried by a `Transport`.
_Avoid_: Message, packet, payload (use these only inside an envelope).

**ToolCall**:
One agent-side tool invocation reported via `session/update` notifications, tracked in the session by `toolCallId` with `status: pending | in_progress | completed | failed`.
_Avoid_: Tool use, action, step.

**PermissionRequest**:
An incoming `session/request_permission` from the agent asking the host to authorize a `ToolCall`; resolved with an `optionId` or cancelled.
_Avoid_: Approval, prompt, confirmation.

**SessionMode**:
A negotiated operating mode reported by the agent (e.g. plan / act). Changed via `session/set_mode`.
_Avoid_: Profile, preset.

**Capabilities**:
The `agentCapabilities` / `clientCapabilities` advertised during `initialize` (e.g. `loadSession`, `fs.readTextFile`). Determines which methods are legal on a given bridge.
_Avoid_: Feature flags, options.

**TrafficEntry**:
One recorded line of bridge traffic (direction, type, method, payload) kept by the `AcpTrafficRecorder` for the Session Workbench UI.
_Avoid_: Log line, event.

**SessionWorkbench**:
The interface-layer surface that renders and operates on a live `AcpSession` (messages, tool calls, traffic, permissions).
_Avoid_: Console, inspector, UI.

## Relationships

- An **AcpSession** is driven by exactly one **AcpClientBridge** at a time.
- An **AcpClientBridge** owns exactly one **Transport**; the transport carries many **JsonRpcEnvelope**s.
- An **AcpClientBridge** talks to exactly one **AcpAgent** (resolved from `AgentConfig`).
- An **AcpSession** has many **ToolCall**s, indexed by `toolCallId`.
- A **ToolCall** may produce zero or one **PermissionRequest** (one outstanding per bridge at a time).
- An **AcpSession** has zero or one current **SessionMode** plus a set of available modes from `Capabilities`.
- An **AcpClientBridge** writes many **TrafficEntry**s into one `AcpTrafficRecorder`; the **SessionWorkbench** reads them.
- A **SavedSession** persists one **AcpSession** identity; resuming requires the agent's `loadSession` **Capabilities** bit.

## Example dialogue

> **Dev:** "When the user clicks Approve on the dialog, do we send a new `prompt`?"
> **Domain expert:** "No — that dialog is a **PermissionRequest** from the agent. You resolve it with an `optionId` on the **AcpClientBridge**; the agent then continues the same **ToolCall**. A new `session/prompt` would start a fresh agent turn instead."
> **Dev:** "And resuming a closed **AcpSession** — same bridge?"
> **Domain expert:** "New **AcpClientBridge** and new **Transport**, but the **SavedSession** carries the agent's `sessionId`, so `session/load` rehydrates the same conversation — only if the agent's **Capabilities** include `loadSession`."

## Flagged ambiguities

- **Session (ACP) vs Run (execution-orchestration).** An `AcpSession` is a wire-level ACP conversation owned by this service. A Run (planned in `execution-orchestration`) is a higher-level orchestrated agent execution that may use one or more `AcpSession`s. Do not conflate `sessionId` (agent-issued) with run IDs.
- **Tool vs Capability.** A `Capability` is something advertised during `initialize` (host or agent feature support). A `ToolCall` is a single runtime invocation reported during a session. Capability ≠ tool; capability gates which tools/methods are legal.
- **Agent (ACP) vs Agent (registry).** `AcpAgent` here = external ACP-speaking process. The `Agent` in `src/agents/registry.ts` = one of the five supervised agent runtimes (Claude Code, Codex, …). These overlap in name only; an entry in the registry may or may not be reached via ACP.
- **Transport vs Connection.** `Transport` is the abstract send/receive interface (`AcpTransport`). "Connection" is not a domain term here — use `Transport` plus its concrete kind (`stdio`, `websocket`).
- **Message.** Used both for a `ChatMessage` in the session state and a raw JSON-RPC frame on the wire. Prefer `ChatMessage` for the former and `JsonRpcEnvelope` for the latter; never use bare "message" in code or docs.
- **Mode vs Model.** `SessionMode` (behavioral mode, set via `session/set_mode`) is distinct from `ModelInfo` / `currentModelId` (model selection, set via `session/set_model`). Both surface in `NewSessionResponse` but are unrelated axes.
