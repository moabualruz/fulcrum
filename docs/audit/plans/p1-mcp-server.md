# P1 — MCP Server Rebuild

> Implements all issues from [F1 — MCP Audit](../findings/f1-mcp.md).
> 33 issues. The single highest-leverage change is F1-ISSUE-02: migrating to
> `@modelcontextprotocol/sdk`. Most other issues are resolved as a side-effect
> of that migration.

---

## Goal

Replace the hand-rolled 85-line JSON-RPC loop with `@modelcontextprotocol/sdk`
(`McpServer` + `StdioServerTransport`). Re-register the existing 18-tool
handlers in the SDK's type-safe registry. Add protocol correctness, validation,
resources, prompts, logging, and cancellation. Net code change: likely a
reduction (SDK erases boilerplate).

---

## Issue index

### Phase 1 — Foundation (ship together, all CRITICAL)

| ID | Title | Notes |
|----|-------|-------|
| F1-ISSUE-02 | SDK migration (`McpServer` + `StdioServerTransport`) | Unblocks all phases |
| F1-ISSUE-01 | Bump `protocolVersion` to `2025-11-25` + version negotiation | SDK handles this |
| F1-ISSUE-05 | Init state machine; pre-init gating; `ping` allowlist | SDK handles this |
| F1-ISSUE-06 | Clean shutdown on stdin close + SIGTERM/SIGINT | SDK handles this |
| F1-ISSUE-07 | Protocol conformance test suite | Must be written regardless of SDK |

### Phase 2 — Semantic correctness (HIGH)

| ID | Title |
|----|-------|
| F1-ISSUE-03 | Zod input validation + structured error responses |
| F1-ISSUE-08 | Tool annotations (readOnly/destructive/idempotent/openWorld) + titles |
| F1-ISSUE-09 | `additionalProperties: false` on all tool schemas |
| F1-ISSUE-10 | `outputSchema` + `structuredContent` for read tools |
| F1-ISSUE-20 | Structured errors (kind/field/hint) + secret redaction |
| F1-ISSUE-24 | Rewrite tool descriptions as effect + returns + precondition |

### Phase 3 — Capability expansion (HIGH/MEDIUM)

| ID | Title |
|----|-------|
| F1-ISSUE-04 | Resources capability (workspace/project/task/memory/run/team) |
| F1-ISSUE-11 | Prompts capability — `build_cos_context` as a prompt |
| F1-ISSUE-13 | Logging capability + `logging/setLevel` + `notifications/message` |
| F1-ISSUE-14 | Completions capability for IDs + roles |
| F1-ISSUE-12 | `tools/list_changed` emission when profiles/templates mutate |

### Phase 4 — Scale (MEDIUM)

| ID | Title |
|----|-------|
| F1-ISSUE-15 | Streamable HTTP transport (alongside stdio) |
| F1-ISSUE-16 | OAuth 2.1 for HTTP transport |
| F1-ISSUE-17 | `notifications/cancelled` + AbortController |
| F1-ISSUE-18 | Progress notifications via `_meta.progressToken` |
| F1-ISSUE-19 | Per-tool rate limiting |
| F1-ISSUE-21 | Pagination (opaque cursors) for list tools |
| F1-ISSUE-22 | `dryRun` preview for destructive tools |
| F1-ISSUE-23 | Server-side idempotency keys |
| F1-ISSUE-25 | Consume client `roots`; resolve workspace from roots |

### Phase 5 — Polish (LOW/INFO)

| ID | Title |
|----|-------|
| F1-ISSUE-26 | Correct `serverInfo.version`; populate `instructions` |
| F1-ISSUE-27 | Handle -32700 parse errors and -32600 invalid-request |
| F1-ISSUE-28 | Request-id uniqueness tracking |
| F1-ISSUE-29 | Fix "13 tools" stale copy in help text |
| F1-ISSUE-30 | Extract tool catalogue to own module; `fulcrum mcp tools` |
| F1-ISSUE-31 | `mcp.tool` span correlation with `agent_run` spans |
| F1-ISSUE-32 | Secret-scan tool error payloads before returning |
| F1-ISSUE-33 | `recall_memory` — return real rerank scores; add `max_chars` |

