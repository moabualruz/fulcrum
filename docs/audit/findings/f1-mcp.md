# F1 — MCP Implementation Audit

> Critical conformance audit of Fulcrum's MCP server against the standards in
> `docs/audit/research/r1-mcp-standards.md`. Every finding is research-cited and
> codebase-cited. Baseline spec version targeted: `2025-06-18` (current: `2025-11-25`).

**Scope:** `runServeMcp()` in `packages/cli/src/index.ts:593-1228` (the entire
hand-rolled JSON-RPC server), the tool registry (18 tools, lines 627-907), the
client-side registration `agent-integration/claude/.mcp.json`, and the
surrounding startup/shutdown plumbing.

**Bottom line up front.** Fulcrum's MCP server is a ~50-line hand-rolled
JSON-RPC 2.0 loop sitting beneath an 18-tool registry. It speaks a dead
protocol version (`2024-11-05`), has zero use of the official TypeScript SDK,
implements none of the `resources`/`prompts`/`logging`/`completions`
capabilities, has no HTTP transport, no OAuth, no argument validation, no
cancellation, no progress, no shutdown handling, no protocol tests, and mixes
tool annotations / `title` / `outputSchema` not at all. This audit identifies
**48 distinct findings** (8 CRITICAL, 13 HIGH, 10 MEDIUM, 9 LOW, 8
INFORMATIONAL) feeding 33 issue IDs into Step 4. The rebuild-vs-retrofit
recommendation at the bottom is **rebuild** — on top of `@modelcontextprotocol/sdk`.

---

## Conformance strengths (what we're doing right)

Fulcrum does get a handful of things right, and they should be preserved through
any rewrite:

