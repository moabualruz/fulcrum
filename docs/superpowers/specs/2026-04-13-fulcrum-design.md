# Fulcrum — Design Spec

> "Give me a lever long enough and a fulcrum on which to place it, and I shall move the world." — Archimedes
>
> Fulcrum is the fulcrum. Agents are the lever. You move the world.

**Date:** 2026-04-13  
**Branch:** `feat/agent-integration-full-control`  
**Status:** Approved for implementation

---

## 1. Overview

Fulcrum is a **local-first agent control plane** — a TypeScript monorepo that gives any CLI coding agent persistent task tracking, semantic memory, run lifecycle management, policy enforcement, multi-agent coordination, and observability. It replaces the Python `pi_agent_os` backend entirely.

**Primary runtime:** PI is the primary agent runtime for all non-Claude/non-Gemini workloads (local models, Ollama, etc.). Claude Code and Gemini CLI are used when specifically targeting those APIs. All other cases run through PI.

**Design principles:**
- All business logic lives in `@fulcrum/core` — transports (gRPC, HTTP, MCP, native tools) are thin marshaling layers only
- SQLite-first — no external services required to run
- One binary (`fulcrum-mcp`) serves both MCP stdio and policy hook roles
- Installer is a single `postinstall.js` using Node stdlib only
- Every feature is usable from day one — no "phase 2 required" paths in core workflows

---

## 2. Monorepo Structure

```
fulcrum/
├── packages/
│   ├── core/           @fulcrum/core       — all domain logic, zero transport concerns
│   ├── server/         @fulcrum/server     — ConnectRPC (gRPC + HTTP) from one port
│   ├── mcp/            @fulcrum/mcp        — fulcrum-mcp binary (MCP stdio + policy hook)
│   ├── extension/      fulcrum-cockpit     — PI native extension
│   ├── opencode/       @fulcrum/opencode   — OpenCode native tool() plugin
│   └── cli/            @fulcrum/cli        — fulcrum management CLI + setup wizard
├── packages/config/
│   ├── claude/         — CLAUDE.md, .mcp.json, hooks snippet
│   ├── gemini/         — GEMINI.md, settings patch
│   ├── codex/          — AGENTS.md, config.toml patch
│   └── copilot/        — COPILOT.md, mcp-config patch, agents/
├── packages/skills/    — 4 superpowers SKILL.md files (copied to ~/.claude/skills/ and ~/.agents/skills/)
├── scripts/
│   └── postinstall.js  — Node stdlib only, agent detection + config deployment
├── proto/              — .proto definitions for all ConnectRPC services
├── package.json        — pnpm workspace root, "postinstall": "node scripts/postinstall.js"
└── pnpm-workspace.yaml
```

**Package manager:** pnpm  
**Runtime:** Node 20+  
**TypeScript transpiler for PI extension:** jiti (no pre-compilation needed)

---

## 3. Core Architecture

### 3.1 `@fulcrum/core` — hexagonal / ports-and-adapters

All domain functions are pure TypeScript, exported from `packages/core/`. Transports import and call them directly — no duplication of business logic.

```typescript
// Written once in core:
export async function createTask(input: CreateTaskInput): Promise<Task>
export async function startAgentRun(input: StartRunInput): Promise<AgentRun>
export async function escalateRun(input: EscalateRunInput): Promise<Task>
// ... all 14 operations + policy + memory + heartbeat janitor

// MCP transport — marshaling only:
server.tool("fulcrum_create_task", schema, async (args) => {
  const task = await createTask(args)
  return { content: [{ type: "text", text: JSON.stringify(task) }] }
})

// HTTP transport — marshaling only:
app.post('/api/v1/tasks', async (c) => c.json(await createTask(await c.req.json())))
```

### 3.2 Transport: ConnectRPC

Single port (default `4721`) serves all three protocols from one server:
- **gRPC (HTTP/2)** — CLI tools, local agent connections, fastest
- **Connect (HTTP/1.1)** — browser, curl, REST clients
- **gRPC-Web** — browser WebSocket

