# R1 — MCP Standards Research

> Online research findings on the Model Context Protocol, its servers, clients, SDKs, and
> real-world implementations. Used as the standards baseline for the Fulcrum audit.
>
> Compiled from the official specification (version `2025-06-18` is the base referenced
> throughout most of this document; `2025-11-25` is now "current" and is noted where
> relevant), reference server implementations, the TypeScript and Python SDKs, and the
> official MCP clients directory.

---

## 1. Protocol versions

MCP versions are string identifiers in `YYYY-MM-DD` format. The date is "the last date
backwards-incompatible changes were made", not a release cadence. The version is **not**
bumped for backwards-compatible changes.
(https://modelcontextprotocol.io/specification/versioning)

Known revisions, oldest to newest:

| Version       | Status                                  | Notes                                                                                            |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `2024-11-05`  | Final (original public spec)            | HTTP+SSE transport, no structured content, no tool annotations, JSON-RPC batching allowed.       |
| `2025-03-26`  | Final                                   | Added Streamable HTTP, JSON-RPC batching (later removed), tool annotations, OAuth 2.1, audio.    |
| `2025-06-18`  | Final                                   | Removed JSON-RPC batching, added structured tool output, elicitation, resource links, `title`, `_meta`, RFC 8707 resource indicators, `MCP-Protocol-Version` HTTP header. |
| `2025-11-25`  | **Current** (as of Apr 2026)            | Icons metadata, OIDC discovery, incremental scope consent, URL-mode elicitation, tool calling in sampling, experimental Tasks, JSON Schema 2020-12 default, stdio stderr clarifications. |

Key things that changed, quoted from the official changelogs:

From the `2025-03-26` changelog
(https://modelcontextprotocol.io/specification/2025-03-26/changelog):
- "Added a comprehensive authorization framework based on OAuth 2.1"
- "Replaced the previous HTTP+SSE transport with a more flexible Streamable HTTP transport"
- "Added support for JSON-RPC batching"
- "Added comprehensive tool annotations for better describing tool behavior, like whether
  it is read-only or destructive"
- "Added `message` field to `ProgressNotification`"
- "Added support for audio data"
- "Added `completions` capability to explicitly indicate support for argument
  autocompletion suggestions"

From the `2025-06-18` changelog
(https://modelcontextprotocol.io/specification/2025-06-18/changelog):
- "Remove support for JSON-RPC batching" — this is a *breaking* change, undoing an
  addition from the previous version.
- "Add support for structured tool output"
- "Classify MCP servers as OAuth Resource Servers, adding protected resource metadata"
- "Require MCP clients to implement Resource Indicators as described in RFC 8707"
- "Clarify security considerations ... and new security best practices page"
- "Add support for elicitation"
- "Add support for resource links in tool call results"
- "Require negotiated protocol version to be specified via `MCP-Protocol-Version` header
  in subsequent requests when using HTTP"
- "Change SHOULD to MUST in Lifecycle Operation" (must respect negotiated capabilities)
- Schema: "Add `_meta` field to additional interface types" and "Add `title` field for
  human-friendly display names, so that `name` can be used as a programmatic identifier"
- "Add `context` field to `CompletionRequest`, providing for completion requests to
  include previously-resolved variables"

From the `2025-11-25` changelog
(https://modelcontextprotocol.io/specification/2025-11-25/changelog):
- Icons metadata (SEP-973) — tools/resources/prompts can carry display icons.
- OIDC Discovery 1.0 support in auth server discovery.
- Incremental scope consent via `WWW-Authenticate` (SEP-835).
- URL-mode elicitation (SEP-1036) — server can ask client to open a browser to complete
  flows like OAuth or payment.
- Tool calling in sampling via `tools` and `toolChoice` (SEP-1577).
- OAuth Client ID Metadata Documents as a recommended client-registration mechanism.
- Experimental **Tasks** for durable long-running requests with polling / deferred
  retrieval.
- Clarification: "servers using stdio transport may use stderr for **all types** of
  logging, not just error messages" (PR #670).
- Clarification: "servers must respond with **HTTP 403 Forbidden** for invalid `Origin`
  headers in Streamable HTTP transport" (PR #1439).
- Clarification: "input validation errors should be returned as Tool Execution Errors
  rather than Protocol Errors to enable model self-correction" (SEP-1303).
- JSON Schema 2020-12 default dialect (SEP-1613).
- Implementation now has an optional `description` field (matches the MCP registry
  server.json format).

**Negotiation rule** (from `basic/lifecycle`):
- Client sends the latest version it supports in `initialize`.
- If the server supports that version, it echoes it back; otherwise, it responds with
  another version it supports, which SHOULD be the latest the server supports.
- If the client does not support the version in the server's response, it SHOULD
  disconnect.
- For HTTP transport, after negotiation the client MUST include `MCP-Protocol-Version:
  <version>` on every subsequent request. If the server does not receive that header, it
  SHOULD assume version `2025-03-26` for backwards compatibility. An invalid/unsupported
  value MUST result in `400 Bad Request`.
  (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#protocol-version-header)

---

## 2. Transports

MCP uses JSON-RPC 2.0 messages and defines two standard transports, with a path for
custom transports:

1. **stdio** — client launches the server as a child process and talks over
   stdin/stdout.
2. **Streamable HTTP** — a single HTTP endpoint that supports both POST and GET, with
   optional SSE for streaming server-to-client messages.

"Clients **SHOULD** support stdio whenever possible."
(https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

Additionally, the 2024-11-05 era had an older **HTTP + SSE** transport that uses two
endpoints (one for POSTing client messages, one GET that opens an SSE stream). This
transport is deprecated but implementations may keep it around for backwards compatibility.

### 2.1 stdio — framing rules

Quoted directly from the spec:
- "The server reads JSON-RPC messages from its standard input (`stdin`) and sends
  messages to its standard output (`stdout`)."
- "Messages are delimited by newlines, and **MUST NOT** contain embedded newlines."
- "The server **MAY** write UTF-8 strings to its standard error (`stderr`) for logging
  purposes. Clients **MAY** capture, forward, or ignore this logging." (2025-11-25 loosens
  this further: stderr may be used for any level of logging.)
- "The server **MUST NOT** write anything to its `stdout` that is not a valid MCP
  message."
- "The client **MUST NOT** write anything to the server's `stdin` that is not a valid MCP
  message."
- Messages are UTF-8 encoded.

So the wire format per line is: one serialized JSON-RPC object, no embedded `\n`,
UTF-8, followed by a newline. Anything extra on stdout (banner lines, debug prints,
`console.log` from a misbehaving library) **breaks the transport**. This is the #1 real-world
pitfall.

### 2.2 Streamable HTTP

The server "MUST provide a single HTTP endpoint path (hereafter referred to as the MCP
endpoint)" that accepts both POST and GET (e.g. `https://example.com/mcp`).

**POST (client → server messages)**:
1. "The client MUST use HTTP POST to send JSON-RPC messages to the MCP endpoint."
2. "The client MUST include an `Accept` header, listing both `application/json` and
   `text/event-stream` as supported content types."
3. Body is a single JSON-RPC request, notification, or response. (No batching since
   `2025-06-18`.)
4. If the input is a *response* or *notification*: server MUST return `202 Accepted` with
   no body on success, or an HTTP error code otherwise (the error body MAY be a JSON-RPC
   error response with no `id`).
5. If the input is a *request*: server MUST return either `Content-Type:
   application/json` (a single JSON object) **or** `Content-Type: text/event-stream` (an
   SSE stream) and the client MUST support both.
6. If SSE is used: "The SSE stream SHOULD eventually include JSON-RPC response for the
   JSON-RPC request sent in the POST body." Server MAY send interleaved requests /
   notifications before the response, and SHOULD close the stream after sending the
   response.

**GET (server → client push stream)**:
1. Client MAY issue GET to open a standalone SSE stream for server-initiated messages.
2. Client MUST include `Accept: text/event-stream`.
3. Server MUST either return `text/event-stream` or `HTTP 405 Method Not Allowed`.
4. Server MUST NOT send responses on this stream unless resuming a prior stream.

**Session management**:
- Server MAY assign a session by returning `Mcp-Session-Id: <id>` on the
  `InitializeResult` HTTP response.
- Session ID "SHOULD be globally unique and cryptographically secure (e.g., a securely
  generated UUID, a JWT, or a cryptographic hash)" and "MUST only contain visible ASCII
  characters (ranging from 0x21 to 0x7E)".
- Once assigned, client MUST include `Mcp-Session-Id` on all subsequent HTTP requests.
- Server MAY terminate a session and MUST respond with `HTTP 404 Not Found` to requests
  carrying a terminated session ID.
- Client receiving 404 MUST start a new session by sending a new `InitializeRequest`
  without a session ID.
- Client SHOULD `DELETE` the endpoint with the session ID header to terminate cleanly.
  Server MAY respond `405 Method Not Allowed` to that DELETE.

**Resumability and redelivery**:
- Server MAY attach `id` fields to SSE events. IDs must be unique per session/stream.
- Client resuming a broken connection SHOULD issue a GET with the `Last-Event-ID` HTTP
  header. Server MAY replay events that would have been delivered on that stream after
  the last-seen event ID, and MUST NOT replay events from other streams.

**Multiple connections**: A server MUST NOT broadcast the same message across multiple
connected SSE streams — each message goes on one stream only. This is important for
correctness.

**Security**:
- "Servers MUST validate the `Origin` header on all incoming connections to prevent DNS
  rebinding attacks." The `2025-11-25` clarification requires HTTP 403 on invalid Origin.
- "When running locally, servers SHOULD bind only to localhost (127.0.0.1) rather than
  all network interfaces (0.0.0.0)."
- "Servers SHOULD implement proper authentication for all connections."

### 2.3 Legacy HTTP+SSE

The deprecated flavor used two separate endpoints — typically `POST /messages` for client
messages and `GET /sse` for server events, with the server sending an `endpoint` event as
the first SSE event to tell the client where to POST. The backwards-compatibility
strategy, per spec, is:

- **Servers** wanting to support old clients SHOULD host both the legacy SSE+POST
  endpoints and the new MCP endpoint.
- **Clients** wanting to support old servers SHOULD POST `InitializeRequest` to the URL
  first; if that fails with 4xx (e.g. 405/404), GET the URL expecting an SSE `endpoint`
  event and then use the legacy transport.

(https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#backwards-compatibility)

### 2.4 Custom transports

Any transport that preserves JSON-RPC framing and the lifecycle is allowed. The protocol
is transport-agnostic. WebSockets, Unix domain sockets, etc. are permitted.

---

## 3. Initialization handshake

The initialization phase "MUST be the first interaction between client and server".
(https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)

### Sequence

1. **Client → Server**: `initialize` request carrying `protocolVersion`, `capabilities`,
   and `clientInfo`.
2. **Server → Client**: response carrying `protocolVersion`, `capabilities`, `serverInfo`,
   and optional `instructions`.
3. **Client → Server**: `notifications/initialized` notification.
4. Normal operations begin.

### Example `initialize` request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {},
      "elicitation": {}
    },
    "clientInfo": {
      "name": "ExampleClient",
      "title": "Example Client Display Name",
      "version": "1.0.0"
    }
  }
}
```

### Example `initialize` response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "logging": {},
      "prompts":  { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "tools":     { "listChanged": true }
    },
    "serverInfo": {
      "name": "ExampleServer",
      "title": "Example Server Display Name",
      "version": "1.0.0"
    },
    "instructions": "Optional instructions for the client"
  }
}
```

### Example `initialized` notification

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

### Rules around pre-initialization traffic

Quoted from the lifecycle page:

- "The client SHOULD NOT send requests other than pings before the server has responded
  to the `initialize` request."
- "The server SHOULD NOT send requests other than pings and logging before receiving the
  `initialized` notification."

SDK behavior is stricter than the text: real SDKs typically reject any non-ping request
received before initialization is complete and return a JSON-RPC error. The ambiguity
("SHOULD NOT" vs practical implementation) is a frequent source of bugs in home-grown
servers.

### Error example (version mismatch)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Unsupported protocol version",
    "data": { "supported": ["2024-11-05"], "requested": "1.0.0" }
  }
}
```

### Shutdown

- "No specific shutdown messages are defined — instead, the underlying transport
  mechanism should be used to signal connection termination."
- **stdio**: client closes the server's stdin, waits for the child to exit, then sends
  `SIGTERM` and finally `SIGKILL` if necessary. Server MAY initiate shutdown by closing
  its own stdout and exiting.
- **HTTP**: shutdown is indicated by closing the HTTP connections (and optionally sending
  DELETE to the MCP endpoint to terminate a session cleanly).

There is **no** `shutdown` request or `exit` notification in modern MCP. Older LSP-style
shutdown is not used.

### Timeouts

- "Implementations SHOULD establish timeouts for all sent requests."
- "When the request has not received a success or error response within the timeout
  period, the sender SHOULD issue a cancellation notification for that request and stop
  waiting for a response."
- Implementations "MAY choose to reset the timeout clock when receiving a progress
  notification ... However, implementations SHOULD always enforce a maximum timeout."

---

## 4. Server capabilities

All server capabilities are declared in the `initialize` response under `capabilities`.
A server MAY omit any capability it doesn't implement. Clients MUST respect negotiated
capabilities and SHOULD NOT call methods for capabilities the server did not declare.

Capability table, from `basic/lifecycle`:

| Category | Capability     | Meaning                                                       |
| -------- | -------------- | ------------------------------------------------------------- |
| Server   | `prompts`      | Offers prompt templates                                       |
| Server   | `resources`    | Provides readable resources                                   |
| Server   | `tools`        | Exposes callable tools                                        |
| Server   | `logging`      | Emits structured log messages                                 |
| Server   | `completions`  | Supports argument autocompletion                              |
| Server   | `experimental` | Describes non-standard experimental features                  |

Sub-capabilities:
- `listChanged: true` (prompts, resources, tools) — server will emit `…/list_changed`
  notifications when its catalog mutates.
- `subscribe: true` (resources only) — clients can subscribe to individual resource URIs.

### 4.1 tools

(https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

Tools are "model-controlled": the LLM chooses when to call them. The spec repeatedly
insists on human-in-the-loop for tool calls.

**Methods**:
- `tools/list` — paginated list of tool descriptors. Supports `cursor` input and
  `nextCursor` output.
- `tools/call` — invoke a tool. Params: `name`, `arguments`.
- `notifications/tools/list_changed` — sent by server if `listChanged: true`.

**Tool descriptor fields**:
- `name` — programmatic id, required. "Unique identifier for the tool".
- `title` — optional human-readable name for display (introduced in `2025-06-18`).
- `description` — human-readable description, used by the LLM.
- `inputSchema` — JSON Schema of the call arguments. Required. Typically `type: "object"`
  with `properties`, `required`.
- `outputSchema` — optional JSON Schema for `structuredContent`.
- `annotations` — optional object with behavior hints (see below).
- `icons` — optional (added `2025-11-25`).

**Tool annotations** — all booleans and all advisory hints:
- `title` — human-readable title (alternative to top-level `title`).
- `readOnlyHint` — tool does not modify its environment.
- `destructiveHint` — tool may perform destructive operations.
- `idempotentHint` — repeated calls with the same args are safe.
- `openWorldHint` — the tool interacts with an "open world" (e.g. the internet), so its
  output depends on state outside the server.

The spec says: "For trust & safety and security, clients **MUST** consider tool
annotations to be untrusted unless they come from trusted servers." Annotations are not
security controls.

**Tool result format** (either shape is valid; both may be combined):

```json
{
  "content": [
    { "type": "text",  "text": "..." },
    { "type": "image", "data": "<b64>", "mimeType": "image/png" },
    { "type": "audio", "data": "<b64>", "mimeType": "audio/wav" },
    { "type": "resource_link", "uri": "file:///...", "name": "...", "mimeType": "..." },
    { "type": "resource", "resource": { "uri": "...", "mimeType": "...", "text": "..." } }
  ],
  "structuredContent": { /* optional typed object conforming to outputSchema */ },
  "isError": false
}
```

**Content block types**:
- `text` — `text: string`.
- `image` — base64 `data` + `mimeType`.
- `audio` — base64 `data` + `mimeType` (added in `2025-03-26`).
- `resource_link` — `{ uri, name, description?, mimeType?, annotations? }`. Links to a
  resource without embedding it. "Resource links returned by tools are not guaranteed to
  appear in the results of a `resources/list` request." (Added in `2025-06-18`.)
- `resource` — embedded resource with inline `text` or `blob` plus URI and MIME type.

All content blocks support the same `annotations` as resources: `audience: ["user" |
"assistant"]`, `priority: 0..1`, `lastModified: "<ISO 8601>"`.

**Structured content** (added in `2025-06-18`):
- Typed JSON result object, returned in `structuredContent`.
- "For backwards compatibility, a tool that returns structured content SHOULD also return
  the serialized JSON in a TextContent block."
- If `outputSchema` is declared, "Servers MUST provide structured results that conform to
  this schema" and "Clients SHOULD validate structured results against this schema."

**Two error modalities**:
- **Protocol errors** (JSON-RPC `error` object at the top level) — for "Unknown tools",
  "Invalid arguments", server errors. Per `2025-11-25` clarification, input validation
  errors should be reported as *tool-execution* errors, not protocol errors, so that the
  LLM can self-correct. So the modern advice is: only reserve protocol errors for
  truly unknown tools or infrastructure failures.
- **Tool execution errors** — `result.isError = true` with content describing the
  failure. Use this for API failures, business logic violations, and — per `2025-11-25`
  guidance — input validation errors.

Example protocol error:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": { "code": -32602, "message": "Unknown tool: invalid_tool_name" }
}
```

