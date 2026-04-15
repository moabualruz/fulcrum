# MCP Standards Research

## Spec Version
**2025-11-25** — https://modelcontextprotocol.io/specification/2025-11-25

Schema source of truth: https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-11-25/schema.ts

---

## Key Requirements (Top 10 Most Relevant to Fulcrum)

1. **Server capabilities must declare all active features** — `tools`, `resources`, `prompts`, `logging` must appear in `InitializeResult.capabilities`. Each feature has sub-fields: `tools.listChanged`, `resources.subscribe`, `resources.listChanged`, `prompts.listChanged`. (Lifecycle §Capability Negotiation)

2. **Tool `inputSchema` defaults to JSON Schema 2020-12** — when no `$schema` field is present, implementations MUST treat it as 2020-12. Schemas MUST be valid objects, never `null`. For zero-param tools, use `{ "type": "object", "additionalProperties": false }`. (Basic §JSON Schema Usage, Tools §Data Types)

3. **`outputSchema` + `structuredContent` contract** — if a tool declares `outputSchema`, the server MUST return `structuredContent` conforming to that schema. Structured tools SHOULD also echo the JSON in a `TextContent` block for backwards compatibility. (Tools §Structured Content)

4. **Streamable HTTP: `Origin` header validation is MANDATORY** — servers MUST validate `Origin` on all incoming connections and respond with HTTP 403 if invalid, to prevent DNS rebinding attacks. (Transports §Security Warning)

5. **Streamable HTTP: `MCP-Protocol-Version` header REQUIRED on all subsequent requests** — after initialization, clients MUST include `MCP-Protocol-Version: 2025-11-25` on every HTTP request. Servers MUST reject unknown versions with HTTP 400. (Transports §Protocol Version Header)

6. **Session termination via HTTP DELETE** — clients SHOULD send `DELETE /mcp` with `MCP-Session-Id` to explicitly close a session. Servers MAY respond with HTTP 405 if they don't support client-initiated termination. (Transports §Session Management)

7. **`isError: true` for tool execution errors, JSON-RPC error responses for protocol errors** — input validation failures, API failures, and business logic errors go in `content[]` with `isError: true`. Unknown tool names, malformed requests → JSON-RPC error object with numeric `code`. (Tools §Error Handling)

8. **Authorization: HTTP MCP servers MUST implement OAuth 2.0 Protected Resource Metadata (RFC 9728)** — serving `/.well-known/oauth-protected-resource` or returning `WWW-Authenticate` with `resource_metadata` on 401. STDIO servers SHOULD NOT use OAuth; they retrieve credentials from environment. (Authorization §Protocol Requirements)

9. **Resource subscriptions require capability declaration** — to offer `resources/subscribe`, the server MUST advertise `capabilities.resources.subscribe: true` during initialization. The same applies to `listChanged`. (Resources §Capabilities)

10. **Cancellation uses `notifications/cancelled` with `requestId`** — to cancel an in-progress request, send a notification (not a request) with method `notifications/cancelled` and params `{ requestId, reason? }`. The `initialize` request MUST NOT be cancelled. (Cancellation §Cancellation Flow)

---

## Gap Analysis

### GAP-MCP-1: Server Capabilities Missing `tools`, `resources`, `prompts` Sub-declarations
- **Standard**: `InitializeResult.capabilities` MUST declare each active feature. Example: `{ "tools": { "listChanged": true }, "resources": { "subscribe": true, "listChanged": true }, "prompts": { "listChanged": true }, "logging": {} }`. (Lifecycle §Capability Negotiation)
- **Fulcrum** (`mcp-server.ts:78-81`): `createFulcrumMcpServer` passes only `{ capabilities: { logging: {} } }` to the `McpServer` constructor. Tools, resources, and prompts are registered on the server instance, but `tools`, `resources`, and `prompts` are never included in the declared capabilities object. The SDK may inject these automatically on `tools/list` responses, but the `InitializeResult` returned to clients will be missing the capability declarations.
- **Severity**: Major
- **Fix direction**: Pass the full capabilities object to the `McpServer` constructor: `{ capabilities: { logging: {}, tools: {}, resources: {}, prompts: {} } }`. Add `listChanged` flags once list-change notifications are implemented.

---