`buf` + `.proto` definitions generate typed TypeScript clients. Both the MCP binary and the HTTP API import the same `@fulcrum/core` functions.

### 3.3 Storage: SQLite

**Driver:** `better-sqlite3` (synchronous, WAL mode enabled at startup)  
**Extensions:** `sqlite-vec` (vector storage, replaces Qdrant entirely)  
**Full-text:** FTS5 virtual tables on task titles, memory content  
**Location:** `.fulcrum/fulcrum.db` in project root  

**Schema additions vs Python baseline:**
- `tasks.depends_on` — JSON array of task_id strings
- `tasks.version` — integer, incremented on every update (optimistic locking)
- `agent_runs.version` — integer (optimistic locking)
- `agent_runs.artifacts` — JSON blob (`{ files_changed, tests_passed, tests_failed, pr_url, notes }`)
- `agent_runs.git_branch` — captured at run start
- `agent_runs.git_commit` — captured at run start
- `agent_runs.events` — JSON array for run event journal (schema slot; full impl is phase 2)
- `memories.confidence` — float 0–1
- `memories.last_accessed_at` — timestamp updated on recall
- `memories.access_count` — integer

### 3.4 Embedding + Memory

**Default text + code embedding:** `onnx-community/Qwen3-Embedding-0.6B-ONNX`  
- MTEB multilingual: 64.33 | MTEB code: 80.83  
- Beats bge-m3 and jina-embeddings-v3 at same parameter count  
- Loaded via `@huggingface/transformers` v3 (ONNX Runtime, Node.js)  
- **Warmed up at server startup** — not on first query

**Default reranker:** `onnx-community/bge-reranker-v2-m3-ONNX`  
- Battle-tested, 0.6B, cross-encoder

**Retrieval pipeline:** FTS5 lexical search → sqlite-vec dense ANN → score merge → bge reranker → top-k results

**Configurable per content type** in `.fulcrum.json`:
```json
{
  "embedding": {
    "text": { "provider": "local", "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX" },
    "code": null
  },
  "reranker": { "provider": "local", "model": "onnx-community/bge-reranker-v2-m3-ONNX" }
}
```
`code: null` → falls back to text model. Supported providers: `local`, `openai`, `voyage`, `cohere`, `ollama`, `jina`, `custom` (OpenAI-compatible).

**Memory deduplication:** Before `write_memory` inserts, cosine similarity is checked against existing memories for the same project. If similarity > 0.9, the existing record is updated in place (`content`, `updated_at`, `confidence`) instead of a new row being added.

---

## 4. The 14 Core Tools

All tools are implemented in `@fulcrum/core` and exposed identically across all transports.

### Task management
| Tool | Key inputs | Returns |
|---|---|---|
| `list_tasks` | `status?`, `project_id?` | `Task[]` |
| `create_task` | `title`, `description?`, `project_id`, `depends_on?` | `Task` |
| `update_task` | `task_id`, `status?`, `note?`, `assigned_to?`, `expected_version?` | `Task` |

### Agent run lifecycle
| Tool | Key inputs | Returns |
|---|---|---|
| `start_agent_run` | `task_id`, `role` | `AgentRun` (includes `run_id`) |
| `heartbeat_agent_run` | `run_id`, `current_step`, `progress_pct` | `ok` |
| `get_agent_run_status` | `run_id` | `AgentRun` (current state, artifacts, git context) |
| `complete_agent_run` | `run_id`, `output_summary`, `artifacts?` | `AgentRun` |
| `block_agent_run` | `run_id`, `reason` | `AgentRun` |
| `escalate_run` | `run_id`, `escalation_reason` | `Task` (new CoS task) |

### Memory
| Tool | Key inputs | Returns |
|---|---|---|
| `recall_memory` | `query`, `limit?` (default 5) | `Memory[]` |
| `write_memory` | `content`, `tags?`, `confidence?` | `Memory` |

### Status + planning
| Tool | Key inputs | Returns |
|---|---|---|
| `get_workspace_status` | `workspace_id` | Full snapshot |
| `build_cos_context` | `workspace_id`, `max_tokens?` (default 4000) | Markdown string |
| `list_agent_profiles` | — | `AgentProfile[]` |