Example tool execution error:
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [{ "type": "text", "text": "Failed to fetch weather data: API rate limit exceeded" }],
    "isError": true
  }
}
```

**Required server security behaviors** (MUST):
- Validate all tool inputs
- Implement proper access controls
- Rate-limit tool invocations
- Sanitize tool outputs

**Recommended client behaviors** (SHOULD):
- Prompt for user confirmation on sensitive operations
- Show tool inputs to the user before calling the server
- Validate tool results before passing to the LLM
- Implement timeouts for tool calls
- Log tool usage for audit purposes

### 4.2 resources

(https://modelcontextprotocol.io/specification/2025-06-18/server/resources)

Resources are "application-driven" — the host decides how resources are surfaced.

**Methods**:
- `resources/list` — paginated list of resources.
- `resources/read` — read the contents of a specific URI.
- `resources/templates/list` — paginated list of templated URIs (RFC 6570).
- `resources/subscribe` — ask the server to notify of changes to a URI.
- `resources/unsubscribe` — stop receiving updates for a URI.
- `notifications/resources/list_changed` — catalog-level change.
- `notifications/resources/updated` — individual-resource change (requires subscribe).

**Resource descriptor fields**:
- `uri` — required, unique.
- `name` — programmatic name.
- `title` — optional display name (added `2025-06-18`).
- `description` — optional.
- `mimeType` — optional.
- `size` — optional size in bytes.
- `annotations` — optional (`audience`, `priority`, `lastModified`).
- `icons` — optional (added `2025-11-25`).

**Template descriptor fields** (`resourceTemplates`):
- `uriTemplate` — RFC 6570 template, e.g. `file:///{path}`.
- `name`, `title`, `description`, `mimeType` — same semantics as a regular resource.