### GAP-MCP-2: No `Origin` Header Validation on Streamable HTTP
- **Standard**: Servers MUST validate the `Origin` header on all incoming Streamable HTTP connections. If present and invalid, respond with HTTP 403 Forbidden. This prevents DNS rebinding attacks where remote websites interact with local MCP servers. (Transports §Security Warning)
- **Fulcrum** (`mcp-server.ts:380-431`): The HTTP handler in `runFulcrumMcpHttpServer` processes all requests at `/mcp` without any `Origin` header inspection. There is no allowlist, no rejection of cross-origin requests, and no 403 path.
- **Severity**: Critical
- **Fix direction**: Add an `Origin` validation block at the top of the HTTP request handler. For a local-only server (bound to `127.0.0.1`), reject any `Origin` header that is not `null` (no-origin) or doesn't match a configured allowlist. Return `res.writeHead(403)` on mismatch.

---

### GAP-MCP-3: No `MCP-Protocol-Version` Header Handling
- **Standard**: Clients MUST include `MCP-Protocol-Version: <negotiated-version>` on all HTTP requests after initialization. Servers MUST respond with HTTP 400 if they receive an invalid or unsupported protocol version header. If the header is absent, servers SHOULD assume `2025-03-26`. (Transports §Protocol Version Header)
- **Fulcrum** (`mcp-server.ts:380-431`): The HTTP handler passes requests directly to `sessionEntry.transport.handleRequest(req, res)` with no inspection of the `MCP-Protocol-Version` header. The SDK transport may handle this, but Fulcrum has no explicit validation or 400 rejection path for unknown versions.
- **Severity**: Major
- **Fix direction**: Before delegating to the transport, read `req.headers['mcp-protocol-version']`. If present and not `2025-11-25` (or an explicitly supported older version), return HTTP 400. If absent on non-initialize requests, treat as `2025-03-26` per spec.

---

### GAP-MCP-4: No HTTP DELETE Handler for Session Termination
- **Standard**: Clients SHOULD send `DELETE /mcp` with the `MCP-Session-Id` header to explicitly terminate a session. Servers MAY respond with HTTP 405 if they don't allow client-initiated termination. The server MUST respond with HTTP 404 for subsequent requests using a terminated session ID. (Transports §Session Management)
- **Fulcrum** (`mcp-server.ts:383-386`): The HTTP server only routes `GET` and `POST` implicitly through the SDK transport handler. Non-`/mcp` paths return 404, but there is no `DELETE` method handling. A `DELETE /mcp` request will fall through to the transport which may not handle it correctly.
- **Severity**: Minor
- **Fix direction**: Add a `DELETE` branch in the request handler: check for `MCP-Session-Id`, close and evict the session from the map, respond with HTTP 200 or HTTP 405 if session deletion is not supported.

---

### GAP-MCP-5: `outputSchema` Uses Passthrough Schema Instead of Tool-Specific Schema
- **Standard**: If a tool declares `outputSchema`, the server MUST provide `structuredContent` that conforms to that schema. Clients SHOULD validate `structuredContent` against `outputSchema`. (Tools §Output Schema)
- **Fulcrum** (`mcp-server.ts:66-67, 102`): A single `READ_OUTPUT_SCHEMA = z.object({}).passthrough()` is used for all read-only tools. This is a Zod validation schema, not an actual JSON Schema. The `outputSchema` passed to `registerTool` is the passthrough Zod object — it accepts any shape and provides no client-visible type contract. Tools like `list_tasks`, `get_workspace_status`, etc. have well-defined response shapes that could be expressed as proper output schemas.
- **Severity**: Minor
- **Fix direction**: Either define per-tool output JSON Schemas that match the actual return shapes, or omit `outputSchema` entirely (the spec does not require it). A passthrough schema that accepts anything gives clients false confidence in schema validation.

---

### GAP-MCP-6: Tool Schemas Not `$schema`-Annotated; Implicit 2020-12 Compliance Unverified
- **Standard**: When no `$schema` field is present, implementations MUST treat tool `inputSchema` as JSON Schema 2020-12. Implementations MUST support at least 2020-12 and SHOULD document supported dialects. (Basic §JSON Schema Usage)
- **Fulcrum** (`mcp-tools.ts:29-434`): None of the 22 tool `inputSchema` objects include a `$schema` field. The schemas use a subset of JSON Schema (type, enum, properties, required, items, description) that is valid in both draft-07 and 2020-12, but no validation or documentation confirms 2020-12 compliance. Notably, array items schemas like `create_team_template.slots.items` use nested `properties` which is valid in 2020-12 but the `buildZodShape` converter in `mcp-server.ts:35-59` only handles top-level properties — nested object schemas inside `items` are silently coerced to `z.record(z.string(), z.unknown())`.
- **Severity**: Minor
- **Fix direction**: Add `"$schema": "https://json-schema.org/draft/2020-12/schema"` to all `inputSchema` objects, or document the omission as intentional. Fix `buildZodShape` to recurse into `items.properties` for array schemas with structured item types.