**Tool naming by agent:**
- PI native: `fulcrum_*`
- Claude Code MCP: `mcp__fulcrum__*`
- Gemini MCP: `mcp_fulcrum_*`
- OpenCode native: `fulcrum_*`
- Codex MCP: `mcp__fulcrum__*`
- Copilot MCP: `mcp__fulcrum__*`

---

## 5. Reliability + Robustness

### 5.1 Heartbeat janitor

Background process running every 60 seconds. Marks runs as `stale` if no heartbeat received within `policy.heartbeat_timeout_minutes` (default: 10). Stale runs remain visible in status with `stale_since` timestamp but don't count toward WIP limits.

Auto-escalation: if a run has been `blocked` longer than `policy.escalation_timeout_minutes` (default: 30), the janitor calls `escalate_run` automatically, creating a `chief_of_staff` task.

### 5.2 WIP limits + backpressure

Configured in `.fulcrum.json`:
```json
{
  "policy": {
    "wip_limit": 5,
    "wip_limit_per_role": { "implementer": 2, "tester": 2 },
    "heartbeat_timeout_minutes": 10,
    "escalation_timeout_minutes": 30
  }
}
```
`start_agent_run` checks current running count before registering. If over limit: returns `{ blocked: true, reason: "wip_limit_exceeded", current_wip: N, limit: N }`. Agents should retry after completing or blocking an existing run.

### 5.3 Optimistic locking

`tasks.version` and `agent_runs.version` are integers incremented on every write. `update_task` and `update_run` accept optional `expected_version`. If the current version doesn't match: rejected with `{ error: "version_conflict", current_version: N }`. Concurrent agents don't silently overwrite each other.

### 5.4 Task dependencies

`tasks.depends_on` is a JSON array of `task_id` strings. `start_agent_run` on a task with incomplete dependencies returns `{ blocked: true, reason: "dependencies_incomplete", blocking_tasks: [...] }`. No topological sort engine — just a check at run-start time.

### 5.5 Health endpoint + daemon auto-restart

`GET /health` → `{ status: "ok", version, workspace_count, uptime_seconds, embedding_model_loaded: bool }`

`fulcrum start --daemon` uses a supervisor loop with exponential backoff (1s, 2s, 4s, 8s, 16s) up to 5 restarts before giving up and logging to `.fulcrum/server.log`.

### 5.6 Advisory locks (phase 2 — schema now)

`advisory_locks` table created in initial migration. `acquire_lock(resource_id, run_id, ttl_seconds)` and `release_lock(resource_id, run_id)` — prevents two agents editing the same file simultaneously. Full implementation is phase 2 but the table is there from day one.

---

## 6. Agent Integrations

### 6.1 PI primacy

PI is the primary runtime for all non-Claude/non-Gemini workloads. Its integration is the richest — it gets native in-process tools, a full TUI widget, slash commands, and the policy hook — all without MCP overhead.

### 6.2 Capability matrix

| Capability | PI | Claude Code | Gemini | OpenCode | Codex | Copilot CLI |
|---|---|---|---|---|---|---|
| **Native tools** | `defineTool()` in-process | MCP only | MCP only | `tool()` in-process | MCP only | MCP only |
| **Tool speed** | In-process (fastest) | MCP subprocess | MCP subprocess | In-process via Bun | MCP subprocess | MCP subprocess |
| **MCP config** | via extension | `.mcp.json` (`servers` key) | `~/.gemini/settings.json` (`mcpServers` key) | `opencode.json` (`mcp.servers` key) | `~/.codex/config.toml` (`[[mcp_servers]]`) | `~/.copilot/mcp-config.json` (`servers` key) |
| **Pre-tool hook** | `beforeTool` in extension | `PreToolUse` stdin JSON | `BeforeTool` in settings | `tool.execute.before` event | Hook system | Hook system |
| **TUI widget** | Full widget + footer | None | None | Toast + prompt only | None | None |
| **Custom slash commands** | `registerCommand()` | None | TOML `[[commands]]` | `command:` in opencode.json | Native (shipped) | None — built-ins only |
| **Skills (no-slash fallback)** | N/A | 4 superpowers SKILL.md files | N/A | N/A | 4 superpowers SKILL.md files | Markdown agents in `.github/agents/` |
| **Session events** | `session_start/end` | `UserPromptSubmit` hook | Extension init | `session.created` + 25+ events | Hook system | Hook system |
| **Config injection** | `PI.md` | `CLAUDE.md` | `GEMINI.md` | `opencode.json` `instructions:` | `AGENTS.md` | `.github/agents/` markdown |