**`resources/read` response**:
```json
{
  "contents": [
    { "uri": "file:///example.txt", "mimeType": "text/plain", "text": "..." }
  ]
}
```
`contents` is an **array** — a single read can return multiple content blocks. Each block
has either `text` (UTF-8 text) or `blob` (base64-encoded bytes) plus the URI and MIME
type.

**Standard URI schemes** (not exhaustive):
- `https://` — only when the client can fetch directly; otherwise prefer a custom scheme.
- `file://` — filesystem-shaped resources; does not need to map to an actual file.
  Directories can be annotated with `inode/directory` XDG MIME type.
- `git://` — git integration.
- Custom schemes are allowed per RFC 3986.

Standard error codes for resources:
- `-32002` — "Resource not found" (MCP-specific code).
- `-32603` — internal error.

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "error": {
    "code": -32002,
    "message": "Resource not found",
    "data": { "uri": "file:///nonexistent.txt" }
  }
}
```

Subscribe model: the server holds the subscription state. When a subscribed resource
changes, the server pushes `notifications/resources/updated` with just the `uri`. The
client is then expected to re-`read` if it cares about the new contents. This is a pure
*invalidation* event — the notification does not carry the new payload.

### 4.3 prompts

(https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)

Prompts are "user-controlled" — typically surfaced as slash commands in the host UI.

**Methods**:
- `prompts/list` — paginated.
- `prompts/get` — render a specific prompt with user-supplied arguments.
- `notifications/prompts/list_changed` — sent on catalog change if declared.

**Prompt descriptor fields**:
- `name` — required, unique id.
- `title` — optional display name.
- `description` — optional.
- `arguments` — array of `{ name, description?, required? }` descriptors.
- `icons` — optional (added `2025-11-25`).

**`prompts/get` response**:
```json
{
  "description": "Code review prompt",
  "messages": [
    {
      "role": "user",
      "content": { "type": "text", "text": "Please review this Python code:\n..." }
    }
  ]
}
```

`messages[].role` is `"user"` or `"assistant"`. `messages[].content` is a content block
(text, image, audio, or embedded `resource`).

Prompt-related error codes:
- `-32602` (Invalid params) for invalid prompt names or missing required arguments
- `-32603` (Internal error) for implementation failures

### 4.4 logging + completion

**Logging** (https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/logging):

- Capability: `"logging": {}` (no sub-capabilities).
- `logging/setLevel` request from client — sets a minimum severity for log
  notifications. Params: `{ "level": "debug" | "info" | "notice" | "warning" | "error" |
  "critical" | "alert" | "emergency" }`. This is the RFC 5424 syslog level set.
- `notifications/message` — server pushes log messages.

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "level": "error",
    "logger": "database",
    "data": { "error": "Connection failed", "details": { "host": "localhost", "port": 5432 } }
  }
}
```

Security rules: "Log messages MUST NOT contain credentials or secrets, personal
identifying information, or internal system details that could aid attacks." Servers
SHOULD rate-limit log notifications.

**Completion**
(https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/completion):

- Capability: `"completions": {}`.
- `completion/complete` request — provides IDE-style autocompletion for prompt arguments
  and templated resource URIs.

Request params:
- `ref` — one of:
  - `{ "type": "ref/prompt", "name": "code_review" }`
  - `{ "type": "ref/resource", "uri": "file:///{path}" }`
- `argument` — `{ name, value }` pair currently being completed.
- `context.arguments` — map of already-resolved argument names → values (added in
  `2025-06-18` to allow dependent completions).

Response:
```json
{
  "completion": {
    "values": ["python", "pytorch", "pyside"],
    "total": 10,
    "hasMore": true
  }
}
```
- Values capped at **100** per response.
- `total` optional, `hasMore` boolean.

---

## 5. Client capabilities

These are the things a host application offers back to servers. Declared on the
`initialize` request.

### 5.1 sampling

