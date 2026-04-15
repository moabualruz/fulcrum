---
date: 2026-04-15
topic: cli-mcp-parity
focus: Mirror all MCP tools as CLI commands; smart MCP filtering by role/hook-coverage; performance and token optimization
---

# Ideation: CLI-First Architecture with Smart MCP Filtering

## Codebase Context

**Project shape:** TypeScript/pnpm monorepo, 14 CLI command groups, 23 MCP tools in `mcp-server.ts`. MCP tool handlers live only inside `runServeMcp()` — they are NOT exposed as CLI commands. Hooks (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, `PreCompact`) call `fulcrum hook claude` and must complete in <5ms.

**Critical asymmetries:**
- 23 MCP tools have no CLI equivalents — hooks/scripts/CI cannot call them without a live MCP server
- `tools_allow`/`tools_deny` columns exist in `agent_definitions` but are never wired into dispatch
- CORE-001 bug: `workspace_id='default'` vs `'global'` causes `getAgentDefinition()` to return null for all 24 built-in roles — role-based filtering is entirely broken
- `workspace_id`+`project_id` required on every one of the 23 tool calls — token waste
- No `readOnlyHint` on 14 read-class tools — hosts can't cache or batch them
- Platforms without hooks (Gemini, PI, local runners) have no path to Fulcrum tools

**Past learnings:**
- MCP SDK migration was the highest-leverage unblocked change per audit (F1-ISSUE-02)
- GAP-MCP-6: `buildZodShape` does not recurse into nested `items.properties` — array tool args silently coerce to `z.record`
- GAP-MCP-8: Zod validation failures return `isError: true` instead of JSON-RPC `-32602` — LLM retries deterministic failures
- `roots/list` consumption eliminates `workspace_id`/`project_id` from per-call params (F1-MED-6/7)

---

## Ranked Ideas

### 1. Unified Handler Registry — CLI and MCP from One Source
**Description:** Extract every MCP tool's logic from `runServeMcp()` into a shared `ToolRegistry` map: `{ name, execute, schema, description }`. Both the MCP server and CLI command tree import and call from this registry. Adding `fulcrum task create` as a CLI command becomes a one-liner. `--json` output on CLI commands produces the same shape as MCP responses.
**Rationale:** Structural prerequisite for everything else. Without it, CLI and MCP tool logic inevitably drifts. Every other idea is cheaper to implement once this exists.
**Downsides:** Refactoring 23 tool handlers out of `runServeMcp()` is non-trivial — must not break live MCP server. Handlers using server-internal state need careful decoupling.
**Confidence:** 94%
**Complexity:** Medium
**Status:** Unexplored

### 2. Inverted MCP Filtering — CLI is Full, MCP is Curated
**Description:** MCP's `tools/list` response is generated at startup by subtracting tools that have CLI equivalents AND are already exercised by hooks. Role-level filtering uses the existing (dead) `tools_allow`/`tools_deny` columns in `agent_definitions`. A `--profile <role>` flag on `fulcrum serve mcp` tells the server which surface to present.
**Rationale:** Directly addresses the core request. As CLI coverage grows, MCP surface shrinks automatically. Platforms without hooks get the full surface; hook-capable platforms get a curated, smaller list.
**Downsides:** Requires Idea 1 (Registry) and CORE-001 fix as prerequisites. Without them, filtering silently degrades to unfiltered full list.
**Confidence:** 86%
**Complexity:** Medium (low once Idea 1 lands)
**Status:** Unexplored

### 3. Workspace Context as Environment, Not Tool Call Parameter
**Description:** `SessionStart` hook resolves `workspace_id`+`project_id` once from cwd and exports them as `FULCRUM_WORKSPACE_ID`/`FULCRUM_PROJECT_ID`. Every tool handler reads these as defaults when caller omits them. MCP `initialize` handler also reads from env (implementing `roots/list` implicitly).
**Rationale:** Highest token-reduction change with lowest handler-side complexity. Removes two required parameters from 23 tools across a typical 20+ tool-call session.
**Downsides:** Multi-repo sessions where workspace_id changes mid-session must still pass explicitly. Env var leakage across sub-processes is a minor hygiene concern.
**Confidence:** 91%
**Complexity:** Low
**Status:** Unexplored