### 6.3 Tier summary (for user docs)

| Tier | Agents | Experience |
|---|---|---|
| **Full cockpit** | PI | Widget, footer, native tools, slash commands, policy hook. Primary for all non-Claude/Gemini work. |
| **Native + partial TUI** | OpenCode | In-process tools (fast), slash commands, toast wizard, policy hook, MCP fallback. |
| **MCP + slash commands** | Gemini, Codex | 14 MCP tools, slash commands, policy hook, config injection. |
| **MCP + skills** | Claude Code | 14 MCP tools, policy hook, superpowers skills for operation shortcuts. |
| **MCP + agent files** | Copilot CLI | 14 MCP tools, hook, agent markdown files in `.github/agents/`. Least extensible. |

### 6.4 Hard limitations per agent (documented for users)

| Agent | What it cannot do |
|---|---|
| **Claude Code** | No native tool API, no TUI, no slash commands, no plugin system. Everything via MCP. |
| **Gemini** | No native tool API, no TUI, limited slash commands (TOML declared, not programmatic). |
| **OpenCode** | No persistent TUI widget or footer — toast + prompt-append only. Requires Bun. |
| **Codex** | MCP is subprocess (not in-process). No TUI. Requires restart after config change. |
| **Copilot CLI** | No custom slash commands (built-ins only). No plugin SDK. Requires active Copilot subscription. |

### 6.5 `fulcrum-mcp` binary — dual mode

```
npx fulcrum-mcp                 → MCP stdio server (14 tools)
npx fulcrum-mcp --hook policy   → policy hook (reads stdin JSON, exits 0 allow / 2 block)
npx fulcrum-mcp --hook log      → pre-tool logging only
```

Single entry point in `packages/mcp/bin.ts`. Both modes import `@fulcrum/core` directly — no network hop. Hook mode normalises agent-specific JSON formats (Claude vs Gemini differ in payload shape) before calling the policy engine.

---

## 7. PI Cockpit Extension (`packages/extension/`)

### 7.1 Widget

Renders live workspace state. Refreshes every 5 seconds via background poller calling `getWorkspaceStatus()` from `@fulcrum/core`.

```
┌─ Fulcrum  http://127.0.0.1:4721/docs ────────────────────┐
│ RUNNING (2)                                                │
│   implementer  ░░░░░░░░░░░░  42%  parsing routes          │
│   tester       ░░░░░░        18%  writing fixtures         │
│                                                            │
│ BLOCKED (1)                                                │
│   reviewer     waiting for implementer                     │
│                                                            │
│ WIP: 3   QUEUED: 5   STALE: 0   SERVER: ● 4721            │
└────────────────────────────────────────────────────────────┘
```

Footer: `● Fulcrum  2 run  1 blocked  WIP:3  :4721`

Widget shape: `{ render(width: number): string[] }`. Footer: `ctx.ui.setStatus("fulcrum", text)`.

### 7.2 Native tools (14)

All call `@fulcrum/core` in-process. Every tool has `label`, `promptSnippet`, `promptGuidelines`. The `beforeTool` callback on each `defineTool()` call passes through `checkPolicy()` — no separate hook process.

### 7.3 Slash commands