---

## Task breakdown

### Task 1.1 — Extract tool catalogue (precursor to SDK migration)

**Files:**
- Create: `packages/cli/src/mcp-tools.ts`
- Modify: `packages/cli/src/index.ts` — import from mcp-tools.ts

**Steps:**

- [ ] Move all 18 tool handler functions from `index.ts` into `mcp-tools.ts`
  as a `TOOL_REGISTRY: Record<string, ToolDef>` map. Each entry:
  ```ts
  interface ToolDef {
    name: string;
    description: string;
    inputSchema: ZodSchema;
    outputSchema?: ZodSchema;
    annotations?: ToolAnnotations;
    handler: (args: unknown, db: BetterSqlite3.Database) => unknown;
  }
  ```

- [ ] `index.ts` imports `TOOL_REGISTRY` and dispatches from it in `handleToolCall`

- [ ] Run existing tests — all must pass before proceeding

- [ ] Commit: `refactor(mcp): extract tool catalogue to mcp-tools.ts`

---

### Task 1.2 — SDK migration (F1-ISSUE-02) [CRITICAL]

**Files:**
- Modify: `packages/cli/package.json` — add `@modelcontextprotocol/sdk`
- Create: `packages/cli/src/mcp-server.ts`
- Modify: `packages/cli/src/index.ts` — replace `runServeMcp` body

**Steps:**

- [ ] `pnpm add @modelcontextprotocol/sdk` in `packages/cli`

- [ ] Create `mcp-server.ts`:
  ```ts
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
  import { TOOL_REGISTRY } from './mcp-tools.js';

  export function createMcpServer(db: Database) {
    const server = new McpServer({
      name: 'fulcrum',
      version: pkg.version,
    });
    for (const tool of Object.values(TOOL_REGISTRY)) {
      server.tool(tool.name, tool.description, tool.inputSchema.shape, async (args) => {
        const result = await tool.handler(args, db);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      });
    }
    return server;
  }

  export async function runMcpServer(db: Database) {
    const server = createMcpServer(db);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
  ```

- [ ] Replace `runServeMcp` in `index.ts` with a call to `runMcpServer`

- [ ] Run existing tests; fix any breakage

- [ ] Test manually with `npx @modelcontextprotocol/inspector`

- [ ] Commit: `feat(mcp): migrate to @modelcontextprotocol/sdk (McpServer + StdioServerTransport)`

---

### Task 1.3 — Protocol version + init + shutdown (F1-ISSUE-01, -05, -06) [CRITICAL]

These are handled automatically by the SDK after Task 1.2. Verify:

- [ ] Run `npx @modelcontextprotocol/inspector` and confirm protocol version
  shows `2025-11-25` in the initialize response

- [ ] Verify stdin-close triggers clean shutdown (no hanging process)

- [ ] Add `process.on('SIGTERM', () => server.close())` if SDK doesn't handle it

- [ ] Commit: `fix(mcp): verify protocol version, init gating, clean shutdown via SDK`

---

### Task 1.4 — Zod schemas + validation (F1-ISSUE-03, -09) [HIGH]

**Files:**
- Modify: `packages/cli/src/mcp-tools.ts`

**Steps:**

- [ ] For each of the 18 tools, write a Zod schema:
  ```ts
  const ListTasksInput = z.object({
    workspace_id: z.string().min(1),
    project_id: z.string().optional(),
    status: z.enum(['open','in_progress','done','blocked']).optional(),
    limit: z.number().int().positive().default(20),
  });
  ```
  Use `.strict()` on every schema (implements `additionalProperties: false`)

- [ ] Wrap each handler with Zod parse + catch:
  ```ts
  handler: async (rawArgs, db) => {
    const args = ListTasksInput.parse(rawArgs);
    // ...
  }
  ```

- [ ] On `ZodError`, throw with `{ kind: 'validation', field: ..., hint: ... }` shape
  (F1-ISSUE-20)

