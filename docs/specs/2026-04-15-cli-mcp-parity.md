# Spec: CLI-First Architecture with Smart MCP Filtering

**Date:** 2026-04-15
**Status:** Implemented — 2026-04-16 (all 8 phases complete, 203 tests passing)
**Related ideation:** `docs/ideation/2026-04-15-cli-mcp-parity-ideation.md`

---

## Objective

Today, Fulcrum's 23 MCP tool implementations live exclusively inside a `handleToolCall` closure nested inside `runServeMcp()`. They cannot be called from hooks, shell scripts, CI, or CLI commands without spawning a full MCP server. Hooks duplicate logic. The HTTP server duplicates the entire handler. Tests require a live stdio server.

This spec defines a phased migration to a **CLI-first tool architecture** where:

1. Every tool implementation lives once in a shared registry
2. Every tool is callable as `fulcrum tool exec <name>` from any context
3. MCP serves an intelligently filtered subset based on role or hook coverage
4. `workspace_id`/`project_id` are optional everywhere, resolved server-side by default
5. Read tools are properly annotated so hosts can cache and batch them

**Non-goals:**
- Removing MCP support — it stays, just with a filtered surface
- Hooks intercepting and returning MCP tool results (not possible in Claude Code's protocol model — hooks approve/deny/inject context; MCP handles execution)
- DI frameworks or decorators — a plain `deps` context object is sufficient

---

## Tech Stack

- TypeScript (strict), pnpm monorepo
- `@modelcontextprotocol/sdk` 2025-11-25 — already in use
- SQLite (better-sqlite3) via `@moabualruz/fulcrum-core`
- Node.js, no external HTTP dependencies
- Tests: vitest

## Commands

```
Build:    pnpm build
Test:     pnpm test
Lint:     pnpm lint
Typecheck: pnpm typecheck
Dev:      tsx packages/cli/src/index.ts
```

---

## Architecture: Unified Handler Registry

The core structural change is extracting tool handlers from the `handleToolCall` closure into a standalone module: `packages/cli/src/tool-registry.ts`.

### Handler interface

```typescript
// packages/cli/src/tool-registry.ts

export interface HandlerDeps {
  db: Database           // resolved once at startup via getDb()
  workspace_id: string   // resolved from currentProjectIds() at startup
  project_id: string     // resolved from currentProjectIds() at startup
}

export interface ToolCapabilities {
  readOnly: boolean          // never writes persistent state
  destructive: boolean       // hard to reverse
  hookEquivalent: boolean    // this tool is already called from hooks; default to CLI in MCP
  minRole?: string           // minimum AgentRole slug required (if null = any)
}

export interface RegistryEntry {
  schema: ToolSchema                                      // from mcp-tools.ts
  capabilities: ToolCapabilities
  handler: (args: Record<string, unknown>, deps: HandlerDeps) => Promise<unknown>
}

export const TOOL_REGISTRY: Map<string, RegistryEntry>
```

### Default resolution

Every handler that previously required `workspace_id`/`project_id` as mandatory arguments now resolves them from `deps` when the caller omits them:

```typescript
const ws = (args.workspace_id as string | undefined) ?? deps.workspace_id
const proj = (args.project_id as string | undefined) ?? deps.project_id
```

No env vars, no cross-process coordination, no session file reads. `currentProjectIds()` is called once at server startup and stored in `deps`.

### MCP server change

`runServeMcp()` builds a `HandlerDeps` once, then passes a thin adapter:

```typescript
const deps = buildDeps()  // calls getDb(), currentProjectIds()
const handleToolCall = (name, args) =>
  TOOL_REGISTRY.get(name)!.handler(args, deps)
```

### CLI commands

Every existing CLI command (`task list`, `task create`, etc.) calls the same registry entry:

```typescript
// fulcrum task list → 
const deps = buildDeps()
const result = await TOOL_REGISTRY.get('list_tasks')!.handler({ workspace_id, project_id, status }, deps)
```

---

## Project Structure Changes

```
packages/cli/src/
  tool-registry.ts      ← NEW: all 23 handlers + capability annotations + ToolRegistry map
  mcp-tools.ts          ← UNCHANGED: schema definitions (ToolSchema[])
  mcp-server.ts         ← MODIFIED: imports from tool-registry, no inline handlers
  index.ts              ← MODIFIED: CLI commands call tool-registry; handleToolCall removed
  tests/
    tool-registry.test.ts   ← NEW: unit tests for each handler
    tool-exec.test.ts       ← NEW: integration tests for `fulcrum tool exec`
```

---

## Phases

Each phase is independently shippable. Later phases depend on earlier ones.

---

### Phase 0: Prerequisites (not in this spec — must land first)

Before any phase below, two bugs must be patched as separate PRs:

**P0-A: CORE-001** — `workspace_id='default'` vs `'global'` mismatch
- File: `packages/core/src/agent-definitions.ts`
- Fix: normalize `'default'` → `'global'` at the DB query boundary, or change seed migrations
- Without this: `getAgentDefinition()` returns null for all 24 built-in roles; Phase 4 and 5 silently degrade

**P0-B: Optional workspace params in mcp-tools.ts**
- Remove `'workspace_id'` from `required[]` on tools that can resolve it from context
- Affects: `list_tasks`, `recall_memory`, `write_memory`, `build_cos_context`, `get_workspace_status`, `heartbeat_agent_run`, `complete_agent_run`, `block_agent_run`, `start_agent_run`
- Server-side default: `currentProjectIds().workspace_id`
- Without this: token waste; every call explicitly repeats what the server already knows

---

### Phase 1: readOnlyHint Auto-Injection

**What:** In `mcp-server.ts`, any tool already annotated `readOnlyHint: true` in `TOOL_SCHEMAS` gets `idempotentHint: true` automatically if not already set. Add a CI lint check to prevent read-named tools from missing the annotation.

**This is already partially done** — `mcp-tools.ts` shows `readOnlyHint: true` on `list_tasks`, `recall_memory`, `list_agent_profiles`, `get_agent_run_status`, `build_cos_context`, `get_workspace_status`, `list_team_templates`, `list_team_instances`, `get_agent_definition`, `list_agent_definitions`, `get_current_context`. The gap: no CI enforcement that new tools follow the convention.

**Deliverables:**
- `packages/cli/src/tests/mcp-tools-lint.test.ts`: assert that all tools with `list_`/`get_`/`recall_`/`build_` prefix have `readOnlyHint: true`
- Document the naming convention in `AGENTS.md`

**Success criteria:**
- [ ] CI fails if a read-named tool is missing `readOnlyHint`
- [ ] All 23 current tools pass the lint check

**Files touched:** `packages/cli/src/tests/mcp-tools-lint.test.ts` (new), `AGENTS.md`

**Complexity:** Low (1–2 hours)

---

### Phase 2: Unified Handler Registry

**What:** Extract all tool implementations from the `handleToolCall` closure in `runServeMcp()` (and the partial duplicate in `runServeMcpHttp()`) into `packages/cli/src/tool-registry.ts`. Both MCP handlers and CLI commands will call registry entries.

**Key decisions:**

- `HandlerDeps` is a plain object — no injection framework
- All handlers are `async (args, deps) => Promise<unknown>` — same signature
- `buildDeps()` is a top-level export that calls `getDb()` + `currentProjectIds()` once
- The `handleToolCall` function in `runServeMcp()` becomes a 3-line adapter
- `runServeMcpHttp()` no longer duplicates handler logic — it also uses the registry

**Migration strategy:** Extract one tool at a time, running the existing test suite after each. The large `if/else if` chain in `handleToolCall` maps 1:1 to registry entries.

**Deliverables:**
- `packages/cli/src/tool-registry.ts` with all 23 entries
- `packages/cli/src/tests/tool-registry.test.ts` — unit tests per handler with a mock `HandlerDeps`
- Updated `mcp-server.ts` — `handleToolCall` delegates to registry
- Updated `index.ts` — `runServeMcp()` and `runServeMcpHttp()` both use `buildDeps()` + registry; no inline handler logic

**Success criteria:**
- [ ] All existing MCP server tests pass unchanged
- [ ] Each of the 23 handlers has at least one unit test in `tool-registry.test.ts`
- [ ] `runServeMcpHttp()` no longer contains a handler switch/if-chain
- [ ] `index.ts` `handleToolCall` function is deleted

**Files touched:** `tool-registry.ts` (new, ~400 lines), `mcp-server.ts`, `index.ts`, `tests/tool-registry.test.ts` (new)

**Complexity:** Medium (1–2 days)

---

### Phase 3: `fulcrum tool exec` + CLI Parity

**What:** Add a new CLI command group `tool` with two subcommands:

```
fulcrum tool exec <tool-name> [--json <payload>]
fulcrum tool list [--json]
```

`tool exec` invokes a handler from the registry. Payload can be passed as:
- `--json '{"title":"x"}'` — inline JSON string
- stdin (when `--json` is omitted) — reads from stdin pipe
- individual `--<key> <value>` flags for simple string args (optional enhancement, Phase 3b)

Missing `workspace_id`/`project_id` default to `buildDeps()` values (i.e., cwd-derived) — same as Phase 0-B.

Output: always JSON on stdout (uses `--json` mode automatically since this is a machine-readable command).

```bash
# Examples
fulcrum tool exec list_tasks
fulcrum tool exec create_task --json '{"title":"Implement auth","priority":"high"}'
cat payload.json | fulcrum tool exec write_memory
fulcrum tool list  # prints all 23 tool names + descriptions
```

**`fulcrum tool list` output (--json):**
```json
[
  {
    "name": "list_tasks",
    "title": "List Tasks",
    "readOnly": true,
    "hookEquivalent": false
  },
  ...
]
```

**Non-hook platform path:** Gemini CLI, PI, and shell scripts that need Fulcrum operations call `fulcrum tool exec` instead of requiring a live MCP server.

**Deliverables:**
- CLI subcommand `fulcrum tool exec` and `fulcrum tool list` in `index.ts`
- `packages/cli/src/tests/tool-exec.test.ts` — integration tests for the CLI command
- Updated `usage()` in `index.ts`

**Success criteria:**
- [ ] `fulcrum tool exec list_tasks` returns valid JSON matching the MCP tool response shape
- [ ] `fulcrum tool exec create_task --json '{"title":"x"}'` creates a task and returns `{ task_id, status }`
- [ ] `fulcrum tool list --json` returns all 23 tools with correct metadata
- [ ] `workspace_id` and `project_id` are optional — default from cwd
- [ ] Exit code is 1 on tool error, 0 on success

**Files touched:** `index.ts` (new command group), `tests/tool-exec.test.ts` (new)

**Complexity:** Low (after Phase 2)

---

### Phase 4: Capability Manifest

**What:** Add a `capabilities: ToolCapabilities` field to each registry entry in `tool-registry.ts`. This drives MCP filtering (Phase 5) and informs the lint rule (Phase 1 extension).

```typescript
export interface ToolCapabilities {
  readOnly: boolean       // mirrors schema.annotations.readOnlyHint
  destructive: boolean    // true for block_agent_run, invoke_team
  hookEquivalent: boolean // true if hooks already call this tool's logic
  minRole?: string        // 'chief_of_staff' for invoke_team; undefined = any
}
```

**hookEquivalent mapping (initial):**
- `recall_memory` → `true` (called in `runPreHook`)
- `write_memory` → `true` (called in `runPreHook` post phase, `runPreCompactHook`)
- `get_current_context` → `true` (available from `currentProjectIds()` in hook context)
- All others → `false`

**minRole mapping (initial):**
- `invoke_team` → `'chief_of_staff'` (enforced by `canInvokeTeams` policy already)
- All others → undefined

**Deliverables:**
- `ToolCapabilities` interface and annotations on all 23 registry entries in `tool-registry.ts`
- Unit test: `tool-registry.test.ts` — assert all 23 entries have a capabilities object

**Success criteria:**
- [ ] All 23 registry entries have explicit `capabilities` with all 4 fields set
- [ ] `hookEquivalent: true` only for tools that hooks demonstrably call
- [ ] Tests verify the manifest shape

**Files touched:** `tool-registry.ts` (capability annotations), `tests/tool-registry.test.ts`

**Complexity:** Low (annotation work, ~2 hours)

---

### Phase 5: Inverted MCP Filtering

**What:** Add a `--profile <role>` flag to `fulcrum serve mcp` that filters the tool list served to the connecting agent.

Two filtering modes:

**Mode A — `--profile hook-only` (or default for Claude Code)**
- Subtract any tool where `capabilities.hookEquivalent === true`
- Reasoning: Claude Code has hooks that already call these tools' logic; serving them via MCP is redundant token cost
- Result: removes `recall_memory`, `write_memory`, `get_current_context` from the tool list (~3 tools, but the high-frequency ones)

**Mode B — `--profile <agent-role>`**
- Filter to only tools allowed for the role per `agent_definitions.tools_allow` / `tools_deny`
- Requires P0-A (CORE-001 fix) to be effective
- Falls back to full surface if `getAgentDefinition(role)` returns null
- `chief_of_staff` sees all tools; `software_engineer` does not see `invoke_team`; `qa_engineer` does not see `start_agent_run`/`block_agent_run`

**Implementation in `mcp-server.ts`:**

`createFulcrumMcpServer` accepts an optional `filter` function:

```typescript
export interface McpServerOptions {
  // existing fields...
  filter?: (entry: RegistryEntry) => boolean
}
```

`runServeMcp()` in `index.ts` reads `--profile` arg, resolves the filter function, passes it to `createFulcrumMcpServer`. Server only registers tools where `filter(entry)` returns true.

**Deliverables:**
- `filter` option in `McpServerOptions`
- `buildProfileFilter(profile: string, role?: string): (entry: RegistryEntry) => boolean` helper in `tool-registry.ts`
- `--profile <value>` arg parsed in `runServeMcp()`
- `packages/cli/src/tests/mcp-server.test.ts` — test that filtered server only registers allowed tools

**Default behavior:** No `--profile` flag → all 23 tools registered (no change from today)

**Claude Code MCP config recommendation** (document in CLAUDE.md / install.ts):
```json
{
  "mcpServers": {
    "fulcrum": {
      "command": "fulcrum",
      "args": ["serve", "mcp", "--profile", "hook-only"]
    }
  }
}
```

**Success criteria:**
- [ ] `fulcrum serve mcp --profile hook-only` serves 20 tools (23 minus 3 hookEquivalent)
- [ ] `fulcrum serve mcp --profile chief_of_staff` serves all tools including `invoke_team`
- [ ] `fulcrum serve mcp --profile software_engineer` does not serve `invoke_team`
- [ ] No `--profile` flag → all 23 tools (backwards-compatible)
- [ ] Filter function has unit tests

**Files touched:** `mcp-server.ts`, `tool-registry.ts`, `index.ts`, `tests/mcp-server.test.ts`, `CLAUDE.md`, `agent-integration/install.ts`

**Complexity:** Medium (1 day)

---

### Phase 6: Hook Pre-Fetch Injection (formerly Hook-as-Executor)

**What:** Hooks cannot intercept and replace MCP tool calls — that is not how the Claude Code hook protocol works. Hooks can, however, inject context into the conversation *before* Claude makes tool calls. Use this to pre-fetch workspace state at hook time so Claude's first N tool calls are often unnecessary.

The `SessionStart` hook already calls `startAgentRun` and writes a session file. Extend it to also:
1. Call `buildDeps()` to resolve workspace context
2. Pre-fetch `get_workspace_status` and `list_tasks` (open tasks, limit 10) via the registry directly (in-process, not via MCP round-trip)
3. Serialize the snapshot to the session file alongside `run_id`

**`PreToolUse` hook** already runs `recall_memory` via `@moabualruz/fulcrum-memory` import. Extend it to read the pre-fetched snapshot from the session file and inject it as a stderr note so Claude sees it before deciding whether to call `get_workspace_status` again.

**Important scoping:** This is a context *supplement*, not a replacement. Claude can still call `get_workspace_status` via MCP if it needs fresh data. The pre-fetch reduces the common case where Claude calls it at the start of every session just to orient itself.

**CLI path:** In parallel, the fact that `fulcrum tool exec get_workspace_status` exists (Phase 3) means CI pipelines and non-hook platforms can call it directly without MCP.

**Deliverables:**
- Extended `runSessionStartHook()` — pre-fetches workspace snapshot, writes to session file
- Extended `runPreHook()` — reads snapshot from session file, injects as stderr context if stale < 5 minutes
- `tests/hook-session-lifecycle.test.ts` — extended to verify snapshot is written and read

**Success criteria:**
- [ ] `SessionStart` hook writes `{ workspace_snapshot, fetched_at }` to session file
- [ ] `PreHook` reads snapshot when it exists and `fetched_at` is < 5 minutes old
- [ ] Hook total execution time stays under 10ms on warm SQLite (was target <5ms; reading from a pre-written file is negligible)
- [ ] Fresh `get_workspace_status` MCP call still works — hook injection doesn't block it

**Files touched:** `index.ts` (session hooks), `hooks.ts`, `tests/hook-session-lifecycle.test.ts`

**Complexity:** Low-Medium (after Phase 2)

---

## Code Style

```typescript
// tool-registry.ts — entry pattern
TOOL_REGISTRY.set('list_tasks', {
  schema: TOOL_SCHEMA_MAP.get('list_tasks')!,
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const ws = (args.workspace_id as string | undefined) ?? deps.workspace_id
    const proj = (args.project_id as string | undefined) ?? deps.project_id
    return listTasks(deps.db, ws, proj, { status: args.status as string | undefined })
  },
})
```

- Every handler is a pure function of `(args, deps)` — no closures over mutable state
- `deps` is constructed once per server startup, not per request
- No `any` — use `as string | undefined` with explicit fallback
- Handlers throw on unrecoverable errors; MCP server catches and wraps as `isError: true`

## Testing Strategy

- **Unit tests** (`tool-registry.test.ts`): Mock `HandlerDeps` with an in-memory SQLite DB. Test each handler in isolation.
- **Integration tests** (`tool-exec.test.ts`): Spawn `fulcrum tool exec` as a child process, parse stdout JSON.
- **MCP server tests** (`mcp-server.test.ts`): Already exist; extend to cover profile filtering.
- Coverage target: 80% line coverage on `tool-registry.ts`

## Boundaries

- **Always do:** Update the registry manifest when adding a new tool; keep capabilities accurate; run tests before committing
- **Ask first:** Changing `hookEquivalent: true` on any tool (affects default MCP surface for all users); adding a new mandatory parameter to any existing handler
- **Never do:** Add tool handler logic to `index.ts` directly; duplicate handler code between MCP and CLI paths; use `workspace_id = 'default'` as a default value anywhere

---

## Success Criteria (Full System)

- [x] **P0-A:** `getAgentDefinition()` returns non-null for all 24 built-in roles
- [x] **P0-B:** `workspace_id`/`project_id` are optional in tool schemas for all context-aware tools
- [x] **Phase 1:** CI lint catches read tools missing `readOnlyHint`
- [x] **Phase 2:** `handleToolCall` is deleted from `index.ts`; both MCP handlers use the registry; all existing tests pass
- [x] **Phase 3:** `fulcrum tool exec list_tasks` returns same shape as MCP `list_tasks`; exit codes are correct
- [x] **Phase 4:** All 23 entries have explicit capabilities; unit tests verify
- [x] **Phase 5:** `--profile hook-only` serves 20 tools; `--profile <role>` enforces `tools_allow`/`tools_deny`
- [x] **Phase 6:** SessionStart hook pre-fetches workspace snapshot; PreHook injects it when fresh

---

## Open Questions

1. **P0-B scope:** Which tools should NOT default `workspace_id`? `invoke_team` and `create_team_template` are global (not workspace-scoped). These should keep `workspace_id` required where meaningful. Full list TBD.

2. **hookEquivalent classification — who decides?** Today: manual annotation in `tool-registry.ts`. Should there be a runtime check (e.g., "did the last N pre-hooks call this tool?") to auto-detect? Probably too complex for v1 — keep it manual.

3. **`--profile` flag in the Claude Code MCP config:** Does `install.ts` add `--profile hook-only` by default, or do users opt in? Recommendation: opt-in initially; add to install instructions after Phase 5 is validated.

4. **Session file snapshot TTL in Phase 6:** 5 minutes is a guess. Should be configurable via `FULCRUM_SNAPSHOT_TTL`. What happens when the session file is from a previous session (stale run_id but valid workspace)? Need to verify snapshot is for the current session.

5. **Phase 5 with no CORE-001 fix:** If P0-A hasn't landed, `getAgentDefinition()` returns null and `--profile <role>` silently serves all tools. Is this acceptable degradation, or should Phase 5 hard-fail when the role can't be resolved?

---

## Dependency Graph

```
P0-A (CORE-001 fix) ─────────────────────────────────→ Phase 5 (role filtering)
P0-B (optional params) ──→ Phase 2 (registry) ──→ Phase 3 (tool exec)
                                    │
                                    ├──→ Phase 4 (capability manifest)
                                    │           │
                                    │           └──→ Phase 5 (MCP filtering)
                                    │
                                    └──→ Phase 6 (hook pre-fetch)
Phase 1 (readOnlyHint lint) ← independent, no deps
```