| Command | Action |
|---|---|
| `/fulcrum-setup` | Re-run setup wizard |
| `/fulcrum-status` | Full workspace status |
| `/fulcrum-tasks [status]` | List tasks |
| `/fulcrum-create <title>` | Create task |
| `/fulcrum-run <task_id> <role>` | Start agent run |
| `/fulcrum-complete <run_id> [summary]` | Complete run |
| `/fulcrum-block <run_id> <reason>` | Block run |
| `/fulcrum-escalate <run_id> <reason>` | Escalate blocked run |
| `/fulcrum-recall <query>` | Semantic memory search |
| `/cos <goal>` | Build CoS world-state → `pi.sendUserMessage()` |

### 7.4 Setup wizard

Fires on `session_start` with `reason === "startup"` if `.fulcrum.json` is absent. Uses `ctx.ui.input()` prompts. Checks Node 20+. Writes `.fulcrum.json`. Offers to start the server daemon.

---

## 8. Superpowers Skills (`packages/skills/`)

Four skills installed to `~/.claude/skills/` and `~/.agents/skills/` by `postinstall.js`. Follow the full SKILL.md standard: YAML frontmatter, TDD-developed, <500 words each.

| Skill | `name` | Description (triggering conditions) |
|---|---|---|
| `fulcrum-run-lifecycle/SKILL.md` | `fulcrum-run-lifecycle` | Use when starting, working on, or finishing any non-trivial task |
| `fulcrum-task-lifecycle/SKILL.md` | `fulcrum-task-lifecycle` | Use when beginning work on a feature, bug, or investigation |
| `fulcrum-memory-patterns/SKILL.md` | `fulcrum-memory-patterns` | Use when making architecture decisions or searching for prior context |
| `fulcrum-cos-dispatch/SKILL.md` | `fulcrum-cos-dispatch` | Use when operating as chief_of_staff or planning a multi-agent session |

Skills use correct tool names per agent (`mcp__fulcrum__*` for Claude Code and Codex). No long-winded descriptions — quick reference tables and core patterns only.

---

## 9. CLI + Setup Wizard (`packages/cli/`)

### 9.1 `fulcrum` commands

```
fulcrum setup                  interactive setup wizard
fulcrum start                  start ConnectRPC server (foreground)
fulcrum start --daemon         start as background daemon with auto-restart supervisor
fulcrum stop                   stop daemon
fulcrum status                 workspace status snapshot
fulcrum tasks [--status]       list tasks
fulcrum task create            create a task
fulcrum server logs            tail .fulcrum/server.log
fulcrum migrate                run SQLite migrations (idempotent)
fulcrum export [--out file]    export workspace to JSON
fulcrum import <file>          import workspace from JSON
```

### 9.2 Setup wizard steps

1. Detect Node 20+ — hard fail with install link if missing
2. Prompt: workspace name → generate `ws_<ulid>`
3. Prompt: project name → generate `proj_<ulid>`
4. Prompt: port (default `4721`) — check if port is free
5. Prompt: embedding provider (default: local Qwen3)
6. Write `.fulcrum.json`
7. Ask: "Start the server now?" → `fulcrum start --daemon`
8. Print summary + `fulcrum status` output

### 9.3 `.fulcrum.json` full schema

```json
{
  "workspace_id": "ws_01JR...",
  "project_id": "proj_01JR...",
  "port": 4721,
  "embedding": {
    "text": { "provider": "local", "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX" },
    "code": null
  },
  "reranker": { "provider": "local", "model": "onnx-community/bge-reranker-v2-m3-ONNX" },
  "policy": {
    "wip_limit": 5,
    "wip_limit_per_role": {},
    "heartbeat_timeout_minutes": 10,
    "escalation_timeout_minutes": 30
  }
}
```

Env-var overrides: `FULCRUM_WORKSPACE_ID`, `FULCRUM_PROJECT_ID`, `FULCRUM_PORT`.

---

## 10. Install Story

### Three paths

**Path A — PI (primary):**
```bash
pi install git:github.com/<you>/fulcrum
# or: pi install ./fulcrum
```
`postinstall.js` runs automatically. Wizard fires on first `session_start`.

**Path B — npm (any agent):**
```bash
npm install -g fulcrum-agent-os
# postinstall.js runs, detects agents, deploys configs
```

**Path C — manual:**
```bash
# Claude Code only:
cp CLAUDE.md /your/project/
# Edit .mcp.json to add fulcrum server entry
```