- [ ] Commit: `feat(mcp): Zod input validation + additionalProperties:false on all tools`

---

### Task 1.5 — Tool annotations + titles + descriptions (F1-ISSUE-08, -24) [HIGH]

**Files:**
- Modify: `packages/cli/src/mcp-tools.ts`

**Steps:**

- [ ] For each tool, classify and add annotations:
  ```ts
  // read-only examples: list_tasks, recall_memory, get_workspace_status
  annotations: { readOnlyHint: true, idempotentHint: true }

  // destructive examples: invoke_team, complete_agent_run
  annotations: { destructiveHint: true }

  // open-world examples: recall_memory (queries external model)
  annotations: { openWorldHint: true }
  ```

- [ ] Add `title` field (human-readable, ≤ 60 chars) to every tool

- [ ] Rewrite `description` fields using the pattern:
  `"[Effect]. Returns [shape]. Requires [preconditions]."`

- [ ] Commit: `feat(mcp): tool annotations, titles, effect-pattern descriptions`

---

### Task 1.6 — `outputSchema` + `structuredContent` (F1-ISSUE-10) [HIGH]

**Files:**
- Modify: `packages/cli/src/mcp-tools.ts`

**Steps:**

- [ ] For all "read" tools (`list_tasks`, `recall_memory`, `get_workspace_status`,
  `build_cos_context`, `get_agent_run_status`), add `outputSchema` as a Zod schema

- [ ] Return `structuredContent` alongside text content:
  ```ts
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
  ```

- [ ] Commit: `feat(mcp): outputSchema + structuredContent for read tools`

---

### Task 1.7 — Resources capability (F1-ISSUE-04) [HIGH]

**Files:**
- Modify: `packages/cli/src/mcp-server.ts`

**Steps:**

- [ ] Define URI scheme:
  - `fulcrum://workspace/{workspace_id}`
  - `fulcrum://task/{workspace_id}/{task_id}`
  - `fulcrum://memory/{workspace_id}/{project_id}`
  - `fulcrum://run/{run_id}`

- [ ] Register resource handlers with `server.resource(uri, handler)`:
  ```ts
  server.resource('fulcrum://task/{workspace_id}/{task_id}', async ({ params }) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.task_id);
    return { contents: [{ uri: ..., mimeType: 'application/json', text: JSON.stringify(task) }] };
  });
  ```

- [ ] Commit: `feat(mcp): resources capability — workspace/task/memory/run URIs`

---

### Task 1.8 — Prompts capability (F1-ISSUE-11) [MEDIUM]

- [ ] Register `build_cos_context` as a prompt with parameters `workspace_id`, `project_id`
- [ ] Register `recall_memory` as a prompt with parameter `query`
- [ ] Commit: `feat(mcp): prompts capability — cos_context and recall_memory prompts`

---

### Task 1.9 — Logging capability (F1-ISSUE-13) [MEDIUM]

- [ ] Enable `server.setRequestHandler('logging/setLevel', ...)` or SDK equivalent
- [ ] Route `fulcrum`'s internal logger through `server.sendLoggingMessage()`
- [ ] Commit: `feat(mcp): logging capability + notifications/message forwarding`

---

### Task 1.10 — `recall_memory` real scores + max_chars (F1-ISSUE-33) [HIGH]

**Files:**
- Modify: `packages/cli/src/mcp-tools.ts` — `recall_memory` handler

**Steps:**

- [ ] Add `max_chars?: number` parameter to `recall_memory` tool schema (default 500)

- [ ] Plumb the rerank score through from `recallMemory()` return value:
  ```ts
  return memories.map(m => ({
    content: m.content.slice(0, args.max_chars ?? 500),
    score: m.rerank_score ?? m.fts_score ?? 0.0,
    tags: m.tags,
    id: m.id,
  }));
  ```

- [ ] Write test: assert score is non-zero when memory exists and query matches

- [ ] Commit: `fix(mcp): recall_memory — real rerank scores + max_chars parameter`

---

### Task 1.11 — Protocol conformance test suite (F1-ISSUE-07) [CRITICAL]

**Files:**
- Create: `packages/cli/src/mcp-server.test.ts`

