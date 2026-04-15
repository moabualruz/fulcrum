# Plan: MCP Protocol Compliance

**Gaps addressed**: GAP-MCP-1 through GAP-MCP-14  
**Priority order**: Critical → Major → Minor  
**Files**: `packages/cli/src/mcp-server.ts`, `packages/cli/src/mcp-tools.ts`

---

## Step 1 — Critical: Origin header validation (GAP-MCP-2)

Add at the top of the HTTP request handler in `mcp-server.ts`, before any processing:

```typescript
// Spec §Transports.Security: validate Origin on Streamable HTTP
const origin = req.headers['origin']
if (origin && origin !== 'null') {
  const allowed = ['http://127.0.0.1', 'http://localhost']
  const originHost = new URL(origin).origin
  if (!allowed.some(a => originHost.startsWith(a))) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Forbidden: invalid Origin' }))
    return
  }
}
```

Acceptance: requests from a browser page on a remote host get HTTP 403.

---

## Step 2 — Major: Declare capabilities (GAP-MCP-1)

In `mcp-server.ts:78-81`, change:
```typescript
{ capabilities: { logging: {} } }
```
to:
```typescript
{ capabilities: { logging: {}, tools: {}, resources: {}, prompts: {} } }
```

Acceptance: `InitializeResult.capabilities` includes all active feature categories.

---

## Step 3 — Major: MCP-Protocol-Version header check (GAP-MCP-3)

In the HTTP handler, after routing to `POST /mcp` for non-initialize requests:

```typescript
const protocolVersion = req.headers['mcp-protocol-version']
if (protocolVersion && protocolVersion !== '2025-11-25' && protocolVersion !== '2025-03-26') {
  res.writeHead(400, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: `Unsupported MCP-Protocol-Version: ${protocolVersion}` }))
  return
}
```

---

## Step 4 — Major: JSON-RPC error for schema validation failures (GAP-MCP-8)

In `mcp-server.ts:112-127`, current code returns `{ content: [...], isError: true }` for Zod validation failures.

Change to: detect `ZodError` and throw a `McpError` with code `-32602` (InvalidParams) instead of returning an isError content block. The SDK will serialize this as a JSON-RPC error.

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
// ...
const parsed = strictSchema.safeParse(args)
if (!parsed.success) {
  throw new McpError(ErrorCode.InvalidParams, JSON.stringify({
    error: 'invalid_input',
    issues: parsed.error.issues,
  }))
}
```

---

## Step 5 — Major: Fix resource list suppression (GAP-MCP-9)

In `mcp-server.ts:149-259`, all `ResourceTemplate` constructors are called with `{ list: undefined }`. Change to either:
- Pass a real `list` handler so `resources/list` works
- Or remove `ResourceTemplate` and use `server.resource()` directly if listing is not needed

---

## Step 6 — Minor: HTTP DELETE session termination (GAP-MCP-4)

Add DELETE handler in the HTTP server routing block:

```typescript
if (req.method === 'DELETE' && url === '/mcp') {
  const sessionId = req.headers['mcp-session-id'] as string
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId)
    res.writeHead(200)
  } else {
    res.writeHead(404)
  }
  res.end()
  return
}
```

---

## Step 7 — Minor: Fix `tags` and `artifact_paths` schema types (GAP-MCP-12)

In `mcp-tools.ts`, change:
```typescript
// write_memory
tags: { type: 'string', description: 'Comma-separated tags...' }
// complete_agent_run
artifact_paths: { type: 'string', description: 'Comma-separated artifact file paths...' }
```
to:
```typescript
tags: { type: 'array', items: { type: 'string' }, description: 'Tag strings' }
artifact_paths: { type: 'array', items: { type: 'string' }, description: 'Artifact file paths' }
```

Update handlers to accept arrays directly (breaking change — wire a union type or migration).

---

## Step 8 — Minor: Zero-param tools (GAP-MCP-7)

Change `{ type: 'object', properties: {} }` on tools with no required params to `{ type: 'object', additionalProperties: false }` to match the handler's `.strict()` validation.

---

## Step 9 — Authentication documentation (GAP-MCP-10)

For the current localhost-only deployment, add a comment block in `mcp-server.ts` near the HTTP server creation:

```typescript
// SECURITY NOTE: This server binds to 127.0.0.1 only (no network exposure).
// For any deployment accessible over a network, add bearer token middleware
// and implement /.well-known/oauth-protected-resource per RFC 9728.
```

This converts the gap from an omission to a conscious, documented decision.

---

## Acceptance Criteria

- [ ] HTTP 403 returned for requests with non-localhost `Origin` header
- [ ] `InitializeResult.capabilities` includes `tools`, `resources`, `prompts`
- [ ] Zod validation failures return JSON-RPC `-32602`, not `isError: true`
- [ ] HTTP DELETE `/mcp` terminates the session
- [ ] `tags` and `artifact_paths` accept arrays
- [ ] All existing tests pass