(https://modelcontextprotocol.io/specification/2025-06-18/client/sampling)

- Capability: `"sampling": {}`.
- Method: `sampling/createMessage` — **server → client** request. The server asks the host
  to run an LLM completion on its behalf (nested agentic behavior without the server
  needing its own API keys).

Request params:
- `messages` — array of `{ role: "user" | "assistant", content: <text|image|audio> }`.
- `modelPreferences` — `{ hints: [{ name }], costPriority, speedPriority, intelligencePriority }`.
  Priorities are 0..1 normalized floats. Hints are "substrings that can match model names
  flexibly". "Hints are advisory — clients make final model selection."
- `systemPrompt` — optional string system prompt.
- `includeContext` — optional, controls whether the client should include MCP context in
  the prompt.
- `temperature`, `maxTokens`, `stopSequences`, `metadata` — standard LLM-ish parameters.

Response: `{ role: "assistant", content, model, stopReason }` where `stopReason` is
something like `"endTurn"`, `"stopSequence"`, `"maxTokens"`.

`2025-11-25` adds `tools` and `toolChoice` parameters, enabling server-initiated tool
calling via the client's LLM.

The spec insists: "Users must explicitly approve any LLM sampling requests" and lists
sampling as a capability that "SHOULD always be in the loop" — the UI SHOULD let the user
edit the request prompt and review the response before it is returned to the server.
"The protocol intentionally limits server visibility into prompts" — that is, the server
cannot demand the client include any particular chunk of the user's conversation.

### 5.2 roots

(https://modelcontextprotocol.io/specification/2025-06-18/client/roots)

- Capability: `"roots": { "listChanged": true }` (the sub-capability is optional).
- Method: `roots/list` — server queries the client for the list of filesystem roots it's
  allowed to work within.
- Notification: `notifications/roots/list_changed` — client MUST send this when the root
  set changes *if* it declared `listChanged`.

Root descriptor:
- `uri` — "**MUST** be a `file://` URI in the current specification".
- `name` — optional human-readable name.

The roots protocol is a **sandbox advertisement**: the host tells the server "these are
the directories I'll accept operations on". Enforcement is up to the server, but the
spec says servers SHOULD "Respect root boundaries during operations" and "Validate all
paths against provided roots". Clients MUST validate root URIs "to prevent path traversal".

The filesystem reference server's documentation explicitly says that when a client sends
roots during initialization, the roots "completely replace server-side allowed
directories" — this is the idiomatic pattern.

If the client does not support roots, the server receives `-32601 Method not found`:
```json
{ "code": -32601, "message": "Roots not supported", "data": { "reason": "..." } }
```

### 5.3 elicitation

(https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)

New in `2025-06-18`; the spec notes its "design may evolve in future protocol versions".

- Capability: `"elicitation": {}`.
- Method: `elicitation/create` — server → client request. Server asks the host to prompt
  the user for some structured information.

Request params:
- `message` — short human-readable explanation.
- `requestedSchema` — a **restricted** JSON Schema. Per spec:

  > "Elicitation schemas are limited to flat objects with primitive properties only ...
  > Complex nested structures, arrays of objects, and other advanced JSON Schema features
  > are intentionally not supported to simplify client implementation."

  Supported types:
  - `string` (with `minLength`, `maxLength`, `format: "email" | "uri" | "date" | "date-time"`)
  - `number` / `integer` (with `minimum`, `maximum`)
  - `boolean` (with `default`)
  - enum (via `enum` + `enumNames`)

Response actions use a three-state model:
- `accept` — user approved with data: `{ "action": "accept", "content": { ... } }`
- `decline` — user explicitly declined: `{ "action": "decline" }` (no content)
- `cancel` — user dismissed without choosing: `{ "action": "cancel" }` (no content)

Servers MUST handle all three states.

Hard rule: "Servers **MUST NOT** use elicitation to request sensitive information." For
secrets / OAuth / payments, `2025-11-25` adds a **URL-mode elicitation** where the server
asks the client to open a URL in the user's browser.

---

## 6. Tool schema details

Tool input schemas are plain JSON Schemas, but there are several defaults and conventions
worth nailing down:

- **Top-level type** is almost always `object` with `properties` and `required`. Primitive
  top-level types are uncommon even for tools with a single argument — they're still wrapped.
- **Required fields**: use `required: ["a", "b"]` at the object level.
- **Defaults** are not applied by the client, only by the server. Don't assume the client
  filled them in.
- **Enums**: `type: "string", enum: ["a", "b"]`, optionally with `enumNames` for display.
- **Nested objects**: permitted (and common) for tool inputs. Not permitted for
  elicitation schemas.
- **oneOf / anyOf / allOf / const**: permitted, though LLM-driven clients often struggle
  with highly-disjunctive schemas. Prefer flat parameter lists with clear descriptions.
- **Dialect**: as of `2025-11-25`, "Establish JSON Schema 2020-12 as the default dialect
  for MCP schema definitions". Older versions allowed the dialect to float.
- **Additional properties**: set `additionalProperties: false` to reject unknown fields.
  (Not explicitly required by the spec but strongly recommended and done by all reference
  servers.)
- **Descriptions are model-facing**: the LLM sees both the top-level `description` and
  the per-property `description`. Quality matters more than brevity — short, clear,
  unambiguous.

Tool **output** schemas:
- Optional; if provided, `structuredContent` in the result MUST conform.
- Clients SHOULD validate (but aren't required to).
- The spec recommends duplicating the structured content as a serialized JSON string in a
  `text` content block for backwards compatibility with clients that don't understand
  structuredContent.

---

## 7. Resource URI conventions

- URIs follow RFC 3986.
- Custom schemes are fine but SHOULD be lowercase.
- Templated URIs follow RFC 6570 level 1+ patterns, e.g.
  `file:///{path}`, `repo://{owner}/{name}/commit/{sha}`.
- The spec recommends:
  - `https://` only when the client can fetch directly without going through the MCP
    server.
  - `file://` for anything that looks like a filesystem, real or virtual.
  - `git://` for Git integration.
  - Define a custom scheme when you want to hide the fetching mechanism from the client.
- Binary vs text: a `resources/read` result uses `text` for UTF-8 text and `blob`
  (base64) for bytes. Choose based on the content, not the MIME type.
- Stability: resource URIs should be stable — the LLM might remember a URI across turns
  and re-read it. Don't embed ephemeral tokens in the URI unless you really mean it.

---

## 8. Security + auth

### 8.1 stdio

"Implementations using an STDIO transport **SHOULD NOT** follow [the authorization
specification], and instead retrieve credentials from the environment." Trust is
established by process ownership — the client launched the subprocess so it inherently
controls it.

Practical implications:
- API keys and other secrets are passed via environment variables (or a config file).
- The server's stdout is *only* MCP messages; logs and secrets must not be printed there.
- Root enforcement is the only real sandboxing (and is advisory).

### 8.2 HTTP

Authorization is "OPTIONAL" in principle but strongly normative when HTTP is used. The
spec layer is OAuth 2.1, with these references:
- OAuth 2.1 IETF DRAFT (`draft-ietf-oauth-v2-1-13`)
- RFC 8414 — OAuth 2.0 Authorization Server Metadata
- RFC 7591 — Dynamic Client Registration
- RFC 9728 — Protected Resource Metadata
- RFC 8707 — Resource Indicators

MUST-level requirements (from `basic/authorization`):

- "Authorization servers **MUST** implement OAuth 2.1."
- "MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC 9728). MCP
  clients **MUST** use OAuth 2.0 Protected Resource Metadata for authorization server
  discovery."
- "Authorization servers **MUST** provide OAuth 2.0 Authorization Server Metadata (RFC
  8414). MCP clients **MUST** use [it]."
- "MCP servers **MUST** use the HTTP header `WWW-Authenticate` when returning a *401
  Unauthorized* to indicate the location of the resource server metadata URL." (Note:
  `2025-11-25` makes WWW-Authenticate optional if `.well-known/oauth-protected-resource`
  is reachable at a conventional URL.)
- "MCP clients **MUST** implement Resource Indicators for OAuth 2.0 as defined in RFC
  8707 to explicitly specify the target resource for which the token is being requested.
  The `resource` parameter MUST be included in both authorization requests and token
  requests."
- "MCP clients MUST implement PKCE according to OAuth 2.1 Section 7.5.2."
- "MCP client MUST use the `Authorization: Bearer <access-token>` header. Access tokens
  **MUST NOT** be included in the URI query string."
- "Authorization **MUST** be included in every HTTP request from client to server, even
  if they are part of the same logical session."
- "MCP servers **MUST NOT** accept or transit any other tokens."
- "The MCP server MUST NOT pass through the token it received from the MCP client [to
  upstream APIs]." (Anti-token-passthrough rule.)
- "All authorization server endpoints MUST be served over HTTPS."
- "All redirect URIs MUST be either `localhost` or use HTTPS."

Error status codes for HTTP auth:
- `401 Unauthorized` — token missing or invalid.
- `403 Forbidden` — insufficient scope / permissions.
- `400 Bad Request` — malformed authorization request.

SHOULD-level:
- DCR (Dynamic Client Registration) — both sides SHOULD support it.
- Short-lived access tokens SHOULD be issued; refresh tokens MUST be rotated for public
  clients.
- Use and verify `state` parameters in the OAuth code flow.

### 8.3 Tool permission gating

The spec leans heavily on host-side guardrails:
- "Hosts must obtain explicit user consent before invoking any tool."
- "Users should understand what each tool does before authorizing its use."
- "There SHOULD always be a human in the loop with the ability to deny tool invocations."
- "Applications SHOULD: Provide UI that makes clear which tools are being exposed to the
  AI model; Insert clear visual indicators when tools are invoked; Present confirmation
  prompts to the user for operations."

These are client obligations, not server obligations. A server cannot enforce them from
its side; the best it can do is mark tools with `destructiveHint: true` and trust the host.

### 8.4 Roots as sandbox

Roots carry **no enforcement**. They are a handshake: the client advertises the allowed
`file://` URIs, and the server is on its honor to stay inside them. The spec says servers
SHOULD "Respect root boundaries during operations" and "Validate all paths against
provided roots" — but an auditor should assume a malicious server ignores roots entirely.

### 8.5 General security principles

From the main specification overview:
1. **User consent and control** — explicit, understandable consent for all data access
   and operations.
2. **Data privacy** — hosts must get consent before exposing user data, and must not
   transmit it elsewhere without consent.
3. **Tool safety** — tool descriptions/annotations are "untrusted unless obtained from a
   trusted server"; treat every tool call as arbitrary code execution.
4. **LLM sampling controls** — user approves each sampling request and controls what the
   server sees.

---

## 9. Lifecycle and state

### Session state

MCP sessions are stateful. Between `initialize` and connection close:
- A server MAY remember state across tool calls (e.g. authenticated user context, open
  DB handles, in-memory caches).
- The stdio transport has exactly one session per process lifetime.
- Streamable HTTP sessions may outlive individual HTTP connections via `Mcp-Session-Id`.

Requests during operation:
- Both parties MUST respect the negotiated protocol version and MUST only use
  capabilities that were negotiated. (This is `MUST` as of `2025-06-18`; previously
  `SHOULD`.)

### Request IDs