---

### GAP-MCP-7: Zero-Parameter Tools Use Empty `properties: {}` Instead of Spec-Recommended Form
- **Standard**: Tools with no parameters MUST use a valid JSON Schema object. Recommended form: `{ "type": "object", "additionalProperties": false }`. Acceptable alternative: `{ "type": "object" }`. (Tools §Data Types — Tool with no parameters)
- **Fulcrum** (`mcp-tools.ts:429-432`): `get_current_context` uses `{ type: 'object', properties: {} }`. Same pattern appears in `list_agent_profiles` (no `required` field, `properties` with one optional key). `list_team_templates` and `list_agent_definitions` also use `{ type: 'object', properties: {...} }` without `additionalProperties: false`. Passing `properties: {}` is spec-valid but allows any additional properties, which conflicts with the strict Zod validation in the handler (`strictSchema = z.object(shape).strict()`), creating a mismatch: the schema advertises open objects, but the handler rejects unknown keys.
- **Severity**: Minor
- **Fix direction**: For tools with no required parameters, use `{ "type": "object", "additionalProperties": false }` to align the advertised schema with the handler's strict validation behavior.

---

### GAP-MCP-8: Invalid Input Errors Use `isError: true` Instead of JSON-RPC Protocol Errors
- **Standard**: `isError: true` is for tool *execution* errors (API failures, business logic, value-out-of-range). Input that fails to satisfy the `CallToolRequest` schema structure is a *protocol error* and SHOULD be returned as a JSON-RPC error response with code `-32602` (Invalid params). (Tools §Error Handling)
- **Fulcrum** (`mcp-server.ts:112-127`): The strict Zod validation failure path returns `{ content: [{ type: 'text', text: JSON.stringify({error: 'invalid_input', ...}) }], isError: true }`. This is a tool execution error response — it goes to the LLM as a retryable result. Input schema validation failures are protocol-level issues (the client sent wrong types/shapes) and should be protocol errors, not execution errors that the LLM is prompted to self-correct from.
- **Severity**: Major
- **Fix direction**: Throw a JSON-RPC error (code `-32602`) for schema validation failures so the client receives a protocol error, not an `isError` execution result. Reserve `isError: true` for runtime errors from the actual tool logic (the `catch` block at line 138).

---

### GAP-MCP-9: Resource Subscription Not Implemented; Capability Not Declared
- **Standard**: If the server declares `resources.subscribe: true`, it MUST handle `resources/subscribe` requests and send `notifications/resources/updated` when a subscribed resource changes. If not implemented, the capability MUST NOT be declared. (Resources §Capabilities, §Subscriptions)
- **Fulcrum** (`mcp-server.ts:149-259`): Five resources are registered (`workspace`, `workspace-tasks`, `task`, `memory`, `agent-run`), but no subscription handlers exist. The capability object passed to the constructor only includes `{ logging: {} }` — so `resources.subscribe` is at least not falsely advertised (see GAP-MCP-1). However, the `ResourceTemplate` constructor call uses `{ list: undefined }` for all templates, which suppresses resource listing. Clients cannot discover these resources via `resources/list` either.
- **Severity**: Major
- **Fix direction**: Either implement subscription handlers and declare `resources.subscribe: true`, or explicitly document that subscriptions are not supported. Fix the `{ list: undefined }` suppression to allow resource discovery if resources are meant to be client-accessible.

---

### GAP-MCP-10: No Authorization Layer for HTTP Transport
- **Standard**: HTTP-based MCP implementations SHOULD conform to the OAuth 2.1 authorization spec. At minimum, protected servers MUST implement OAuth 2.0 Protected Resource Metadata (RFC 9728) — either a `/.well-known/oauth-protected-resource` endpoint or `WWW-Authenticate` with `resource_metadata` on 401 responses. STDIO implementations SHOULD NOT use OAuth; they retrieve credentials from the environment. (Authorization §Protocol Requirements, §Overview item 4)
- **Fulcrum** (`mcp-server.ts:358-450`): The Streamable HTTP server has no authentication middleware. Any HTTP client that can reach port 4722 can invoke all 22 tools without credentials. There is no `WWW-Authenticate` header, no `/.well-known/oauth-protected-resource` endpoint, and no bearer token validation. The STDIO path is correctly credential-free.
- **Severity**: Critical (for any non-localhost deployment; currently bound to `127.0.0.1` which partially mitigates)
- **Fix direction**: For a local-only deployment, document the localhost-only binding as the security boundary. For any network-exposed deployment, implement bearer token validation middleware (checking an `Authorization: Bearer <token>` header against a configured secret or introspection endpoint) and add the RFC 9728 well-known metadata endpoint.