### `postinstall.js` flow

```
1. Read INIT_CWD → user's project root (not package install dir)
2. Scan PATH for: pi, claude, gemini, opencode, codex, copilot
3. For each detected agent → patch its config file (idempotent — skip if fulcrum entry exists)
4. Copy CLAUDE.md / GEMINI.md / AGENTS.md / PI.md to INIT_CWD
5. Copy skills → ~/.claude/skills/ and ~/.agents/skills/ (if dirs exist)
6. Copy Copilot agent files → .github/agents/ (if copilot detected)
7. Print per-agent install summary
8. If not CI=true → prompt "Run setup wizard now? [Y/n]"
```

Node stdlib only (`fs`, `path`, `child_process`, `os`, `readline`). No dependencies.

### MCP config written per agent

| Agent | Config file | Key format |
|---|---|---|
| Claude Code | `.mcp.json` (project) | `{ "servers": { "fulcrum": { "type": "stdio", "command": "npx", "args": ["fulcrum-mcp"] } } }` |
| Gemini | `~/.gemini/settings.json` | `{ "mcpServers": { "fulcrum": { "command": "npx", "args": ["fulcrum-mcp"] } } }` |
| Codex | `~/.codex/config.toml` | `[[mcp_servers]]` with `id`, `command`, `args` |
| OpenCode | `opencode.json` | `{ "mcp": { "servers": { "fulcrum": { "command": "npx", "args": ["fulcrum-mcp"] } } } }` |
| Copilot CLI | `~/.copilot/mcp-config.json` | `{ "servers": { "fulcrum": { "command": "npx", "args": ["fulcrum-mcp"] } } }` |

---

## 11. Testing Strategy

| Package | Test type | Notes |
|---|---|---|
| `@fulcrum/core` | Unit | All business logic, zero I/O, fast |
| `@fulcrum/server` | Integration | Real ConnectRPC server + in-memory SQLite, HTTP and gRPC clients |
| `@fulcrum/mcp` | Integration | Spawn `fulcrum-mcp` as child process, send MCP protocol messages over stdio |
| `@fulcrum/cli` | Integration | Spawn with `CI=true`, assert exit codes + file outputs |
| `@fulcrum/extension` | Manual | PI has no test harness — verified via `VERIFY.md` checklist |
| `@fulcrum/opencode` | Integration | Run against local OpenCode instance |
| `scripts/postinstall.js` | Integration | Temp directory + mock PATH, assert files written, assert idempotency |
| Skills | TDD (subagent) | RED baseline → GREEN compliance → REFACTOR loopholes per `writing-skills` standard |

---

## 12. Migration from Python

The Python `pi_agent_os` backend is replaced entirely — not wrapped, not called. The TypeScript `@fulcrum/core` reimplements all domain logic against the same SQLite schema (with a migration pass for renamed tables/columns).

**One-time migration for users with existing data:**
```bash
fulcrum migrate --from-pi-agent-os /path/to/pi_agent_os.db
```
SQLite-to-SQLite copy with column mapping. No network, no service.

The Python codebase is tagged at `v0-python-final` and moved to `legacy/`. The 232 Python tests are not ported — they tested Python implementation details. The TypeScript test suite is written fresh against core interfaces.

---

## 13. Phase 2 (deferred — schema slots reserved)

| Feature | Schema slot reserved | Notes |
|---|---|---|
| **Advisory locks** | `advisory_locks` table in initial migration | `acquire_lock` / `release_lock` for file-level mutex between agents |
| **Run event journal** | `agent_runs.events` JSON array column | Full structured log of tool calls and decisions per run |
| **Webhook notifications** | — | POST to URL when run blocked/escalated — useful for CI/CD |

---

## 14. Open Questions (not blockers)

- Copilot CLI exact agent markdown format for `.github/agents/` — verify against current docs before implementing
- Gemini `BeforeTool` hook exact config key in `settings.json` — confirm field name
- OpenCode plugin activation mechanism — confirm `.opencode/plugins/` auto-load or explicit config entry required