- "Requests MUST include a string or integer ID."
- "Unlike base JSON-RPC, the ID MUST NOT be `null`."
- "The request ID MUST NOT have been previously used by the requestor within the same
  session." — i.e. IDs are globally unique per-session, not per-direction.
- Responses MUST echo the same `id`.
- Notifications MUST NOT include an id.

### Batching

- `2025-03-26` allowed JSON-RPC batching.
- `2025-06-18` **removed** it. Servers implementing `2025-06-18` or newer MUST NOT accept
  batch arrays. Servers supporting older clients may still allow it, but new
  implementations should not.

### Cancellation

`notifications/cancelled`:
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/cancelled",
  "params": { "requestId": "123", "reason": "User requested cancellation" }
}
```

Rules:
- Notifications MUST reference requests issued in the **same direction** (a client
  cancels its own request, a server cancels its own request).
- The `initialize` request **MUST NOT** be cancelled by clients.
- Receivers SHOULD stop processing, free resources, and NOT send a response. But
  receivers MAY ignore cancellations for unknown or already-completed requests.
- Senders should handle race conditions: a late response may arrive after the cancel was
  sent. Senders SHOULD ignore any such response.

### Progress

Requests opt in by including a `progressToken` in `_meta`:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "some_method",
  "params": { "_meta": { "progressToken": "abc123" } }
}
```

Receivers send `notifications/progress`:
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 50, "total": 100,
    "message": "Reticulating splines..."
  }
}
```

- Progress tokens MUST be unique across active requests and are opaque.
- `progress` MUST be monotonically increasing.
- `total` and `message` are optional.
- Progress notifications MUST stop after the request completes.

### Pagination

Operations that support pagination: `resources/list`, `resources/templates/list`,
`prompts/list`, `tools/list`.

- Cursors are **opaque** strings chosen by the server.
- Clients MUST NOT parse, modify, or persist cursors.
- Missing `nextCursor` means "end of results".
- Invalid cursors SHOULD result in `-32602` (Invalid params).

### Ping

`ping` is a simple request/response pair used to test liveness. It's usable before
initialization completes; both `initialize`-related SHOULD-NOT rules carve out ping.

---

## 10. Reference server implementations

The `modelcontextprotocol/servers` repo currently maintains 7 reference servers. Many
others that used to live there (Sentry, Slack, Postgres, SQLite, GitHub, GitLab, Drive,
Puppeteer, Redis, etc.) were moved to `servers-archived`.

| Server              | Language   | Transport(s) | Notes                                                     |
| ------------------- | ---------- | ------------ | --------------------------------------------------------- |
| Everything          | TypeScript | stdio + SSE + Streamable HTTP | The test server — exercises every protocol feature.       |
| Fetch               | Python     | stdio        | HTML → markdown fetcher.                                  |
| Filesystem          | TypeScript | stdio        | Sandboxed file ops with `roots` integration.              |
| Git                 | Python     | stdio        | Git repository tools.                                     |
| Memory              | TypeScript | stdio        | Persistent knowledge-graph memory store.                  |
| Sequential Thinking | TypeScript | stdio        | Single tool that drives multi-step reasoning.             |
| Time                | Python     | stdio        | Timezone conversion via IANA.                             |

### 10.1 Filesystem server (TypeScript) — anatomy

(https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)

**Tools exposed** (14):

Read-only:
- `read_text_file` — Read complete contents of a file as text. Optional `head`/`tail`
  line counts.
- `read_media_file` — Read an image or audio file (returns base64).
- `read_multiple_files` — Batch reader that keeps going on individual failures.
- `list_directory` — Lists `[FILE]`/`[DIR]` entries.
- `list_directory_with_sizes` — As above plus size and sort.
- `directory_tree` — Recursive JSON tree structure.
- `search_files` — Recursive pattern search with include/exclude globs.
- `get_file_info` — Metadata (timestamps, permissions).
- `list_allowed_directories` — Inspection tool for the current sandbox.

Mutating:
- `write_file` — Destructive create/overwrite.
- `edit_file` — Selective pattern-based edits with a `dryRun` boolean preview mode.
- `create_directory` — Idempotent.
- `move_file` — Destructive; fails if destination exists.

**Inputs**: string paths, `head`/`tail` line counts, arrays for batch operations. The
`edit_file` tool takes an array of `{ oldText, newText }` edit objects plus `dryRun`.

**Config**: command-line arguments specify allowed directories. The preferred approach
is to let the client send `roots` during initialization, which "completely replaces
server-side allowed directories". No restart required.

**Annotations**: uses `readOnlyHint`, `idempotentHint`, `destructiveHint` to signal safety
profile.

**Error handling**: validates that all paths fall inside an allowed directory; returns
tool execution errors (`isError: true`) for access violations rather than protocol
errors, matching the `2025-11-25` guidance.

**Lessons**:
- Put the sandbox declaration in roots; use argv as a fallback.
- Annotate each tool's side-effect class.
- Provide a `dryRun` mode for destructive tools where it makes sense.

### 10.2 Git server (Python) — anatomy

(https://github.com/modelcontextprotocol/servers/tree/main/src/git)

**Tools exposed** (12), all `snake_case` and verb-prefixed with `git_`:
- `git_status`, `git_diff_unstaged`, `git_diff_staged`, `git_diff`, `git_commit`,
  `git_add`, `git_reset`, `git_log`, `git_create_branch`, `git_checkout`, `git_show`,
  `git_branch`.

**Inputs**: every tool takes `repo_path` as its first argument. Additional per-tool
arguments are primitive or primitive arrays.

**Interesting patterns**:
- Uniform `repo_path` parameter rather than implicit "current repo" state — stateless per
  call.
- `git_log` accepts "ISO 8601 format, relative dates (e.g., '2 weeks ago'), or absolute
  dates" — it's happy to forward loose human strings to the underlying library.
- Distributed via `uvx` / `pip`; configured via CLI: `uvx mcp-server-git --repository
  path/to/git/repo`.

**Lessons**:
- Prefer stateless tool calls where feasible — no hidden session state on the server.
- Pass paths explicitly so the same process can serve multiple repos.
- Namespace tools by subsystem (`git_*`).

### 10.3 Memory server (TypeScript) — anatomy

(https://github.com/modelcontextprotocol/servers/tree/main/src/memory)

Implements a knowledge-graph memory store with entities, relations, and observations.

**Tools exposed**:
- `create_entities`, `create_relations`
- `add_observations`, `delete_observations`
- `delete_entities`, `delete_relations`
- `read_graph`, `search_nodes`, `open_nodes`

**Input shape**: arrays of typed objects, e.g.
```json
{
  "entities": [
    { "name": "John_Smith", "entityType": "person", "observations": ["Speaks Spanish"] }
  ]
}
```

**Interesting patterns**:
- Bulk operations are the default. Nothing takes a single entity at a time.
- Write operations are silently idempotent — `create_*` "ignores entities with existing
  names"; `delete_*` are "silent operation if entity doesn't exist".
- Storage is a local JSON file — persistent across invocations.

**Lessons**:
- Bulk-first APIs reduce round-trip count for the LLM.
- Silent idempotency prevents the LLM from getting stuck in retry loops.

### 10.4 Fetch server (Python) — anatomy

- One tool: `fetch(url, max_length=5000, start_index=0, raw=False)`. Truncates by
  default, with offset-based paging so the model can continue reading.
- One prompt: `fetch(url)` — lets the user trigger the same thing via slash command.
- Config via CLI (`uvx mcp-server-fetch`) or Docker.
- Called out in its own README: "This server can access local/internal IP addresses and
  may represent a security risk." The server does not guard against SSRF itself.

**Lessons**: the spec's chunking pattern (`start_index`, `max_length`) is a great
workaround for context-window limits. The server also ships as a *prompt* that wraps the
tool, so slash-command triggering is as easy as `/fetch https://...`.

### 10.5 Time server (Python) — anatomy

Two tools, both minimal:
- `get_current_time(timezone)`
- `convert_time(source_timezone, time, target_timezone)`

All inputs are IANA timezone names or `HH:MM` strings. No config required — the server
detects the local timezone automatically. Showcase example for "an MCP server can be
10 lines of real code and still be useful".

### 10.6 Sequential Thinking server (TypeScript) — anatomy

Single tool: `sequential_thinking` with these inputs:
- `thought` (string) — the current thinking step
- `nextThoughtNeeded` (boolean)
- `thoughtNumber` (integer)
- `totalThoughts` (integer)
- `isRevision` (boolean, optional)
- `revisesThought` (integer, optional)
- `branchFromThought` (integer, optional)
- `branchId` (string, optional)
- `needsMoreThoughts` (boolean, optional)