---

### GAP-MCP-11: No Progress Notification Support
- **Standard**: Operations that accept a `_meta.progressToken` in their params MUST send `notifications/progress` notifications with `{ progressToken, progress, total?, message? }`. The `progress` value MUST increase monotonically. (Progress §Progress Flow)
- **Fulcrum** (`mcp-server.ts:110-144`, `mcp-tools.ts` all tools): No tool handler checks for `_meta.progressToken` in incoming args. Long-running tools like `start_agent_run` (which may dispatch a subprocess) and `build_cos_context` never emit progress notifications. Clients cannot request progress updates and won't receive any.
- **Severity**: Minor
- **Fix direction**: In the tool handler wrapper, extract `args._meta?.progressToken` before validation and pass it to the tool implementation. For tools that involve multi-step work (spawn, build_cos_context), emit `notifications/progress` via `server.server.notification()`.

---

### GAP-MCP-12: `tags` Field on `write_memory` Uses Comma-Separated String Instead of Array
- **Standard**: JSON Schema 2020-12 recommends using proper array types for list values. The spec's tool schema requirements state `inputSchema` MUST be a valid JSON Schema object. Advertising `{ type: 'string' }` for `tags` when the semantics are a list is a schema contract violation — callers cannot know the value must be comma-delimited. (Tools §Data Types, Basic §JSON Schema Usage)
- **Fulcrum** (`mcp-tools.ts:117`): `tags: { type: 'string', description: 'Comma-separated tags (e.g. "decision,architecture")' }`. The description documents the encoding but the schema type is wrong — it should be `{ type: 'array', items: { type: 'string' } }`. Similarly, `complete_agent_run.artifact_paths` (`mcp-tools.ts:195`) uses `type: 'string'` with `description: 'Comma-separated artifact file paths'`.
- **Severity**: Minor
- **Fix direction**: Change `tags` and `artifact_paths` to `{ type: 'array', items: { type: 'string' } }` and update the handler to accept arrays directly. This is a breaking change for callers already passing comma-separated strings — a migration or union type may be needed.

---

### GAP-MCP-13: Sampling (Client `createMessage`) Not Declared or Supported
- **Standard**: Servers that want to request LLM completions from the client MUST only do so if the client declared `sampling: {}` in its capabilities during initialization. The server sends `sampling/createMessage` requests to the client. (Client §Sampling, Lifecycle §Capability Negotiation)
- **Fulcrum** (`mcp-server.ts` entire file): No `sampling/createMessage` request handling or emission is present. This is not a bug if Fulcrum doesn't use server-initiated LLM calls, but the `build_cos_context` tool currently just queries the DB — it does not leverage sampling to have the client's LLM synthesize context. If sampling were ever used, the server would need to check for the `sampling` client capability before issuing `sampling/createMessage`.
- **Severity**: Minor (informational — not a current bug, but a missing capability if ever needed)
- **Fix direction**: Document that sampling is intentionally unsupported. If future tools need server-side LLM calls, gate them on client `sampling` capability negotiation.

---

### GAP-MCP-14: `tools/list` Does Not Support `listChanged` Notifications
- **Standard**: Servers that declare `tools.listChanged: true` MUST send `notifications/tools/list_changed` when the tool list changes. Conversely, if the capability is not declared, the server SHOULD NOT send those notifications. (Tools §Capabilities, §List Changed Notification)
- **Fulcrum** (`mcp-server.ts:78-81`): `tools.listChanged` is not declared (the capability object only has `logging`). The tool list is static (all 22 tools registered at startup), so no notifications are ever needed or sent. This is actually correct behavior for a static tool set — but it should be explicitly documented and the capability object should formally omit `tools.listChanged` (not just omit `tools` entirely, per GAP-MCP-1).
- **Severity**: Minor (informational — current behavior is correct, the declaration is simply absent)
- **Fix direction**: Add `tools: {}` (without `listChanged`) to the capabilities object to properly advertise tool support without implying dynamic list changes.