### 4. Capability Manifest — One Annotation Powers MCP Hints, Role Filtering, and Hook Policy
**Description:** Each handler registration gains `capabilities: { readOnly, destructive, minRole, hookEquivalent }`. MCP server uses `readOnly` for `readOnlyHint`. Hook policy uses `destructive`+`minRole` for `tools_allow`/`tools_deny` enforcement. Inverted filter (Idea 2) uses `hookEquivalent` to know which tools to subtract from MCP surface.
**Rationale:** One annotation pass wires three currently-dead or missing features: `readOnlyHint`, `tools_allow`/`tools_deny` enforcement, and the hook-based subtraction filter.
**Downsides:** Requires discipline to keep capabilities accurate. `minRole` enforcement depends on CORE-001 fix.
**Confidence:** 88%
**Complexity:** Low-Medium
**Status:** Unexplored

### 5. Hook-as-Executor — Zero-IPC Tool Dispatch in Hook Process
**Description:** Hook process imports ToolRegistry directly and can pre-execute read-only tool calls before returning. When `PreToolUse` fires for `list_tasks`, hook resolves result in-process and injects it — Claude never makes the MCP round-trip. Write tools still go through MCP normally.
**Rationale:** Collapses hook→MCP→tool round-trip to a single process invocation within <5ms constraint. Read-heavy orchestration patterns pay zero MCP overhead.
**Downsides:** Increases hook startup time. Requires Idea 1. Pre-execution changes semantics slightly: Claude doesn't know result was pre-fetched.
**Confidence:** 79%
**Complexity:** Medium-High
**Status:** Unexplored

### 6. Testable Tool Harness — `fulcrum tool exec` for Integration Tests
**Description:** Add `fulcrum tool exec <tool-name> --json <payload>` that invokes any tool directly with a JSON payload and prints JSON result. CI and non-MCP platforms (Gemini, PI, shell scripts) use this as their first-class path to all 23 tool capabilities.
**Rationale:** Forces architectural discipline (if a tool can't be exec'd via CLI, Idea 1 isn't done). Makes every tool independently testable without spinning up the full stdio server.
**Downsides:** Requires Idea 1. Arbitrary JSON payload via `--json` is slightly awkward UX but mirrors `curl -d` conventions.
**Confidence:** 90%
**Complexity:** Low (after Idea 1)
**Status:** Unexplored

### 7. `readOnlyHint` Auto-Injection by Naming Convention
**Description:** In the MCP manifest builder, automatically tag any tool whose name starts with `list_`, `get_`, `recall_`, or `build_` with `annotations: { readOnlyHint: true, idempotentHint: true }`. One loop in the manifest builder, zero per-tool changes.
**Rationale:** Deployable today as a standalone commit. MCP hosts that honor `readOnlyHint` can cache, batch, and skip confirmation prompts for all 14 read-class tools.
**Downsides:** Naming convention is a heuristic — a tool named `list_tasks_and_create_subtask` would be incorrectly tagged. Needs a CI lint rule to validate.
**Confidence:** 97%
**Complexity:** Low (standalone, no dependencies)
**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Stub debt from `start_agent_run` | Maintenance task, not architectural improvement |
| 2 | `roots/list` as standalone idea | Prerequisite folded into Idea 3 |
| 3 | Fix CORE-001 by aliasing | Bugfix precondition, not an ideation candidate |
| 4 | Tool Self-Registration via Decorator | Over-engineered; simple map is sufficient |
| 5 | Decompose MCP into 4 micro-servers | Operational overhead > filtering benefit |
| 6 | Session Lifecycle Batched Meta-Tool | Fights RPC model; better as a brainstorm variant |
| 7 | Declarative Tool Graph | Speculative value today; premature |
| 8 | Session Context Daemon (sidecar) | Env propagation achieves same with no extra process |
| 9 | Hook Pipeline as Middleware Chain | Out of scope of CLI/MCP parity focus |
| 10 | SQLite Direct Access / Remove Server | MCP is protocol-required by Claude Code host |
| 11 | Cross-Platform Hook Portability (standalone) | Real but vague; needs its own focused ideation |
| 12 | Hook Result Caching Layer | Adds complexity; `readOnlyHint` is the better first step |
| 13 | System-Prompt Injection for Read Tools | Dynamic system prompts aren't session-stable; stale data risk |
| 14 | Schema-Derived CLI Arg Parsing | Implementation detail of Unified Registry, not standalone |

---

## Session Log
- 2026-04-15: Initial ideation — 40 raw candidates generated across 4 frames, 7 survivors. Natural implementation order: 7 → 3 → 1 → 4 → 2 → 6 → 5.
- 2026-04-15: User selected all 7 for brainstorm — routing to ce:brainstorm for full system design.