Interesting: an entire MCP server dedicated to one tool that's basically a scratchpad
the model writes chain-of-thought into. `DISABLE_THOUGHT_LOGGING=true` env var to turn
off output. Proves that single-tool servers are a valid pattern.

### 10.7 Everything server (TypeScript) — anatomy

"This MCP server attempts to exercise all the features of the MCP protocol. It is not
intended to be a useful server, but rather a test server for builders of MCP clients.
It implements prompts, tools, resources, sampling, and more to showcase MCP
capabilities."

Supports three transport modes out of the box via CLI arg:
- `npx @modelcontextprotocol/server-everything` (stdio, default)
- `npx @modelcontextprotocol/server-everything sse` (legacy HTTP+SSE)
- `npx @modelcontextprotocol/server-everything streamableHttp` (new transport)

Use this as the gold-standard reference for "what does an MCP server with every feature
implemented look like end-to-end."

### 10.8 Archived servers — commonalities

The archived list (GitHub, GitLab, Postgres, SQLite, Sentry, Slack, Brave Search, Drive,
Maps, Redis, Puppeteer, etc.) shared several patterns worth noting even though they're
unmaintained:

- Naming conventions: `subsystem_verb_noun` (e.g. `github_create_issue`,
  `postgres_query`).
- Config via env vars for secrets (e.g. `GITHUB_TOKEN`, `POSTGRES_CONNECTION_STRING`).
- One tool per discrete API capability rather than a single "do anything" tool.
- Wrapper Dockerfiles so users can run via `docker run`.

---

## 11. Client implementations

The official "Example Clients" directory at https://modelcontextprotocol.io/clients is
the canonical list. Relevant clients and the MCP features each supports:

| Client                       | Tools | Resources | Prompts | Sampling | Roots | Elicitation | OAuth/DCR |
| ---------------------------- | :---: | :-------: | :-----: | :------: | :---: | :---------: | :-------: |
| **Claude Desktop**           | yes   | yes       | yes     | limited  | yes   | yes         | yes       |
| **Claude Code** (CLI)        | yes   | yes       | yes     | —        | yes   | yes         | DCR       |
| **Claude.ai** (web)          | yes   | yes       | yes     | —        | —     | —           | CIMD, DCR |
| **VS Code / GitHub Copilot** | yes   | yes       | yes     | yes      | yes   | yes         | CIMD, DCR, tasks |
| **Cursor**                   | yes   | —         | yes     | —        | yes   | yes         | DCR       |
| **Cline** (VS Code ext)      | yes   | yes       | —       | —        | —     | —           | —         |
| **Continue** (VS Code/JB)    | yes   | yes       | yes     | —        | —     | —           | —         |
| **Zed**                      | yes   | —         | yes     | —        | —     | —           | —         |
| **Windsurf**                 | yes   | —         | —       | —        | —     | —           | —         |
| **LibreChat**                | yes   | —         | —       | —        | —     | —           | DCR       |

