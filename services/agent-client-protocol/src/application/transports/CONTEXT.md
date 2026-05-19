# Transports

Concrete byte-channel implementations of `AcpTransport` for the ACP bridge: a stdio-piped child process and an `acp.v1` WebSocket. Frame-level only — newline-delimited JSON in and out, no JSON-RPC semantics.

## Language

**AcpTransport**:
The send/receive interface every concrete transport implements (`send`, `onMessage`, `onClose`, `close`).
_Avoid_: Channel, link, pipe.

**ProcessTransport**:
An `AcpTransport` backed by a spawned child process exchanging newline-delimited JSON over stdin/stdout, with stderr captured into close reasons.
_Avoid_: StdioTransport, ChildTransport.

**WebSocketTransport**:
An `AcpTransport` backed by an `acp.v1` WebSocket connection with an optional `$/ping` heartbeat.
_Avoid_: WsTransport, SocketTransport.

**TransportListeners**:
A fan-out registry of callbacks (one per event kind: message, close) owned by a transport, returning an `Unsubscribe` per registration.
_Avoid_: EventEmitter, Subscribers.

**Unsubscribe**:
The zero-arg function returned by `onMessage` / `onClose` that detaches a single listener.
_Avoid_: Disposer, canceller.

**Frame**:
One newline-terminated JSON line on the wire — the unit a transport emits and accepts.
_Avoid_: Line, chunk, packet.

**Subprotocol**:
The WebSocket subprotocol token negotiated at connect: `acp.v1` always, plus an optional `bearer.<token>` derived from an `Authorization: Bearer` header.
_Avoid_: Protocol, scheme.

**Heartbeat**:
A `$/ping` JSON-RPC notification sent on `WebSocketTransport` at `heartbeatMs` to keep the socket warm.
_Avoid_: Keepalive, ping.

## Relationships

- An **AcpClientBridge** (parent context) owns exactly one **AcpTransport**, which is one **ProcessTransport** or one **WebSocketTransport**.
- A **ProcessTransport** wraps one child process; its stderr tail is appended to the close reason emitted to **TransportListeners**.
- A **WebSocketTransport** wraps one `AcpWebSocketLike`; it negotiates one or more **Subprotocol** tokens and may run one **Heartbeat** timer.
- Each transport owns two **TransportListeners** (message, close); each `onMessage` / `onClose` call returns one **Unsubscribe**.
- Inbound bytes are split on `\n` into **Frame**s before emission; outbound `send` ensures a trailing `\n`.

## Example dialogue

> **Dev:** "If the child process dies, how does the bridge find out?"
> **Domain expert:** "The **ProcessTransport** emits one close event via its close **TransportListeners** with a reason that includes exit code, signal, and the tail of stderr. Message listeners are cleared in the same step, so no further **Frame**s reach the bridge."
> **Dev:** "And the WebSocket `$/ping` — is that an ACP method?"
> **Domain expert:** "No. It's a **Heartbeat** owned by **WebSocketTransport** to keep the socket open; it never reaches the bridge as a **Frame** because it's sent, not received, and the agent ignores `$/`-prefixed methods."

## Flagged ambiguities

- **Frame vs JsonRpcEnvelope.** A **Frame** is the raw newline-delimited string a transport handles; a `JsonRpcEnvelope` (parent context) is the parsed JSON-RPC object the bridge builds from it. Transports never parse.
- **Close reason vs error.** A transport's close callback always receives a `reason` string (process exit, websocket code, `"closed by client"`); transports do not surface a separate error channel — fatal conditions arrive as a close with a descriptive reason.
- **Subprotocol bearer token.** The `bearer.<token>` **Subprotocol** entry is a transport-layer auth carrier only; it is not an ACP capability and is invisible above this layer.