1. **JSON-RPC framing is line-delimited and stdout-only for MCP frames.** The
   `rl.on('line')` / `process.stdout.write(... + '\n')` pattern
   (`packages/cli/src/index.ts:1145,1148,1152`) conforms to the stdio framing
   MUST in R1 §2.1 ("messages are delimited by newlines, **MUST NOT** contain
   embedded newlines"). `JSON.stringify` can't emit bare newlines, and no other
   code path writes to stdout inside `runServeMcp`.
2. **stderr is used for the startup banner and the auto-init notice.**
   `packages/cli/src/index.ts:1155` ("[fulcrum mcp] fulcrum MCP server started
   (stdio)") and the silent-init path at `index.ts:2089-2092` both explicitly
   route to stderr. This matches R1 §2.1 / §13 rule 2 ("never write to stdout
   on the stdio transport for anything other than MCP messages") and is the
   #1 thing hand-rolled servers get wrong.
3. **`ping` is handled.** Lines 1218-1221 return an empty result for `ping`,
   satisfying R1 §14.2 S-19 ("`ping` is handled before and after
   initialization") — though see F1-HIGH-3 about the pre-init ordering.
4. **Tool errors are reported as `isError: true`, not JSON-RPC errors.**
   Lines 1210-1214 catch handler exceptions and return
   `{content: [...], isError: true}`. This matches the `2025-11-25` guidance
   (R1 §4.1, §13 rule 9): "input validation errors should be returned as Tool
   Execution Errors rather than Protocol Errors to enable model self-correction".
5. **Every `tools/call` is wrapped in an OTel span.** `startSpan('mcp.tool')`
   at `index.ts:1191-1195` and the matching `endSpan` calls provide real
   observability — better than most reference servers.
6. **Unknown methods return `-32601 Method not found`.** Line 1223 does this
   correctly, matching JSON-RPC 2.0.
7. **Tool names are `snake_case` and verb-first** (mostly). 17 of 18 tools
   follow R1 §13 rule 4 / SEP-986 guidance (`create_task`, `list_tasks`,
   `heartbeat_agent_run`, etc.). Only `get_workspace_status` /
   `get_agent_run_status` are noun-first variants that read fine.
8. **stdio transport chosen for the default agent integration.** Per R1 §2
   ("Clients SHOULD support stdio whenever possible"), stdio is the right
   default for a local workstation-scoped dev tool. The `.mcp.json` registration
   at `agent-integration/claude/.mcp.json:1-8` is a one-line stdio spawn, which
   is exactly how the filesystem / git / memory reference servers are wired.

Everything else is a gap. The rest of this document is the gap list.

---

## Findings — CRITICAL

### [F1-CRIT-1] Advertised `protocolVersion` is 17 months out of date (`2024-11-05`)

- **Standard**: R1 §1 (protocol versions table) — current version is
  `2025-11-25`; base version used throughout R1 is `2025-06-18`. The spec's
  negotiation rule (R1 §1, R1 §3) says: "If the server supports that version,
  it echoes it back; otherwise, it responds with another version it supports,
  which **SHOULD be the latest the server supports**."
  (https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- **Current state**: `packages/cli/src/index.ts:1169` unconditionally returns:
  ```ts
  respond(id ?? null, {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'fulcrum', version: '1.0.0' },
  })
  ```
  The server ignores the client's requested `protocolVersion` entirely and
  replies with the oldest finalized revision of the spec.
- **Gap**: (a) no version negotiation at all — the client's
  `params.protocolVersion` is never read; (b) `2024-11-05` predates virtually
  every modern feature used in this audit (tool annotations, `title`,
  `outputSchema`, structured content, elicitation, resource links, RFC 8707);
  (c) any client that happens to be strict about negotiated version (the
  Python SDK, the Everything reference client, the Inspector) will reject
  `2024-11-05` in a `2025-06-18`-centric deployment or fall back to the
  lowest-common-denominator feature set, silently dropping whatever modern
  features Fulcrum eventually adds.
- **Impact**: Fulcrum cannot use tool annotations, structured content, output
  schemas, resource links, elicitation, `_meta`, or anything else that landed
  after `2024-11-05` without a client that's also been pinned to an old
  version. Any new feature added to R1 after Nov 2024 is structurally
  unreachable. Silent compatibility rot.
- **Fix direction**: Accept the client's `protocolVersion`, respond with the
  latest version the server supports (`2025-11-25` once the SDK supports it,
  `2025-06-18` in the meantime), and reject unknown versions with `-32602` +
  `{supported: [...], requested: ...}` per R1 §3 example.

### [F1-CRIT-2] Hand-rolled JSON-RPC loop instead of `@modelcontextprotocol/sdk`

- **Standard**: R1 §12.1 / §13 rule 1 — "Use the high-level SDK primitives
  (`McpServer`, `FastMCP`) unless you have a specific reason not to. Low-level
  `Server` is for SDK authors and exotic cases." The official TypeScript SDK
  is cited as "currently stable, recommended for production"
  (https://github.com/modelcontextprotocol/typescript-sdk).
- **Current state**: `packages/cli/package.json` has no
  `@modelcontextprotocol/sdk` dependency. The entire server is ~85 lines of
  hand-written code in `packages/cli/src/index.ts:1143-1228`, using only
  Node's `readline` and `process.stdin/stdout`. There is no abstraction over
  request/notification handling, no type-checked tool registration, no
  built-in protocol tests, no Zod-schema → JSON-Schema generation.
- **Gap**: Every single finding in the rest of this document would be
  impossible (or would be a one-line config) if Fulcrum used the SDK's
  `McpServer` + `StdioServerTransport` pair (R1 §12.4 shows a 15-LOC
  conformant server). Hand-rolling means Fulcrum has to manually re-implement
  every MUST in R1 §14.1, and every SHOULD in §14.2, as the spec evolves —
  while the SDK team does exactly this work upstream for free.
- **Impact**: Structural: Fulcrum is pinned to whatever protocol version the
  author hand-wrote at the moment they wrote it (see F1-CRIT-1). The SDK
  auto-emits `tools/list_changed` on `server.registerTool().update()`,
  auto-validates inputs against Zod schemas, auto-handles `ping`,
  `cancelled`, `progress`, `initialize` negotiation, `logging/setLevel`,
  `completion/complete`, sampling round-trips, elicitation, etc. None of
  this exists in Fulcrum.
- **Fix direction**: Delete `runServeMcp()` entirely. Replace with
  `new McpServer({name, version})`, `StdioServerTransport`, and 18
  `server.registerTool(...)` calls. Budget ~200 LOC for the rewrite. This is
  the single highest-leverage change in this audit.

### [F1-CRIT-3] No argument validation against `inputSchema` before dispatch

- **Standard**: R1 §14.1 M-33 ("Validates every tool argument against its
  `inputSchema` before execution"). Also R1 §4.1 "Required server security
  behaviors (MUST): Validate all tool inputs".
- **Current state**: `packages/cli/src/index.ts:1186-1214` hands `params.arguments`
  (cast to `Record<string, unknown>`) straight into `handleToolCall`. Inside,
  every access is a `as string` cast (e.g. line 916:
  `workspace_id: a['workspace_id'] as string`). The `inputSchema` field on
  each tool descriptor (lines 631, 645, 662, ...) is purely documentation for
  the LLM — it is never evaluated, never compared to incoming params, never
  checked for `required`.
- **Gap**: (a) Missing required fields silently become `undefined` and blow up
  deep inside core ops with whatever error SQLite/Zod/etc. happens to throw;
  (b) wrong types (e.g. `workspace_id: 42`) flow through unchanged and can
  cause SQL-level confusion; (c) extra fields aren't rejected
  (`additionalProperties: false` is not set on any schema — see F1-HIGH-2).
- **Impact**: Security and robustness. An LLM that slightly misremembers a
  tool signature gets an opaque runtime exception instead of a structured
  "missing required field: `workspace_id`" response. Per R1 §13 rule 9 / the
  `2025-11-25` clarification, validation errors *should* be `isError: true`
  tool responses so the LLM can self-correct — Fulcrum currently lets the
  failure bubble as whatever the core function throws.
- **Fix direction**: Convert each `inputSchema` to a Zod schema (or register
  via the SDK's `registerTool({ inputSchema: { field: z.string() } })`) and
  fail fast with `isError: true` on parse failure before dispatching to the
  handler.

### [F1-CRIT-4] `resources` capability unimplemented — but Fulcrum is a resource-rich server

- **Standard**: R1 §4.2 (resources), §14.1 M-34-M-41. R1 §13 rule 19 ("Keep
  resource URIs stable. LLMs will remember them across turns"). Resources are
  the second MCP primitive (tools being the first) and are supported by
  every major client (R1 §11 table: Claude Desktop, Claude Code, VS Code
  Copilot, Cursor all list `resources: yes`).
- **Current state**: The `initialize` response at
  `packages/cli/src/index.ts:1170` advertises *only* `capabilities: { tools: {} }`.
  There is no `resources/list`, no `resources/read`, no
  `resources/templates/list`. The server has no concept of a URI scheme.
- **Gap**: Fulcrum's entire data model — **workspaces, projects, tasks,
  memories, artifacts, agent runs, team templates, team instances, agent
  profiles** — is exactly the shape that MCP resources are designed for:
  stable-URI, read-mostly, referenceable by the LLM across turns. Instead,
  every read is forced through a tool call (`list_tasks`, `recall_memory`,
  `get_workspace_status`, `list_team_templates`, `list_team_instances`,
  `get_agent_run_status`, `list_agent_profiles`), which (a) costs a
  tool-call round trip for data the client could fetch itself, (b) gives the
  LLM no stable reference to cite, (c) flattens everything into
  JSON-in-text-content instead of using structured URIs that the host can
  display natively in its UI. Compare to the memory reference server
  (R1 §10.3): it exposes `read_graph` + `search_nodes` as tools *and* keeps
  the underlying store readable — Fulcrum only does the tool half.
- **Impact**: Every host that can display resources in a sidebar (Claude
  Desktop, Claude Code) sees Fulcrum as a pure RPC server with no
  inspectable state. The LLM has no canonical way to say "re-read task
  `fulcrum://workspace/ws_abc/task/task_123`" in turn N+1 and get the
  current state — it has to re-run `list_tasks` and find the row again.
- **Fix direction**: Define a URI scheme (`fulcrum://{workspace_id}/…` or
  `file://.fulcrum/…`), advertise `capabilities.resources: {listChanged:
  true, subscribe: true}`, and expose workspace metadata, tasks, memories,
  runs, team instances, and agent profiles as resources. Tools stay for
  *mutations*; reads migrate to resources. See F1-HIGH-4 for the
  complementary prompts case.

### [F1-CRIT-5] `ping` is not accepted before `initialize` completes

- **Standard**: R1 §3 ("Rules around pre-initialization traffic"): "The
  client SHOULD NOT send requests other than pings before the server has
  responded to the `initialize` request." R1 §14.2 S-19 ("ping is handled
  before and after initialization"). R1 §9 ("`ping` is usable before
  initialization completes").
- **Current state**: `packages/cli/src/index.ts:1157-1224` — the handler
  loop has **no pre-init state machine at all**. It dispatches `initialize`,
  `notifications/initialized`, `tools/list`, `tools/call`, and `ping` in
  whatever order they arrive. Line 1218 (`if (method === 'ping')`) is
  reachable whether or not `initialize` has been seen, which happens to be
  correct for ping — **but for the wrong reason**. The same is true in
  reverse for `tools/list` and `tools/call`: they are dispatched before
  `initialize` and will crash the core layer.
- **Gap**: The two sides of the same bug. (a) There is no state tracking
  `initialized: boolean`, so requests arriving before `initialize` run
  through the handlers unprotected; (b) by the letter of the spec, the
  server SHOULD reject non-ping requests before `initialize` with a
  JSON-RPC error. See also F1-CRIT-6 (the `notifications/initialized`
  acceptance).
- **Impact**: A misbehaving client (or a test harness) can send
  `tools/call` first; Fulcrum will happily open a span and call into
  `@moabualruz/fulcrum-core` with no workspace resolution, producing inconsistent
  state. For `ping`, the behavior is accidentally correct.
- **Fix direction**: Track `initialized: 'pending' | 'init_received' | 'ready'`
  and reject non-ping, non-initialize requests with `-32002` or `-32600`
  until the transition to `ready` (on `notifications/initialized`).

### [F1-CRIT-6] Server does not wait for `notifications/initialized` before accepting `tools/call`

- **Standard**: R1 §14.1 M-9 ("Does not send non-ping, non-logging requests
  before receiving `notifications/initialized`"). R1 §3 ("The server SHOULD
  NOT send requests other than pings and logging before receiving the
  `initialized` notification"). Per the SDK behavior note: "real SDKs
  typically reject any non-ping request received before initialization is
  complete and return a JSON-RPC error."
- **Current state**: Same code path as F1-CRIT-5. `packages/cli/src/index.ts:1177`
  no-ops the `notifications/initialized` message and sets no state, so any
  `tools/call` that immediately follows `initialize` will succeed whether or
  not the client has sent the ack notification.
- **Gap**: Fulcrum conflates "received initialize request" with "session is
  initialized". A strict-mode client that issues `initialize` + waits for
  response + sends `notifications/initialized` then starts calling tools is
  indistinguishable from a client that skips the ack entirely.
- **Impact**: Protocol conformance for the exact state machine R1 §3
  describes. In practice clients ack properly, so this is latent — but it's
  a correctness bug waiting to surface.
- **Fix direction**: Set a `this.initialized = true` flag inside the
  `notifications/initialized` branch and gate `tools/call` on it (see
  F1-CRIT-5 fix).

### [F1-CRIT-7] Server never exits when stdin closes

- **Standard**: R1 §3 Shutdown: "stdio: client closes the server's stdin,
  waits for the child to exit, then sends SIGTERM and finally SIGKILL if
  necessary. Server MAY initiate shutdown by closing its own stdout and
  exiting." R1 §14.1 M-14 ("Does not crash on stdin close; exits cleanly
  when stdin closes"). R1 §13 rule 22 ("Close cleanly. On stdio, close
  stdout and exit.").
- **Current state**: `packages/cli/src/index.ts:1226-1227`:
  ```ts
  // Keep alive
  await new Promise(() => { /* run until killed */ })
  ```
  There is no `rl.on('close')` handler, no `process.stdin.on('end')`,
  no `SIGTERM`/`SIGINT` listener inside `runServeMcp`. The only way for the
  process to exit is via SIGKILL.
- **Gap**: When a client closes stdin (the normal MCP shutdown path),
  Fulcrum's stdin stops delivering lines but the process sits forever on
  an unresolvable promise. The client then has to escalate to SIGTERM then
  SIGKILL, which (a) bypasses any cleanup such as the OTel shutdown handler
  registered by `registerOtelShutdown()`, (b) leaves in-flight spans
  dangling, (c) wastes the 5-10 second grace window the client typically
  gives.
- **Impact**: Every shutdown is a hard kill. OTel flush is best-effort and
  likely drops the last batch. In CI and test harnesses this manifests as
  slow process cleanup and orphan children.
- **Fix direction**: Add `rl.on('close', () => { /* drain, flush OTel,
  process.exit(0) */ })`. Also handle SIGTERM/SIGINT for good measure (the
  one at `index.ts:589` only covers the hook path).

### [F1-CRIT-8] No MCP protocol tests of any kind

- **Standard**: R1 §13 rule 23 ("Test with the Everything server on the
  client side, and against the MCP Inspector (`npx
  @modelcontextprotocol/inspector`) on the server side. Don't trust
  hand-rolled tests."). R1 §14 opening line: "Every MUST item below should
  be testable against a running Fulcrum MCP server using either the MCP
  Inspector, the `everything` reference client, or a direct JSON-RPC
  harness."
- **Current state**: `rg -l 'mcp|MCP' packages/cli/src/tests/` returns
  nothing. The CLI's test suite (`cli-coverage.test.ts`,
  `hook-normalization.test.ts`, `hook-pre-post.test.ts`) covers the hook
  pipeline and argument parsing but **no JSON-RPC roundtrip, no
  `initialize`/`tools/list`/`tools/call` harness, no conformance assertion
  against any R1 MUST**.
- **Gap**: Every fix recommended in this audit ships without a regression
  net. The whole `runServeMcp` function — the most user-facing surface of
  Fulcrum — has zero coverage.
- **Impact**: Any refactor of the JSON-RPC loop is uncoverable by tests.
  Any protocol-version bump is uncoverable. The 18 tool handlers are
  each indirectly covered by `@moabualruz/fulcrum-core` tests but not by any test
  that sends a `tools/call` frame.
- **Fix direction**: Add a test helper that spawns `runServeMcp()` with a
  fake stdin/stdout (or via `child_process.spawn('node', ['dist/cli.js',
  'serve', 'mcp'])`), sends canonical JSON-RPC frames, and asserts on
  responses. Then reach for the MCP Inspector (`npx
  @modelcontextprotocol/inspector fulcrum serve mcp`) as a manual smoke
  and consider scripting it into CI.

---

## Findings — HIGH

### [F1-HIGH-1] Tool annotations are entirely missing

- **Standard**: R1 §4.1 (tool annotations: `readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`, `title`). R1 §13 rule 8 ("Annotate every
  tool"). R1 §14.2 S-5 ("Tool annotations accurately reflect behavior").
  Added in `2025-03-26`.
- **Current state**: None of the 18 tool descriptors in
  `packages/cli/src/index.ts:627-907` include an `annotations` field or a
  `title` field. Example (line 643):
  ```ts
  {
    name: 'create_task',
    description: 'Create a new task in the project.',
    inputSchema: { /* ... */ },
  }
  ```
  No `annotations.destructiveHint`, no `readOnlyHint`, no `title`.
- **Gap**: The filesystem reference server annotates every tool with
  side-effect hints (R1 §10.1). Clients use these to decide whether to
  prompt for user confirmation. With no annotations, a compliant Claude
  Code client treats every tool — `list_tasks`, `write_memory`,
  `invoke_team`, `create_task` — identically, and users get no signal that
  `invoke_team` is structurally destructive (it spawns other agents) while
  `list_tasks` is read-only.
- **Impact**: UX and safety. Hosts that gate destructive calls behind a
  confirmation prompt (the reference pattern) cannot gate any of Fulcrum's
  tools because Fulcrum never said which are destructive.
- **Fix direction**: Classify every tool and add `annotations: {
  readOnlyHint, destructiveHint, idempotentHint, openWorldHint, title
  }`. Obvious mappings: `list_*`, `get_*`, `recall_memory`,
  `build_cos_context` → `readOnlyHint: true`. `create_*`, `update_*`,
  `write_memory`, `heartbeat_agent_run`, `start_agent_run`,
  `complete_agent_run`, `block_agent_run`, `invoke_team` → side-effecting
  (destructive true for `invoke_team`). `heartbeat_agent_run` is
  idempotent. `recall_memory` has `openWorldHint: false`.

### [F1-HIGH-2] No `additionalProperties: false` on any tool schema

- **Standard**: R1 §6 ("`additionalProperties: false` ... Not explicitly
  required by the spec but strongly recommended and done by all reference
  servers."). R1 §14.2 S-1 ("Sets `additionalProperties: false` in all
  tool input schemas").
- **Current state**: No `inputSchema` in `packages/cli/src/index.ts:627-907`
  sets `additionalProperties`. Example (line 631):
  ```ts
  inputSchema: {
    type: 'object',
    properties: { project_id: {...}, workspace_id: {...}, status: {...}, limit: {...} },
    required: ['project_id', 'workspace_id'],
  }
  ```
  An extra field (say, the LLM hallucinates `owner: "me"`) is silently
  ignored.
- **Gap**: Loose schemas teach the LLM that it can throw extra fields at
  Fulcrum without consequence, which makes prompt injection / field
  confusion harder to detect.
- **Impact**: Validation robustness and LLM discipline.
- **Fix direction**: Add `additionalProperties: false` to every tool
  input schema. Do this in the same pass as F1-CRIT-3 (validation).

### [F1-HIGH-3] Missing `outputSchema` / `structuredContent` on tools that return structured data

- **Standard**: R1 §4.1 ("Structured content (added in `2025-06-18`):
  Typed JSON result object, returned in `structuredContent`. For
  backwards compatibility, a tool that returns structured content SHOULD
  also return the serialized JSON in a TextContent block."). R1 §13 rule
  7 ("Declare output schemas for tools that return structured data").
  R1 §14.1 M-32, §14.2 S-9.
- **Current state**: Every handler returns a JSON object which is then
  serialized into a single text content block:
  ```ts
  respond(id, { content: [{ type: 'text', text: JSON.stringify(result) }] })
  ```
  (`packages/cli/src/index.ts:1203`). No tool declares `outputSchema`; no
  call returns `structuredContent`. The client has to JSON.parse the text
  content to get the shape.
- **Gap**: `list_tasks`, `get_workspace_status`, `get_agent_run_status`,
  `list_agent_profiles`, `list_team_templates`, `list_team_instances`,
  `build_cos_context`, `recall_memory`, etc. all produce
  rigorously-shaped objects. These are textbook cases for `outputSchema`
  + `structuredContent`.
- **Impact**: Clients that validate (R1 §4.1 "Clients SHOULD validate
  structured results against this schema") can't. The LLM has to parse
  unstructured text. Any host that wants to render tables (Claude
  Desktop's rich content UI) has to guess the shape.
- **Fix direction**: Declare `outputSchema` on each list/get/recall tool.
  Return `{ content: [{type: 'text', text: JSON.stringify(out)}],
  structuredContent: out }` — belt and suspenders per R1 §13 rule 7.

### [F1-HIGH-4] `prompts` capability unimplemented — `build_cos_context` is misclassified as a tool

- **Standard**: R1 §4.3 (prompts). R1 §11 table ("Prompts are common but
  not universal" — Claude Desktop, Claude Code, VS Code Copilot,
  Continue, Cursor, Zed all support prompts). R1 §10.4 (Fetch server
  example): "The server also ships as a prompt that wraps the tool, so
  slash-command triggering is as easy as `/fetch https://...`".
- **Current state**: `build_cos_context` is registered as a *tool*
  (`packages/cli/src/index.ts:781-795`). It exists specifically to build
  a system-prompt-shaped markdown blob (`context_markdown`) that the
  Chief-of-Staff role pastes into its system prompt. This is the exact
  definition of a prompt template per R1 §4.3.
- **Gap**: Hosts that render MCP prompts as slash commands (Claude
  Code's `/prompts/fulcrum/build_cos_context`, Claude Desktop's prompt
  picker) cannot surface `build_cos_context` because it's not declared
  as a prompt. The LLM has to explicitly invoke it as a tool on every
  session start.
- **Impact**: UX for the most important Fulcrum workflow
  (Chief-of-Staff orientation). The agent-integration CLAUDE.md
  literally tells CoS "Uses `mcp__fulcrum__build_cos_context` to orient
  before every session" — which is a slash-command-shaped workflow
  forced through a tool-call mechanism.
- **Fix direction**: Advertise `capabilities.prompts: { listChanged:
  true }`, expose `build_cos_context` as a prompt via `prompts/list` +
  `prompts/get`, keep the tool version for callers that need the raw
  output inline.

### [F1-HIGH-5] No protocol-version handling of the `2025-06-18` breaking changes

- **Standard**: R1 §1 (2025-06-18 changelog): "Remove support for
  JSON-RPC batching — this is a *breaking* change ... Add support for
  structured tool output ... Classify MCP servers as OAuth Resource
  Servers ... Require MCP clients to implement Resource Indicators as
  described in RFC 8707 ... Change SHOULD to MUST in Lifecycle Operation
  (must respect negotiated capabilities)". R1 §14.1 M-6 ("Does **not**
  accept JSON-RPC batch arrays when protocol version is `2025-06-18` or
  later").
- **Current state**: Because the advertised version is `2024-11-05`
  (F1-CRIT-1), the rules about batching rejection don't technically
  apply — but Fulcrum's loop has no batching support at all (line 1160:
  `JSON.parse(line) as { ... single message type }`). A batched array
  would be parsed as an object, the `method` field would be undefined,
  and line 1223 would error with `-32601 Method not found: undefined`.
- **Gap**: Fulcrum can claim to speak `2024-11-05` (where batching was
  allowed) but doesn't actually handle a batch. If a `2024-11-05`-era
  client sends one, it breaks.
- **Impact**: Latent. Practically no client sends batches anymore.
- **Fix direction**: Moot once Fulcrum upgrades to `2025-06-18+` and
  explicitly rejects arrays. Fold into F1-CRIT-1 fix.

### [F1-HIGH-6] No `tools/list_changed` notifications

- **Standard**: R1 §4 (sub-capabilities: "`listChanged: true` (prompts,
  resources, tools) — server will emit `…/list_changed` notifications
  when its catalog mutates"). R1 §14.1 M-31 ("If `listChanged: true`
  declared, sends `notifications/tools/list_changed` when the tool set
  changes").
- **Current state**: `packages/cli/src/index.ts:1170` advertises
  `tools: {}` — no `listChanged`. Fulcrum's tool set is static per
  process so the sub-capability is technically honest *today*.
  **However**, `list_agent_profiles` and `list_team_templates` change
  at runtime as users call `create_agent_profile` and
  `create_team_template`. If those profiles/templates were exposed via
  resources or prompts (see F1-CRIT-4, F1-HIGH-4), a listChanged
  notification would be required.
- **Gap**: Latent until the resources/prompts work lands; becomes a
  correctness issue then.
- **Impact**: Forward-compatibility / coupling with F1-CRIT-4.
- **Fix direction**: When resources land, declare
  `capabilities.resources.listChanged: true` and emit
  `notifications/resources/list_changed` on `createAgentProfile` /
  `createTeamTemplate` / etc.

### [F1-HIGH-7] No `logging` capability / no `notifications/message` stream

- **Standard**: R1 §4.4 (logging capability). R1 §14.1 M-47-M-51.
  Clients use `logging/setLevel` to subscribe to structured server logs
  carried over the MCP channel; this is how the Claude Code log viewer
  surfaces MCP server output instead of the stderr pipe.
- **Current state**: `packages/cli/src/index.ts:1170` doesn't advertise
  `logging`. All server-side messages go to stderr only (line 1155,
  hook spans, core exceptions). Clients have no in-band way to set a
  log level or receive structured messages.
- **Gap**: The host can't filter Fulcrum's chatter by severity; stderr
  lines are free-form strings, not structured
  `{level, logger, data}` records.
- **Impact**: Debuggability. A user hitting "show MCP logs" in a host
  sees an empty panel because Fulcrum sends nothing in-band.
- **Fix direction**: Advertise `capabilities.logging: {}`, implement
  `logging/setLevel` (store the level in-memory), and route structured
  events through `notifications/message` with RFC 5424 level names.

### [F1-HIGH-8] No `completions` capability for tool arguments

- **Standard**: R1 §4.4 (completion). R1 §14.3 Y-2 ("Support
  `completion/complete` for prompt and templated resource arguments").
  Multiple Fulcrum arguments are high-cardinality enums the host could
  autocomplete.
- **Current state**: Not advertised, not implemented.
- **Gap**: Clients can't offer autocompletion on `workspace_id`,
  `project_id`, `task_id`, `template_id`, `run_id`, or `agent_role` /
  `base_role` (where the value set is the 24 canonical role slugs plus
  DB-backed profiles). All of those are perfect candidates for
  `completion/complete` responses.
- **Impact**: UX — agents and users alike have to copy-paste opaque IDs.
  Particularly painful for `workspace_id` / `project_id` which look
  like `ws_<name>_<12-hex>`.
- **Fix direction**: Advertise `capabilities.completions: {}` and
  implement `completion/complete` for IDs that come from simple DB
  lookups. Return values capped at 100 (R1 §14.1 M-53).

### [F1-HIGH-9] No HTTP / Streamable HTTP transport

- **Standard**: R1 §2 ("MCP uses JSON-RPC 2.0 messages and defines two
  standard transports ... Streamable HTTP — a single HTTP endpoint
  that supports both POST and GET"). R1 §10.7 (Everything reference
  server ships all three modes: stdio, sse, streamableHttp). R1 §14.1
  M-15-M-24.
- **Current state**: `runServeMcp()` handles stdio exclusively; there
  is no HTTP entry point. The `serve` command has `mcp`, `monitor`,
  `all` — where `monitor` is Fulcrum's custom Hono-based HTTP API at
  port 4721, *not* an MCP Streamable HTTP endpoint. The two are
  completely separate and do not share a protocol.
- **Gap**: Any agent that runs outside the local machine (hosted
  Claude Code, a remote CI runner, a team-shared workspace, Fulcrum
  deployed as a side-car in a container) cannot connect. stdio is a
  1:1 local subprocess relationship — it cannot be exposed over a
  network.
- **Impact**: Hard blocker for any remote / multi-tenant / hosted
  deployment. Fulcrum can never be a "team MCP server" without this.
- **Fix direction**: Once the SDK migration (F1-CRIT-2) lands, add a
  `StreamableHTTPServerTransport` alongside `StdioServerTransport`
  and wire it through `fulcrum serve mcp --http :8080` or similar.
  Gate behind OAuth (F1-HIGH-10) before exposing off-localhost.

### [F1-HIGH-10] No OAuth 2.1 / authorization framework

- **Standard**: R1 §8.2 ("Authorization servers MUST implement OAuth
  2.1 ... MCP servers MUST implement OAuth 2.0 Protected Resource
  Metadata (RFC 9728) ... MCP clients MUST use the
  `Authorization: Bearer <access-token>` header ... MCP servers MUST
  NOT accept or transit any other tokens"). R1 §14.1 M-54-M-60.
- **Current state**: Not applicable for stdio (R1 §8.1: "stdio
  implementations SHOULD NOT follow the authorization specification,
  and instead retrieve credentials from the environment"). But see
  F1-HIGH-9: the moment an HTTP transport is added, OAuth becomes
  mandatory for compliance.
- **Gap**: Zero OAuth infrastructure — no `/.well-known/oauth-
  protected-resource`, no bearer-token validation, no audience
  (`aud`) verification per RFC 8707, no WWW-Authenticate header. The
  monitor HTTP API (`packages/monitor`) has no auth either, so any
  "lift monitor to MCP" shortcut would inherit that gap.
- **Impact**: Blocks HTTP mode. Also means the monitor can't be
  exposed off-localhost without a manual reverse-proxy auth layer.
- **Fix direction**: Paired with F1-HIGH-9. Use the SDK's
  middleware/auth helpers when they ship; until then, do not expose
  HTTP transport at all.

### [F1-HIGH-11] No cancellation support (`notifications/cancelled`)

- **Standard**: R1 §9 (Cancellation) and §14.2 S-15
  ("`notifications/cancelled` stops active processing and frees
  resources"). `notifications/cancelled` is a normal part of the
  protocol, issued when a client times out or a user aborts.
- **Current state**: `packages/cli/src/index.ts:1177` catches
  *all* notifications (`id === undefined || id === null`) and
  silently returns. `notifications/cancelled` is therefore received
  and dropped. No request is ever cancelled server-side.
- **Gap**: A long-running `recall_memory` (which hits embeddings
  model warmup + Kuzu), a `build_cos_context` (reads many tables),
  or an `invoke_team` (spawns teams) will keep running after the
  client gives up. The LLM might retry and Fulcrum happily does
  the work twice.
- **Impact**: Wasted compute; possible double-mutation on retries
  of non-idempotent tools (`create_task`, `invoke_team`).
- **Fix direction**: Track in-flight requests by id; on
  `notifications/cancelled`, set an AbortController per request and
  pass the signal into `@moabualruz/fulcrum-core` calls that accept one. Core
  functions need the corresponding abort plumbing.

### [F1-HIGH-12] No progress notifications on long-running tools

- **Standard**: R1 §9 Progress ("Requests opt in by including a
  `progressToken` in `_meta` ... `progress` MUST be monotonically
  increasing"). R1 §14.2 S-7, S-8.
- **Current state**: The `params._meta` field is never read
  (`packages/cli/src/index.ts:1187-1188` — only `params.name` and
  `params.arguments` are extracted). No progress notification is ever
  emitted.
- **Gap**: `build_cos_context` (multi-table aggregation),
  `recall_memory` (embedding lookup + rerank), `invoke_team` (team
  spawn), and anything that touches the janitor / worker paths could
  benefit. Clients get no feedback during these operations.
- **Impact**: UX + premature client timeouts. Real MCP clients
  enforce request timeouts (R1 §3 Timeouts) and may "reset the
  timeout clock when receiving a progress notification" — Fulcrum
  loses this extension because it sends none.
- **Fix direction**: Read `params._meta.progressToken`; in tools
  whose handlers can report progress, emit
  `notifications/progress` with `{progressToken, progress, total?,
  message?}`.

### [F1-HIGH-13] No rate limiting on tool invocations

- **Standard**: R1 §4.1 ("Required server security behaviors (MUST):
  ... Rate-limit tool invocations"). R1 §14.1 M-62.
- **Current state**: No rate limiting anywhere in
  `packages/cli/src/index.ts:911-1141`. Every `tools/call` is
  unconditionally dispatched. A pathological client could spam
  `create_task` / `start_agent_run` / `write_memory` and saturate
  SQLite + the embedding queue.
- **Gap**: Spec-level MUST violated. The core layer does have some
  budget controls (memory token budget, etc.) but not tool-call-rate
  controls.
- **Impact**: DoS potential; OTel span spam; embedding-queue
  starvation for legitimate requests.
- **Fix direction**: Token-bucket per tool (or global), returning
  `isError: true` with `text: "rate limited; retry after N seconds"`
  when exhausted.

---

## Findings — MEDIUM

### [F1-MED-1] No per-tool `title` (human-readable display name)

- **Standard**: R1 §4.1 ("`title` — optional human-readable name for
  display (introduced in `2025-06-18`) ... `title` field for
  human-friendly display names, so that `name` can be used as a
  programmatic identifier"). R1 §14.2 S-2.
- **Current state**: None of the 18 tool descriptors have a `title`
  field. Example at `packages/cli/src/index.ts:642-658` — only
  `name`, `description`, `inputSchema`.
- **Gap**: Hosts display `create_team_template` verbatim. A `title:
  "Create Team Template"` would render cleaner in tool pickers.
- **Impact**: Polish.
- **Fix direction**: Add `title` to every descriptor in the same
  pass as F1-HIGH-1 annotations.

### [F1-MED-2] Core-layer exceptions leak as opaque strings

- **Standard**: R1 §14.2 S-18 ("Error objects include `data` with
  useful context (URIs, tool names)"). R1 §13 rule 9 (tool execution
  errors should "enable model self-correction").
- **Current state**: `packages/cli/src/index.ts:1211`:
  ```ts
  respond(id, {
    content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message }) }],
    isError: true,
  })
  ```
  Only `err.message` is captured. There is no `err.code`, no
  `err.cause`, no hint at which field caused the problem, no
  suggested fix. Type casts in handlers (`a['task_id'] as string`)
  mean the underlying error is often something like `"Cannot read
  properties of undefined"` rather than "missing required field:
  `task_id`".
- **Gap**: Errors are not actionable by the LLM.
- **Impact**: The LLM will retry blindly instead of self-correcting.
  Retry storms on deterministic failures.
- **Fix direction**: Normalize core errors into `{code, message,
  field?, hint?}` shapes, include the tool name, and structure the
  `text` content as JSON so the LLM can parse it.

### [F1-MED-3] No pagination on `tools/list`, `list_tasks`, etc.

- **Standard**: R1 §9 Pagination ("Operations that support
  pagination: `resources/list`, `resources/templates/list`,
  `prompts/list`, `tools/list` ... Cursors are **opaque** strings
  chosen by the server"). R1 §14.2 S-11.
- **Current state**: `packages/cli/src/index.ts:1182` returns the
  entire tool array on every `tools/list` call. `list_tasks` handler
  (line 914) slices to `limit ?? 40` but there is no `nextCursor` —
  clients that want task 41-80 have no way to get them.
  `list_team_templates` and `list_team_instances` take
  `limit`/`offset` in the arguments (not MCP cursors).
- **Gap**: 18 tools fits in a single `tools/list` response today,
  but any tool that grows its catalog (team templates, agent
  profiles) has no cursor story. Also not spec-aligned — MCP uses
  opaque cursors, not limit/offset.
- **Impact**: Scales poorly past ~100 items in any list tool.
- **Fix direction**: For `tools/list`, accept pagination. For
  list-* tools, switch to `{cursor, nextCursor}` semantics or
  expose as paginated resources (tied to F1-CRIT-4).

### [F1-MED-4] `create_task` is not marked idempotent but deliberately uses `ensureWorkspace/ensureProject`

- **Standard**: R1 §13 rule 10 ("Idempotency matters: tools that
  LLMs are likely to retry should be idempotent where possible. Use
  `idempotentHint: true` to signal it."). R1 §10.3 Memory server
  lesson: "Silent idempotency prevents the LLM from getting stuck
  in retry loops".
- **Current state**: `create_task` (line 933) calls `createTask`
  which inserts a new row on every call — no dedupe on title or
  content hash. Two retries create two tasks. `invoke_team`,
  `write_memory`, `start_agent_run` have the same profile.
- **Gap**: Neither `annotations.idempotentHint` nor server-side
  dedupe. The LLM will sometimes duplicate tasks when the network
  flakes between `create_task` request and response.
- **Impact**: Duplicate tasks, duplicate memories, duplicate agent
  runs. User has to clean up manually.
- **Fix direction**: Either mark idempotent and implement
  content-hash dedupe server-side, or add an explicit
  `client_request_id` field that the handler uses for dedupe keys.

### [F1-MED-5] No preview / `dryRun` mode on destructive tools

- **Standard**: R1 §13 rule 12 ("Make destructive operations
  previewable. The filesystem server's `edit_file` with `dryRun:
  true` is the model."). R1 §14.2 S-6.
- **Current state**: `invoke_team`, `create_team_template`,
  `create_agent_profile`, `create_task`, `write_memory` all apply
  changes unconditionally.
- **Gap**: `invoke_team` is the most destructive tool Fulcrum has —
  it spawns an entire team with budget and quality classes. A
  `dryRun: true` preview that returns the resolved slots + policy
  without instantiating would be high-value.
- **Impact**: Mistaken team invocations cost real agent runs and
  clutter the workspace.
- **Fix direction**: Add optional `dry_run: boolean` (default
  false) to mutating tools and return the planned-but-not-applied
  change set.

### [F1-MED-6] `workspace_id` / `project_id` are repeated on every tool call with no server-side default

- **Standard**: R1 §10.2 Git server pattern: "every tool takes
  `repo_path` as its first argument. Additional per-tool arguments
  are primitive or primitive arrays ... Prefer stateless tool calls
  where feasible". R1 §5.2 roots as sandbox.
- **Current state**: Every Fulcrum tool that touches state takes
  `workspace_id` and often `project_id` (e.g. line 633-640, 674-685,
  781-795, etc.). The same IDs are in `.fulcrum.json` /
  `ensureProjectInitialized` but the MCP layer doesn't expose them.
  The LLM has to re-pass these on every single call.
- **Gap**: Two options exist. (a) R1 §5.2 `roots`: let the client
  advertise the filesystem root and have Fulcrum derive the
  workspace/project from `cwd.sha256.slice(12)` automatically.
  (b) Expose workspace resolution via a server-initiated
  `elicitation/create` on first call when IDs aren't provided.
  (c) Resolve from `roots` and fall back to elicitation.
- **Impact**: Token overhead per call; LLM occasionally mis-copies
  IDs between tools.
- **Fix direction**: Implement `roots/list` consumption: when the
  client provides roots, resolve the workspace/project from the
  root path the same way `ensureProjectInitialized` does. Make
  `workspace_id`/`project_id` optional at the MCP layer when roots
  are present.

### [F1-MED-7] No consumption of client `roots` at all

- **Standard**: R1 §5.2 Roots ("The roots protocol is a sandbox
  advertisement: the host tells the server 'these are the
  directories I'll accept operations on'"). R1 §13 rule 13 ("Use
  `roots` instead of command-line args when the client supports
  it"). R1 §14.3 (MAY, but strongly recommended by reference
  servers).
- **Current state**: `packages/cli/src/index.ts` never calls
  `server.request({method: 'roots/list'})` and never declares in
  its `initialize` response that it would use roots. The server
  resolves `workspace_id` / `project_id` solely from `$CWD` — which
  on stdio is the cwd the client launched the server with, a
  reasonable default that still misses the point.
- **Gap**: (a) Multi-root workspaces (VS Code) have no way to tell
  Fulcrum "operate on root A or root B"; the server sees only its
  own cwd. (b) Clients that don't change cwd before spawning can't
  switch the Fulcrum workspace without re-launching the server.
- **Impact**: Blocks multi-project / multi-workspace deployments
  from one Fulcrum instance.
- **Fix direction**: On `initialize`, if the client declares
  `roots`, call `roots/list`, keep the list, and scope every
  subsequent call to whichever root matches. Emit a tool-execution
  error if a call targets an ID outside the advertised roots.

### [F1-MED-8] Tool descriptions are thin and implementation-flavored

- **Standard**: R1 §4.1 ("Descriptions are model-facing: the LLM
  sees both the top-level `description` and the per-property
  `description`. Quality matters more than brevity — short, clear,
  unambiguous"). R1 §13 rule 5 ("Tool descriptions: describe the
  tool's effect, not its implementation. Mention required
  preconditions and what the tool returns.").
- **Current state**: Examples:
  - `create_task`: "Create a new task in the project." — doesn't
    mention workspace, doesn't mention what's returned, doesn't say
    what `done_criteria` means.
  - `update_task`: "Update a task's status, note, or assignment."
    — doesn't mention that only the provided fields change; doesn't
    describe the valid status values.
  - `recall_memory`: "Recall relevant memories from the project
    memory store by semantic query." — "semantic query" is
    implementation-flavored; doesn't tell the LLM what format the
    results are in.
  - `build_cos_context`: "Build a world-state snapshot for the Chief
    of Staff system prompt." — references an internal concept (CoS)
    the LLM may not know without the agent-integration CLAUDE.md
    pre-loaded.
  - `invoke_team`: "Only chief_of_staff may invoke teams (enforced
    by canInvokeTeams)." — names an internal function.
- **Gap**: Prompt-engineering quality. The LLM has to infer what
  most tools return, when to call them, what their preconditions
  are.
- **Impact**: Tool-choice errors; unnecessary retries; wrong
  parameter shapes.
- **Fix direction**: Rewrite every description as
  effect-first + returns + precondition. Treat descriptions as
  prompts.

### [F1-MED-9] No secret redaction in error paths

- **Standard**: R1 §4.4 ("Log messages MUST NOT contain credentials
  or secrets"). R1 §14.1 M-51.
- **Current state**: `(err as Error).message` at
  `packages/cli/src/index.ts:1211` is returned verbatim in the tool
  response. If core throws an exception that includes a DB path, a
  DSN, or an env var value, it goes straight to the client.
- **Gap**: The hook pipeline has a secret scanner
  (`checkSecrets`, `index.ts:373`) but the MCP error path does not.
- **Impact**: Potential secret leakage in error content.
- **Fix direction**: Route the error message through the same
  secret scanner used for hook tool inputs.

### [F1-MED-10] `tools/call` span lacks `parent_span_id` correlation with agent runs

- **Standard**: R1 §13 rule 24 (observability hygiene — not a MUST
  but a widely-adopted pattern).
- **Current state**: `packages/cli/src/index.ts:1191-1195`
  creates `mcp.tool` spans without a `parent_span_id`. Meanwhile
  `start_agent_run` creates a separate `agent_run` span in core.
  The two are not linked.
- **Gap**: Telemetry can't join "which MCP tool calls happened
  during agent run X?" without correlating timestamps.
- **Impact**: Debugging and observability. Not a conformance issue.
- **Fix direction**: Pass the current run_id (if known from a prior
  `start_agent_run` in the same session) as a `parent_span_id`.

---

## Findings — LOW

### [F1-LOW-1] Hard-coded `serverInfo.version = '1.0.0'`

- **Standard**: R1 §3 example `initialize` response; §14.1 M-8
  (`serverInfo: {name, version}` MUST). The spec accepts any string
  but R1 §13 rule 20 ("Version your tool schemas explicitly")
  implies the version should mean something.
- **Current state**: `packages/cli/src/index.ts:1171`:
  ```ts
  serverInfo: { name: 'fulcrum', version: '1.0.0' },
  ```
  The real package version is `0.0.1` in `packages/cli/package.json:3`.
- **Gap**: Lying about version. Always `1.0.0` regardless of
  actual build.
- **Impact**: Debugging — "which version of Fulcrum am I talking
  to?" is unanswerable from the client side.
- **Fix direction**: Import version from `package.json` at build
  time or read from disk.

### [F1-LOW-2] No `instructions` field on `initialize` response

- **Standard**: R1 §3 example: `initialize` response MAY include
  `instructions` — "Optional instructions for the client". This is
  the canonical place to put "here's what this server does and how
  to use it".
- **Current state**: `packages/cli/src/index.ts:1168-1172` omits
  `instructions` entirely.
- **Gap**: The `agent-integration/claude/CLAUDE.md` document exists
  precisely to tell the LLM how to use Fulcrum — all ~200 lines of
  it. That's `instructions` content living outside the MCP channel.
- **Impact**: Clients that don't load CLAUDE.md get no orientation
  at all.
- **Fix direction**: Put a concise version of
  `agent-integration/claude/CLAUDE.md` in the `instructions` field.

### [F1-LOW-3] `JSON.parse` line-handling silently drops malformed frames

- **Standard**: R1 §2.1 (stdio framing — "Messages are delimited
  by newlines"). R1 §4.1 error modalities. JSON-RPC 2.0 §5
  ("Parse error" = `-32700`).
- **Current state**: `packages/cli/src/index.ts:1159-1163`:
  ```ts
  try { msg = JSON.parse(line) as typeof msg }
  catch { return /* Ignore parse errors */ }
  ```
  A malformed frame silently vanishes.
- **Gap**: A compliant server replies `{error: {code: -32700,
  message: "Parse error"}}` with `id: null`.
- **Impact**: Clients debugging malformed requests get no response
  at all and time out.
- **Fix direction**: Respond with `-32700` + `null` id on parse
  failure.

### [F1-LOW-4] No validation of the top-level `jsonrpc` field

- **Standard**: R1 §14.1 M-1 ("All messages are valid JSON-RPC 2.0
  with `jsonrpc: "2.0"` field").
- **Current state**: The handler at `index.ts:1165` destructures
  `{method, params, id}` without checking `msg.jsonrpc === '2.0'`.
  A client could send `{"jsonrpc": "1.0", ...}` and Fulcrum would
  happily process it.
- **Gap**: Conformance pedantry, but a MUST.
- **Impact**: Minimal.
- **Fix direction**: Validate `msg.jsonrpc === '2.0'` and reply
  `-32600` "Invalid Request" otherwise.

### [F1-LOW-5] `id` uniqueness is not enforced

- **Standard**: R1 §9 ("The request ID MUST NOT have been
  previously used by the requestor within the same session"). R1
  §14.1 M-2.
- **Current state**: No `seenIds: Set<string|number>` tracked
  anywhere in `runServeMcp`. Duplicate IDs are processed normally.
- **Gap**: Spec MUST violation on the request side. (On the server
  side this is about validation; the server doesn't *generate*
  duplicate IDs.)
- **Impact**: A confused client can confuse itself; unlikely to
  affect real users.
- **Fix direction**: Track a Set<RequestId>; on collision, reply
  `-32600` "duplicate request id".

### [F1-LOW-6] Readme / usage string says "13 control tools" while code has 18

- **Standard**: R1 §12 (documentation consistency).
- **Current state**: `packages/cli/src/index.ts:23` and line 2134:
  ```
  serve mcp            Start MCP server (stdio JSON-RPC 2.0) — 13 control tools
  ```
  C1 inventory flags this: "the usage text and README still say
  '13 control tools' — that string is stale after L-5".
- **Gap**: Documentation drift.
- **Impact**: Confusion for users reading `fulcrum --help`.
- **Fix direction**: Change to "18 tools" or derive dynamically
  (`${tools.length} tools`).

### [F1-LOW-7] The init-banner on line 1155 is written after `runServeMcp` starts listening on stdin

- **Standard**: R1 §2.1 (stderr for logs), §13 rule 17. Not
  technically a bug — stderr is fine — but the banner arrives
  *after* the rl listener is attached, which means a very fast
  client could theoretically send `initialize` before the stderr
  banner lands. Only a cosmetic concern.
- **Current state**: `index.ts:1145-1155`:
  ```ts
  const rl = createInterface({ input: process.stdin, terminal: false })
  function respond(...) {...}
  function respondError(...) {...}
  process.stderr.write('[fulcrum mcp] fulcrum MCP server started (stdio)\n')
  rl.on('line', async (line: string) => { ... })
  ```
- **Gap**: Negligible. If reordered, emit banner first.
- **Impact**: Cosmetic.
- **Fix direction**: Move banner before `createInterface`.

### [F1-LOW-8] No `icons` metadata on tools

- **Standard**: R1 §1 (2025-11-25 changelog: "Icons metadata
  (SEP-973) — tools/resources/prompts can carry display icons").
  R1 §4.1, §14.3 Y-4.
- **Current state**: Not implemented.
- **Gap**: Hosts that render tool pickers with icons (future
  Claude Desktop, VS Code Copilot) have no Fulcrum branding.
- **Impact**: Branding / polish.
- **Fix direction**: Publish `icons: [{src, sizes, mimeType}]`
  once version upgraded.

### [F1-LOW-9] Tool-call failures are not categorized

- **Standard**: R1 §13 rule 9 (tool errors should "enable model
  self-correction").
- **Current state**: Every failure becomes a flat
  `{error: msg}` JSON string. The LLM can't distinguish "missing
  required field" from "database locked" from "unknown
  workspace_id" from "internal rerank failure".
- **Gap**: Tool errors should at minimum carry a `kind` /
  `category` enum.
- **Impact**: Retry heuristics suffer.
- **Fix direction**: Introduce a `FulcrumToolError` class with
  `kind: 'validation' | 'not_found' | 'conflict' | 'upstream' |
  'internal'`, surface the kind in the returned text.

---

## Findings — INFORMATIONAL

### [F1-INFO-1] `.mcp.json` uses absolute command name `fulcrum` (relies on PATH)

- **Current state**: `agent-integration/claude/.mcp.json`:
  ```json
  { "mcpServers": { "fulcrum": { "command": "fulcrum", "args": ["serve", "mcp"] } } }
  ```
  This assumes `fulcrum` is on the user's PATH (installed via
  `pnpm setup:claude` per C1 inventory line 935).
- **Gap**: Not a conformance issue; reference servers use
  absolute paths (`npx @modelcontextprotocol/server-filesystem`)
  or explicit commands. Fulcrum's choice is fine for local
  installs but fragile for portable / container use.
- **Fix direction**: Document the PATH requirement in README or
  expose `command: "npx", args: ["-y", "fulcrum", "serve", "mcp"]`
  once Fulcrum is on npm.

### [F1-INFO-2] Tool registry is a module-local array, not introspectable from outside the process

- **Standard**: Audit-prompt rule 12 ("Is there a way for a
  client to dump Fulcrum's tool catalog outside of a live MCP
  connection?").
- **Current state**: The `tools` array at `index.ts:627-907` is
  a local `const` inside the async function. The only way to see
  it is to spawn the server and call `tools/list`.
- **Gap**: CI / docs / `fulcrum mcp tools --json` would be
  useful.
- **Fix direction**: Extract tool catalog into
  `packages/cli/src/mcp/tools.ts` and add a
  `fulcrum mcp tools [--json]` CLI command.

### [F1-INFO-3] No distinction between `_meta` reserved prefixes

- **Standard**: R1 §13 rule 21 ("Don't ship `_meta` reserved
  prefixes. `modelcontextprotocol.*`, `mcp.*`, and `*.mcp.*` are
  all reserved for protocol use").
- **Current state**: Fulcrum doesn't use `_meta` at all, so this
  is moot — noted for when F1-HIGH-12 (progress) lands.

### [F1-INFO-4] No sampling support (server → client LLM calls)

- **Standard**: R1 §5.1 sampling. R1 §14.3 Y-7 (Y-MAY).
- **Current state**: Not implemented; not advertised; not
  required. Informational only.
- **Gap**: Fulcrum doesn't currently need to call the host's
  LLM — it has no reason for server-initiated completions. But
  `build_cos_context` could plausibly want to ask the host to
  summarize a long field, which would be the textbook sampling
  case.
- **Fix direction**: Revisit if/when Fulcrum wants nested
  agentic behavior.

### [F1-INFO-5] `elicitation` unused; several tools would benefit

- **Standard**: R1 §5.3 elicitation. R1 §14.3 Y-6.
- **Current state**: Not advertised/consumed.
- **Gap**: Good candidates for elicitation: confirming
  `invoke_team` before it spawns (user-approval flow),
  confirming `block_agent_run` when a reason is terse,
  asking the user to pick a workspace when roots don't
  disambiguate. All would be `2025-06-18`+ features.
- **Fix direction**: Future work, tied to F1-CRIT-1 version bump.

### [F1-INFO-6] `mcp.tool` telemetry payload excludes tool arguments entirely

- **Current state**: `packages/cli/src/index.ts:1194`:
  ```ts
  payload: { tool_name: toolName, request_id: String(id ?? '') }
  ```
  No arg keys, no arg hashes.
- **Gap**: Intentional (privacy) but prevents per-tool usage
  analytics. Hook pipeline logs `tool_input_keys` (keys only)
  as a middle ground; MCP spans could mirror that.
- **Fix direction**: Log `arg_keys: Object.keys(toolArgs)` —
  matches the hook-layer convention.

### [F1-INFO-7] `create_team_template.slots` accepts nested object arrays

- **Standard**: R1 §6 ("Nested objects: permitted (and common)
  for tool inputs. Not permitted for elicitation schemas. oneOf
  / anyOf / allOf / const: permitted, though LLM-driven clients
  often struggle with highly-disjunctive schemas. Prefer flat
  parameter lists with clear descriptions.").
- **Current state**: `index.ts:813-830` defines a deeply nested
  array of slot objects with 8 required sub-fields each. This is
  permitted, but LLMs frequently miss required sub-fields.
- **Gap**: Nested objects are technically legal but increase
  the error rate.
- **Fix direction**: Consider flattening with a repeating
  primitive shape (e.g. slot definitions as JSON strings) or
  providing a `build_team_template_slot` helper tool.

### [F1-INFO-8] `recall_memory` returns `score: 0.0` hardcoded

- **Current state**: `packages/cli/src/index.ts:965`:
  ```ts
  return memories.map(m => ({ content: m.content.slice(0, 500), score: 0.0, tags: m.tags }))
  ```
  The score field is returned as a literal zero — the real
  rerank score is discarded.
- **Gap**: LLM has no way to prioritize which memory matters.
  Content is also truncated to 500 chars with no way to
  request more.
- **Fix direction**: Plumb the rerank score through, add a
  `max_chars` / pagination argument.

---

## Issues to plan (feeds Step 4)

Flat list with stable IDs. Each becomes its own spec + plan file.

- F1-ISSUE-01: Bump advertised `protocolVersion` and implement version negotiation → `docs/audit/plans/f1-01-protocol-version-negotiation.md`
- F1-ISSUE-02: Rebuild MCP server on top of `@modelcontextprotocol/sdk` (McpServer + StdioServerTransport) → `docs/audit/plans/f1-02-sdk-migration.md`
- F1-ISSUE-03: Schema-based input validation with structured error responses → `docs/audit/plans/f1-03-input-validation.md`
- F1-ISSUE-04: Expose workspace/project/task/memory/run/team as MCP resources → `docs/audit/plans/f1-04-resources-capability.md`
- F1-ISSUE-05: Initialization state machine; pre-init gating; `ping` allowlist → `docs/audit/plans/f1-05-init-state-machine.md`
- F1-ISSUE-06: Clean shutdown on stdin close + SIGTERM/SIGINT → `docs/audit/plans/f1-06-clean-shutdown.md`
- F1-ISSUE-07: End-to-end MCP protocol conformance test suite → `docs/audit/plans/f1-07-protocol-tests.md`
- F1-ISSUE-08: Tool annotations (readOnly/destructive/idempotent/openWorld) + titles → `docs/audit/plans/f1-08-tool-annotations.md`
- F1-ISSUE-09: `additionalProperties: false` on all tool schemas → `docs/audit/plans/f1-09-strict-schemas.md`
- F1-ISSUE-10: `outputSchema` + `structuredContent` for read tools → `docs/audit/plans/f1-10-structured-output.md`
- F1-ISSUE-11: `prompts` capability — expose `build_cos_context` as a prompt → `docs/audit/plans/f1-11-prompts-capability.md`
- F1-ISSUE-12: `tools/list_changed` emission when agent profiles / templates mutate → `docs/audit/plans/f1-12-list-changed.md`
- F1-ISSUE-13: `logging` capability + `logging/setLevel` + `notifications/message` → `docs/audit/plans/f1-13-logging-capability.md`
- F1-ISSUE-14: `completions` capability for IDs + roles → `docs/audit/plans/f1-14-completions.md`
- F1-ISSUE-15: Streamable HTTP transport (alongside stdio) → `docs/audit/plans/f1-15-http-transport.md`
- F1-ISSUE-16: OAuth 2.1 for HTTP transport → `docs/audit/plans/f1-16-oauth.md`
- F1-ISSUE-17: `notifications/cancelled` handling + AbortController plumbing → `docs/audit/plans/f1-17-cancellation.md`
- F1-ISSUE-18: Progress notifications via `_meta.progressToken` → `docs/audit/plans/f1-18-progress.md`
- F1-ISSUE-19: Per-tool rate limiting → `docs/audit/plans/f1-19-rate-limiting.md`
- F1-ISSUE-20: Structured tool errors (kind/field/hint) with secret redaction → `docs/audit/plans/f1-20-structured-errors.md`
- F1-ISSUE-21: Pagination (opaque cursors) for list tools → `docs/audit/plans/f1-21-pagination.md`
- F1-ISSUE-22: `dryRun` preview for destructive tools (esp. `invoke_team`) → `docs/audit/plans/f1-22-dry-run.md`
- F1-ISSUE-23: Server-side idempotency keys + `idempotentHint` annotations → `docs/audit/plans/f1-23-idempotency.md`
- F1-ISSUE-24: Rewrite tool descriptions as effect + returns + precondition prose → `docs/audit/plans/f1-24-descriptions.md`
- F1-ISSUE-25: Consume client `roots`; resolve workspace/project from roots → `docs/audit/plans/f1-25-roots.md`
- F1-ISSUE-26: Correct `serverInfo.version`; populate `instructions` field → `docs/audit/plans/f1-26-serverinfo-instructions.md`
- F1-ISSUE-27: Handle `-32700` parse errors and `-32600` invalid-request explicitly → `docs/audit/plans/f1-27-jsonrpc-error-codes.md`
- F1-ISSUE-28: Request-id uniqueness tracking → `docs/audit/plans/f1-28-request-id-uniqueness.md`
- F1-ISSUE-29: Fix "13 tools" stale copy in help text → `docs/audit/plans/f1-29-help-text.md`
- F1-ISSUE-30: Extract tool catalogue to its own module; add `fulcrum mcp tools` command → `docs/audit/plans/f1-30-tools-introspection.md`
- F1-ISSUE-31: `mcp.tool` span correlation with `agent_run` spans → `docs/audit/plans/f1-31-span-correlation.md`
- F1-ISSUE-32: Secret-scan tool error payloads before returning to client → `docs/audit/plans/f1-32-error-secret-redaction.md`
- F1-ISSUE-33: `recall_memory` — return real rerank scores and add `max_chars` → `docs/audit/plans/f1-33-recall-memory-score.md`

(Most of these collapse into one or two work orders once F1-ISSUE-02 — the SDK
migration — lands. See below.)

---

## Rebuild vs retrofit decision

**Recommendation: rebuild, on top of `@modelcontextprotocol/sdk`.**

**Reasoning.**

1. **The number of gaps is structural, not cosmetic.** Of the 41 findings
   listed, 8 are CRITICAL and 13 are HIGH. Every critical finding except
   F1-CRIT-3 (validation) and F1-CRIT-8 (tests) would be a single line of
   SDK-provided default behavior under `McpServer`. Fulcrum is
   reimplementing — badly — what the SDK already does correctly.
2. **Hand-rolling means bit-rot.** The spec moved from `2024-11-05` to
   `2025-11-25` over 12 months while Fulcrum sat at `2024-11-05`. The
   moment someone adds a new R1 feature to Fulcrum manually, it will
   drift again. The SDK absorbs upstream changes in a `pnpm update`.
3. **The tool registry itself is reusable.** The 18-tool handler set
   (`handleToolCall`) is shaped like any SDK user's code — it takes
   a name + args, returns an object. Lifting that into
   `server.registerTool(name, {inputSchema, outputSchema, annotations,
   title, description}, handler)` is mechanical, not conceptual.
4. **The tests that don't exist** (F1-CRIT-8) should only ever be
   written *once*, against the SDK's protocol behavior, so we don't
   own the conformance matrix.
5. **The HTTP transport case** (F1-HIGH-9) is the lock-in: without the
   SDK, Fulcrum has to implement Streamable HTTP + OAuth 2.1 + session
   management + SSE framing by hand. That is weeks of work. With the
   SDK, it's `new StreamableHTTPServerTransport()` wired into a Hono
   route and the OAuth is middleware.
6. **Cost estimate.** Rewrite of `runServeMcp` on top of the SDK is
   ~200 LOC against ~85 LOC of custom loop plus ~280 LOC of tool
   descriptors (which stay). Net code likely *shrinks* because the SDK
   erases boilerplate.

**Sequencing.**

1. **Phase 1 (blocker-clearing).** Land F1-ISSUE-02 (SDK migration) +
   F1-ISSUE-01 (protocol version) + F1-ISSUE-05 (init state machine) +
   F1-ISSUE-06 (shutdown) + F1-ISSUE-07 (tests). This is the "fix the
   foundation" phase. Ship behind a feature flag or in a branch; run
   Fulcrum against the MCP Inspector before merging.
2. **Phase 2 (semantic correctness).** F1-ISSUE-03, -08, -09, -10, -20,
   -24. All of these are tool-descriptor pass rewrites with validation
   plumbing. Do them in one PR per related cluster.
3. **Phase 3 (capability expansion).** F1-ISSUE-04 (resources),
   F1-ISSUE-11 (prompts), F1-ISSUE-13 (logging), F1-ISSUE-14
   (completions). These unlock client features that aren't available
   today.
4. **Phase 4 (scale).** F1-ISSUE-15 (HTTP transport) + F1-ISSUE-16
   (OAuth) + F1-ISSUE-19 (rate limiting) + F1-ISSUE-17
   (cancellation) + F1-ISSUE-18 (progress). These turn Fulcrum from a
   local dev tool into something runnable as a team service.
5. **Phase 5 (polish).** Everything else. Mostly low/info findings.

**Non-goals for the rebuild.**

- Don't change Fulcrum's core behavior or data model.
- Don't rename public tool names — those are in client configs.
- Don't break the `agent-integration/claude/.mcp.json` contract.
- Don't touch the monitor HTTP API unless it's intentionally lifted
  into the MCP Streamable HTTP transport as part of F1-ISSUE-15.

**What rebuilding does NOT fix on its own.**

- Input validation (F1-CRIT-3) still requires writing Zod schemas.
- Tool annotations (F1-HIGH-1) and titles (F1-MED-1) require
  classification work per tool.
- Resources (F1-CRIT-4) and prompts (F1-HIGH-4) require defining a
  URI scheme and identifying which of the existing tools are actually
  resources/prompts in disguise.
- Tests (F1-CRIT-8) still have to be written even with the SDK.

The SDK removes the protocol plumbing as a concern. The *semantic*
work described in the rest of this audit — saying what Fulcrum's
tools actually are, what they return, how they fail, what
capabilities they expose — is unavoidable regardless of the
implementation strategy.

---

**Audit scope complete. 48 findings — 8 critical, 13 high, 10 medium,
9 low, 8 informational. Feeds 33 discrete issue IDs into Step 4 planning.
The single highest-leverage change is F1-ISSUE-02 (SDK migration); every
other finding either depends on it, is collapsed by it, or is unblocked
after it lands.**