(Matrix compiled from the supports= attribute strings in
https://modelcontextprotocol.io/clients, summarized.)

**Observations**:
- **Tools are universal**; every client supports them. If you want your server to work
  everywhere, tools are the primitive to invest in.
- **Resources support is uneven**. Many "newer" clients (Cursor, Zed, Windsurf) skip
  resources entirely.
- **Prompts** are common but not universal.
- **Sampling**, **roots**, **elicitation** are only on the heaviest clients (Claude
  Desktop, VS Code Copilot, Claude Code).
- **OAuth/DCR** is increasingly common on web-class clients.

**Connection management patterns**:
- Claude Desktop reads `claude_desktop_config.json` with a top-level `mcpServers` map:
  each entry has a `command`, `args`, `env`, and optionally a `cwd`.
- VS Code uses `.vscode/mcp.json` at workspace level and a global user-level
  `mcp.json`.
- Cursor and Windsurf have similar per-workspace config files.
- All the major clients spawn one stdio subprocess per server and route tool calls to
  the right one based on tool name namespacing.

---

## 12. SDK comparison

### 12.1 TypeScript SDK

(https://github.com/modelcontextprotocol/typescript-sdk)

- **v1.x** — "currently stable, recommended for production" — ships as
  `@modelcontextprotocol/sdk` on npm.
- **v2** (pre-alpha on `main`) — splits into `@modelcontextprotocol/server` and
  `@modelcontextprotocol/client`, plus middleware packages
  `@modelcontextprotocol/node`, `@modelcontextprotocol/express`,
  `@modelcontextprotocol/hono`. Schemas use "Standard Schema — bring Zod v4, Valibot,
  ArkType, or any compatible library." Stable v2 expected in Q1 2026.
- Runs on Node.js, Bun, and Deno.

**High-level API (`McpServer`)** — the recommended entry point:
```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

server.registerTool(
  'calculate-bmi',
  {
    title: 'BMI Calculator',
    description: 'Calculate Body Mass Index',
    inputSchema: { weightKg: z.number(), heightM: z.number() },
    outputSchema: { bmi: z.number() }
  },
  async ({ weightKg, heightM }) => {
    const output = { bmi: weightKg / (heightM * heightM) };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```
(Source: `docs/server.md` in the typescript-sdk v1.x branch.)

**Tool registration API** has two forms:
- `server.registerTool(name, schema, handler)` — the idiomatic form shown above.
- The `RegisteredTool` returned supports `.remove()`, `.enable()`, `.disable()`,
  `.update()` — all of which automatically emit `tools/list_changed` notifications.
- `server.sendToolListChanged()` — manual trigger.

**Resource registration**:
```ts
server.registerResource(
  'config',
  'config://app',
  { title: 'Application Config', description: '...', mimeType: 'text/plain' },
  async (uri) => ({ contents: [{ uri: uri.href, text: 'App configuration here' }] })
);
```

**Transports** in the v1 SDK:
- `StdioServerTransport` / `StdioClientTransport`
- `StreamableHTTPServerTransport` / `StreamableHTTPClientTransport`
- `SSEServerTransport` / `SSEClientTransport` — legacy, kept for backwards compat

**Schema validation**: v1.x uses Zod (peer dep), with `zod/v4` preferred internally but
Zod v3.25+ accepted. v2 switches to Standard Schema so you can bring any validator.

**Error handling** — pattern:
```ts
server.registerTool('risky-operation', {...}, async () => {
  try {
    const result = await doSomething();
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true
    };
  }
});
```

**Dragons**:
- The SDK will `console.log` to stdout through transient dependencies if you're not
  careful — this breaks stdio transport immediately. Route all logging to stderr.
- `createMcpExpressApp()` exists to auto-configure DNS rebinding protection via Host
  header validation (`hostHeaderValidation(['localhost', '127.0.0.1', 'myhost.local'])`).
  Bypassing it (or binding to `0.0.0.0`) is the main footgun.
- Server-initiated requests (sampling, elicitation, `roots/list`) are exposed via
  helper methods on the server class — easy to forget to gate them behind a capability
  check.

### 12.2 Python SDK

(https://github.com/modelcontextprotocol/python-sdk)

- v1.x on PyPI as `mcp`; v2 in pre-alpha development.
- Two APIs: **FastMCP** (decorator-based, high-level) and a low-level `Server` class.

**FastMCP minimal example**:
```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Demo", json_response=True)

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

@mcp.resource("greeting://{name}")
def get_greeting(name: str) -> str:
    """Get a personalized greeting"""
    return f"Hello, {name}!"

@mcp.prompt()
def greet_user(name: str, style: str = "friendly") -> str:
    """Generate a greeting prompt"""
    return f"Greet {name} in a {style} way."

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

- Tool input schemas inferred from Python type hints (int, str, float, bool, Pydantic
  models, dataclasses). Returned values are auto-wrapped as text content.
- Resource templates take RFC 6570 templates directly as the decorator argument.
- `mcp.run(transport=...)` supports `"stdio"`, `"sse"`, and `"streamable-http"`.
- ASGI mounting is supported for embedding in Starlette/FastAPI apps.

The Python SDK also supports full **lifespan** management with startup/shutdown hooks
via `asynccontextmanager`, and a `Context` object injected into tool handlers that
exposes logging, progress, sampling, elicitation, and reading of roots.

### 12.3 Rust and other SDKs

There are community-maintained Rust, Go, and C# SDKs under the
`modelcontextprotocol/*-sdk` org; their coverage varies. The `2025-11-25` spec adds
"SDK tiering system with clear requirements for feature support and maintenance
commitments" — indicating Anthropic is moving toward explicit tiers (Tier 1 = must
cover every protocol feature, Tier 2 = may skip some, etc.).

### 12.4 Minimum viable MCP server, TypeScript

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'mini', version: '0.0.1' });

server.registerTool(
  'echo',
  {
    description: 'Echo a message back',
    inputSchema: { text: z.string() }
  },
  async ({ text }) => ({ content: [{ type: 'text', text }] })
);

await server.connect(new StdioServerTransport());
```

That's ~15 LOC for a conformant MCP server. The same in FastMCP Python is 6 LOC.

---

## 13. Best practices summary

Gleaned from the spec, the TS/Python SDKs, and the reference servers:

1. **Use the high-level SDK primitives** (`McpServer`, `FastMCP`) unless you have a
   specific reason not to. Low-level `Server` is for SDK authors and exotic cases.
2. **Never write to stdout on the stdio transport** for anything other than MCP messages.
   Route logs to stderr. Silence library banners explicitly.
3. **Declare capabilities honestly** during `initialize`. If you don't implement
   `listChanged`, don't say you do.
4. **Tool names**: `snake_case`, verb-first, short enough for the LLM to pattern-match.
   Namespace by subsystem (`git_commit`, `fs_read`) when you have many tools. Per
   SEP-986 in `2025-11-25`, the spec now provides explicit guidance on tool naming.
5. **Tool descriptions**: describe the tool's effect, not its implementation. Mention
   required preconditions and what the tool returns. The description is prompt
   engineering — LLMs read it to decide whether to call.
6. **Use `inputSchema` to full effect**: `required`, `additionalProperties: false`,
   tight `enum`s, per-property `description`. This both documents for the LLM and
   validates for safety.
7. **Declare output schemas** for tools that return structured data. Pair with
   `structuredContent` in responses. Keep a JSON-stringified copy in a text content
   block for backwards compatibility.
8. **Annotate every tool**. Set `readOnlyHint`, `destructiveHint`, `idempotentHint`,
   `openWorldHint` truthfully. Clients use them to choose UI treatments and confirmation
   flows.
9. **Return tool execution errors as `isError: true`**, not as JSON-RPC errors. Reserve
   JSON-RPC errors for "this isn't even a valid request" situations. Per `2025-11-25`
   clarification, even input validation errors should be tool execution errors.
10. **Idempotency matters**: tools that LLMs are likely to retry should be idempotent
    where possible. Use `idempotentHint: true` to signal it.
11. **Bulk operations by default**. The memory server's pattern (arrays of items in,
    silent success on duplicates) keeps the LLM from getting stuck in loops.
12. **Make destructive operations previewable**. The filesystem server's `edit_file`
    with `dryRun: true` is the model. Let the LLM see what would happen before it
    commits.
13. **Use `roots` instead of command-line args** when the client supports it. Fall back
    to argv if roots are absent. Validate every path against roots (server SHOULD).
14. **Pass secrets via environment variables** for stdio servers; never via argv,
    config-file contents, or anything the host might log.
15. **Validate `Origin` headers** on every HTTP request when using Streamable HTTP.
    Bind to `127.0.0.1` unless you're doing something more sophisticated. Per
    `2025-11-25`, invalid `Origin` returns `403 Forbidden`.
16. **Rate-limit log messages**. A chatty `notifications/message` stream can drown out
    real traffic on the same connection.
17. **Keep progress notifications reasonable** (e.g. at most a few per second). Always
    use `progressToken` from `_meta`, not an implicit correlation.
18. **Handle cancellation gracefully** — treat it as advisory; don't crash the tool
    call if the request is already finished. Never cancel `initialize`.
19. **Keep resource URIs stable**. LLMs will remember them across turns. Don't embed
    ephemeral tokens.
20. **Version your tool schemas explicitly**. Breaking changes should ship under new
    tool names (`fs_write_v2`) rather than silently changing argument shape. Pair with
    `notifications/tools/list_changed` so clients re-list.
21. **Don't ship `_meta` reserved prefixes**. `modelcontextprotocol.*`, `mcp.*`, and
    `*.mcp.*` are all reserved for protocol use.
22. **Close cleanly**. On stdio, close stdout and exit. On HTTP, respond to the DELETE
    or tear down the session when the client disconnects.
23. **Test with the Everything server** on the client side, and against the **MCP
    Inspector** (`npx @modelcontextprotocol/inspector`) on the server side. Don't trust
    hand-rolled tests.
24. **Treat tool annotations as untrusted**: clients MUST NOT rely on `destructiveHint`
    as a safety mechanism if the server is untrusted.

---

## 14. Standards checklist for Fulcrum audit

This is the actionable list. Every MUST item below should be testable against a running
Fulcrum MCP server using either the MCP Inspector, the `everything` reference client,
or a direct JSON-RPC harness.

### 14.1 MUST

**Protocol basics**

- [ ] M-1. All messages are valid JSON-RPC 2.0 with `jsonrpc: "2.0"` field.
- [ ] M-2. Requests include a non-null string-or-integer `id` that has not been used
      previously in the session.
- [ ] M-3. Responses echo the request `id` exactly; include either `result` or `error`,
      never both.
- [ ] M-4. Notifications never include an `id` and never receive a response.
- [ ] M-5. Error objects include integer `code` and string `message` at minimum.
- [ ] M-6. Does **not** accept JSON-RPC batch arrays when protocol version is
      `2025-06-18` or later.

**Initialization**

- [ ] M-7. Responds to `initialize` with a matching `protocolVersion` (or the latest
      version it supports if the client's version is unknown).
- [ ] M-8. `initialize` response includes `serverInfo: { name, version }` and a
      `capabilities` object.
- [ ] M-9. Does not send non-ping, non-logging requests before receiving
      `notifications/initialized`.
- [ ] M-10. Rejects any request other than `ping` received before `initialize` with an
      appropriate error.
- [ ] M-11. Only uses capabilities that were actually declared and negotiated.

**Transport — stdio**

- [ ] M-12. Writes only valid MCP messages to stdout (no banners, no `console.log`
      leakage, no stack traces).
- [ ] M-13. All stdout messages are single-line UTF-8 JSON followed by a newline; no
      embedded newlines inside the JSON.
- [ ] M-14. Does not crash on stdin close; exits cleanly when stdin closes.

**Transport — Streamable HTTP** *(only if the server exposes HTTP)*

- [ ] M-15. Provides a single MCP endpoint path that supports both POST and GET.
- [ ] M-16. POST with a JSON-RPC request returns either `application/json` **or**
      `text/event-stream`.
- [ ] M-17. POST with a JSON-RPC notification or response returns `202 Accepted` with
      empty body on success.
- [ ] M-18. Accepts client `Accept: application/json, text/event-stream` header and
      does not error on its presence.
- [ ] M-19. Validates the `Origin` header on every request; returns `403 Forbidden` on
      invalid Origin (per `2025-11-25`).
- [ ] M-20. Binds to localhost (`127.0.0.1`) by default when running locally.
- [ ] M-21. If session management is used, returns `Mcp-Session-Id` on the
      `InitializeResult` response and accepts it on all subsequent requests.
- [ ] M-22. Returns `HTTP 404` to requests carrying a session ID that is no longer
      valid.
- [ ] M-23. Returns `HTTP 400` on requests with an invalid/unsupported
      `MCP-Protocol-Version` header.
- [ ] M-24. Does not broadcast the same JSON-RPC message across multiple SSE streams.

**Tools capability** *(if declared)*

- [ ] M-25. Declares `capabilities.tools` in the `initialize` response.
- [ ] M-26. `tools/list` returns an array of `{ name, description, inputSchema }`
      objects; `inputSchema` is a valid JSON Schema object.
- [ ] M-27. Each tool's `inputSchema` has `type: "object"` with explicit `properties`
      and `required`.
- [ ] M-28. `tools/call` accepts `{ name, arguments }` and returns
      `{ content: [...], isError?: boolean }`.
- [ ] M-29. Unknown tool name returns a JSON-RPC error with code `-32602` or
      `-32601`.
- [ ] M-30. Tool execution failures (API errors, business logic errors, input
      validation errors) set `result.isError = true` rather than returning a JSON-RPC
      error.
- [ ] M-31. If `listChanged: true` declared, sends `notifications/tools/list_changed`
      when the tool set changes.
- [ ] M-32. If a tool declares `outputSchema`, its `structuredContent` conforms to that
      schema.
- [ ] M-33. Validates every tool argument against its `inputSchema` before execution.

**Resources capability** *(if declared)*

- [ ] M-34. Declares `capabilities.resources` in the `initialize` response.
- [ ] M-35. `resources/list` returns `{ resources: [...] }` with valid `uri`, `name`,
      and optionally other metadata.
- [ ] M-36. `resources/read` returns `{ contents: [...] }` where each content has
      `uri`, `mimeType`, and either `text` or `blob`.
- [ ] M-37. `resources/read` on an unknown URI returns JSON-RPC error `-32002`
      ("Resource not found").
- [ ] M-38. Validates all resource URIs before use (no path traversal, no scheme
      confusion).
- [ ] M-39. If `subscribe: true` declared, supports `resources/subscribe`,
      `resources/unsubscribe`, and emits `notifications/resources/updated` on change.
- [ ] M-40. If `listChanged: true` declared, emits `notifications/resources/list_changed`
      on catalog change.
- [ ] M-41. Binary content is base64-encoded in the `blob` field.

**Prompts capability** *(if declared)*

- [ ] M-42. Declares `capabilities.prompts` in the `initialize` response.
- [ ] M-43. `prompts/list` returns `{ prompts: [...] }` with `name`, `description`,
      and optional `arguments`.
- [ ] M-44. `prompts/get` accepts `{ name, arguments }` and returns
      `{ description?, messages: [...] }`.
- [ ] M-45. Each message has `role: "user" | "assistant"` and a `content` block.
- [ ] M-46. Missing required prompt arguments return `-32602`.

**Logging capability** *(if declared)*

- [ ] M-47. Declares `capabilities.logging` in the `initialize` response.
- [ ] M-48. Supports `logging/setLevel` and honors the requested minimum level.
- [ ] M-49. Emits `notifications/message` with `{ level, logger?, data }`.
- [ ] M-50. Uses only the RFC 5424 level names: `debug`, `info`, `notice`, `warning`,
      `error`, `critical`, `alert`, `emergency`.
- [ ] M-51. Log data does not contain credentials, secrets, or PII.

**Completion capability** *(if declared)*

- [ ] M-52. Declares `capabilities.completions` in the `initialize` response.
- [ ] M-53. `completion/complete` returns `{ completion: { values, total?, hasMore? } }`
      with values capped at 100.

**Authorization** *(if HTTP-transport and auth used)*

- [ ] M-54. Returns `401 Unauthorized` with a `WWW-Authenticate` header when tokens
      are missing or invalid.
- [ ] M-55. Serves `/.well-known/oauth-protected-resource` (RFC 9728) with a valid
      metadata document containing at least one `authorization_servers` entry.
- [ ] M-56. Validates access tokens per OAuth 2.1 §5.2 before processing the request.
- [ ] M-57. Validates the `aud` claim / audience matches this server (RFC 8707); rejects
      tokens issued for other resources.
- [ ] M-58. Never passes the received access token through to an upstream API.
- [ ] M-59. Accepts tokens only via the `Authorization: Bearer <token>` header — never
      from query string.
- [ ] M-60. All redirect URIs (if client flows are exposed) are `localhost` or HTTPS.

**Security**

- [ ] M-61. Validates every tool input against a schema before execution.
- [ ] M-62. Rate-limits tool invocations.
- [ ] M-63. Binary resource data is always base64-encoded.
- [ ] M-64. stdio servers retrieve credentials from environment variables only, not
      argv or inline config dumps.

### 14.2 SHOULD

- [ ] S-1. Sets `additionalProperties: false` in all tool input schemas.
- [ ] S-2. Publishes a descriptive `title` for every tool, resource, and prompt (added
      in `2025-06-18`).
- [ ] S-3. Tool names are `snake_case`, verb-first, namespaced where multiple tools
      share a subsystem.
- [ ] S-4. Tool `description` reads like a usable prompt; states the effect and result.
- [ ] S-5. Tool `annotations` accurately reflect behavior (`readOnlyHint`,
      `destructiveHint`, `idempotentHint`, `openWorldHint`).
- [ ] S-6. Destructive tools offer a `dryRun` or equivalent preview mode where sensible.
- [ ] S-7. Long-running tools accept a `progressToken` via `_meta` and emit
      `notifications/progress`.
- [ ] S-8. Progress values are monotonically increasing.
- [ ] S-9. Tools returning structured data also return a JSON-serialized copy in a
      `text` content block.
- [ ] S-10. Resources use stable URIs; avoid embedding tokens or timestamps.
- [ ] S-11. Pagination is implemented for list operations that may exceed ~100 items.
- [ ] S-12. Cursors are opaque and validated (`-32602` on invalid).
- [ ] S-13. Logging output is rate-limited.
- [ ] S-14. Request timeouts are per-request configurable in the server (e.g. via env
      or config).
- [ ] S-15. `notifications/cancelled` stops active processing and frees resources.
- [ ] S-16. Servers decline to cancel `initialize` per spec.
- [ ] S-17. stderr is used for operational logging on stdio; no stdout spam.
- [ ] S-18. Error objects include `data` with useful context (URIs, tool names).
- [ ] S-19. `ping` is handled before and after initialization.
- [ ] S-20. Auth servers support Dynamic Client Registration (RFC 7591) when HTTP
      transport is used.

### 14.3 MAY

- [ ] Y-1. Provide rich content blocks (image, audio, resource_link, embedded resource)
      in tool results.
- [ ] Y-2. Support `completion/complete` for prompt and templated resource arguments.
- [ ] Y-3. Declare `experimental` capabilities for non-standard features (documented
      separately).
- [ ] Y-4. Publish icons metadata (added `2025-11-25`).
- [ ] Y-5. Offer session resumability via `Last-Event-ID` on GET resumes.
- [ ] Y-6. Offer URL-mode elicitation for OAuth-like flows (requires `2025-11-25`).
- [ ] Y-7. Offer experimental Tasks for very long-running operations (requires
      `2025-11-25`).
- [ ] Y-8. Use `file://`, `git://`, or a documented custom URI scheme for resources;
      avoid `https://` unless the client fetches directly.

---

## 15. References

All URLs consulted, grouped.

**Official spec (2025-06-18 unless otherwise noted)**

- https://modelcontextprotocol.io/
- https://modelcontextprotocol.io/specification/versioning
- https://modelcontextprotocol.io/specification/2025-06-18
- https://modelcontextprotocol.io/specification/2025-06-18/basic
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation
- https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress
- https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
- https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/logging
- https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/completion
- https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/pagination
- https://modelcontextprotocol.io/specification/2025-06-18/client/sampling
- https://modelcontextprotocol.io/specification/2025-06-18/client/roots
- https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation

**Changelogs**

- https://modelcontextprotocol.io/specification/2025-03-26/changelog
- https://modelcontextprotocol.io/specification/2025-06-18/changelog
- https://modelcontextprotocol.io/specification/2025-11-25/changelog
- https://modelcontextprotocol.io/specification/2025-11-25/ (current version landing)

**Schema source**

- https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-06-18/schema.ts
- https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-06-18/schema.json

**SDKs**

- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x
- https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
- https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/client.md
- https://ts.sdk.modelcontextprotocol.io/ (v1 API docs)
- https://ts.sdk.modelcontextprotocol.io/v2/ (v2 API docs)
- https://github.com/modelcontextprotocol/python-sdk
- https://modelcontextprotocol.github.io/python-sdk/

**Reference servers**

- https://github.com/modelcontextprotocol/servers
- https://github.com/modelcontextprotocol/servers/tree/main/src/everything
- https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
- https://github.com/modelcontextprotocol/servers/tree/main/src/git
- https://github.com/modelcontextprotocol/servers/tree/main/src/memory
- https://github.com/modelcontextprotocol/servers/tree/main/src/fetch
- https://github.com/modelcontextprotocol/servers/tree/main/src/time
- https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking
- https://github.com/modelcontextprotocol/servers-archived (previously reference)

**Clients directory**

- https://modelcontextprotocol.io/clients
- https://claude.com/product/claude-code
- https://claude.ai
- https://code.visualstudio.com/docs/copilot/customization/mcp-servers
- https://docs.cursor.com/context/mcp
- https://github.com/cline/cline
- https://github.com/continuedev/continue
- https://zed.dev/docs/ai/mcp
- https://github.com/danny-avila/LibreChat

**RFCs and standards referenced by the spec**

- RFC 2119 / BCP 14 — requirement language
- RFC 3986 — URI generic syntax
- RFC 5424 — syslog severity levels (used for MCP log levels)
- RFC 6570 — URI templates (used for resource templates)
- RFC 7591 — OAuth 2.0 Dynamic Client Registration
- RFC 8414 — OAuth 2.0 Authorization Server Metadata
- RFC 8707 — OAuth 2.0 Resource Indicators (MUST-level client requirement)
- RFC 9068 — JWT profile for OAuth 2.0 access tokens
- RFC 9728 — OAuth 2.0 Protected Resource Metadata (MUST-level server requirement)
- OAuth 2.1 IETF Draft — `draft-ietf-oauth-v2-1-13`
- JSON-RPC 2.0 — https://www.jsonrpc.org/specification