**Steps:**

- [ ] Use `@modelcontextprotocol/sdk/testing` (or in-process transport) to test:
  - `initialize` returns correct `protocolVersion`, `capabilities`, `serverInfo`
  - `tools/list` returns all 18 tools with non-empty descriptions
  - Each tool returns valid JSON on happy-path call
  - Invalid args return `-32602` with Zod error detail
  - Unknown method returns `-32601`
  - `resources/list` returns all registered resource templates
  - `prompts/list` returns registered prompts

- [ ] Commit: `test(mcp): protocol conformance suite — 18 tools + capabilities`

---

### Task 1.12 — Pagination for list tools (F1-ISSUE-21) [MEDIUM]

- [ ] Add `cursor?: string` to `list_tasks`, `list_team_instances`, `list_agent_profiles`
- [ ] Return `nextCursor` in result when more rows exist
- [ ] Commit: `feat(mcp): opaque cursor pagination for list tools`

---

### Task 1.13 — HTTP transport (F1-ISSUE-15, -16) [MEDIUM — Phase 4]

- [ ] Add `fulcrum serve mcp --http` flag
- [ ] Wire `StreamableHTTPServerTransport` from SDK into Hono/express route
- [ ] Add OAuth 2.1 middleware (F1-ISSUE-16) as a separate auth layer
- [ ] Commit: `feat(mcp): streamable HTTP transport + OAuth 2.1`

---

### Task 1.14 — Cancellation + progress (F1-ISSUE-17, -18) [MEDIUM — Phase 4]

- [ ] Pass `AbortController` signal into slow handlers (`invoke_team`, `start_agent_run`)
- [ ] Emit `notifications/progress` during `invoke_team` execution
- [ ] Commit: `feat(mcp): cancellation + progress notifications`

---

### Task 1.15 — Polish (F1-ISSUE-26 through -32) [LOW — Phase 5]

- [ ] Fix `serverInfo.version` to read from `package.json`
- [ ] Populate `instructions` field in `initialize` response with usage summary
- [ ] Fix "13 tools" stale string in help text
- [ ] Extract `fulcrum mcp tools` introspection command
- [ ] Correlate `mcp.tool` spans with `agent_run` spans
- [ ] Secret-scan error payloads before returning to client
- [ ] Commit: `fix(mcp): serverInfo, stale copy, secret redaction, span correlation`

---

## Deeper Research

1. **`@modelcontextprotocol/sdk` version pinning** — Check `npm show @modelcontextprotocol/sdk versions`
   and pin to the latest stable that implements `2025-11-25`. The SDK version and protocol
   version are independent; confirm which SDK version ships the Streamable HTTP transport.

2. **In-process transport for testing** — The SDK exports an `InMemoryTransport` for tests.
   Confirm the import path before writing Task 1.11.

3. **Resources vs tools distinction** — `get_workspace_status` and `build_cos_context`
   are "getters" that could be resources. Decide the line: resources are stable URIs
   addressable by the client; tools are actions the LLM invokes. Read-only tools that
   require parameters (`workspace_id`) are better as resources. Cross-check R1 §4.

4. **`outputSchema` + `structuredContent` compatibility** — Confirm which clients
   (Claude Code, Gemini) actually consume `structuredContent` vs ignoring it. The SDK
   supports it; the client must too. Check Claude Code MCP docs.

5. **OAuth 2.1 scope for Fulcrum** — If HTTP transport is local-only (localhost),
   OAuth may be unnecessary. Confirm whether F1-ISSUE-16 should be scoped to
   "team/remote deployments only" and treated as optional for the local case.

---

## Acceptance criteria

- `npx @modelcontextprotocol/inspector` connects, lists 18 tools, calls each successfully
- Protocol version shows `2025-11-25` in initialize response
- All 18 tools have non-empty `title`, `description`, `annotations`
- All Zod schemas reject invalid inputs with `-32602` and field-level error details
- `recall_memory` returns non-zero scores
- Protocol conformance test suite passes (100% of tests)
- `pnpm test --filter cli` passes
