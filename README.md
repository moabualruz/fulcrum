# Fulcrum

**Local-first agent operating system for multi-agent TypeScript systems.**

Fulcrum is the persistence, coordination, and execution layer that keeps agents on track. It manages tasks, enforces WIP limits, routes work through teams and workflows, drives real git worktrees through a merge queue, runs subordinate agents via pluggable adapters, and maintains a three-layer semantic memory that survives across sessions.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20+%20FTS5-003B57?logo=sqlite)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/tests-pnpm%20test-blue)](#running-tests)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm)](https://pnpm.io/)

---

## Why Fulcrum?

Multi-agent systems fail in predictable ways: agents go rogue, pile up stale work, duplicate effort, merge broken branches, and lose context across sessions. Fulcrum solves this at the persistence and execution layer, before any of that reaches your agent code.

- **Local-first** — SQLite on disk, no network dependency in the core loop, zero cold starts
- **Pluggable agent executor** — built-in stub, subprocess, and claude-code adapters; `registerAgentAdapter()` for any CLI or SDK
- **Workflow runner** — declarative step graphs with retries, exponential backoff, per-step timeouts, and 29 step handlers
- **Real git merge queue** — `allocateWorktree` runs `git worktree add`, `processMergeQueue` runs `git merge --no-ff`, detects conflicts, aborts cleanly
- **Distributed tracing built-in** — `startSpan`/`endSpan` persist to `trace_events`, opt-in OTLP export to any OTel backend
- **Three-layer memory** — L0 git-backed markdown vault, L1 FTS5 keyword search, L2 Kuzu graph + HNSW vector search (opt-in)
- **24 canonical roles with capability helpers** — `isL1`, `canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles` are the single source of truth
- **5 system invariants, enforced on every call** — role boundaries cannot be bypassed
- **3 guard tests** — CHECK-drift, bare-ulid, and role-string guards prevent entire classes of bugs from shipping
- **Automatic janitor** — marks stale runs, auto-escalates blocked ones, overlapping-cycle safe

---

## Quick Start

```bash
# From source
pnpm install && pnpm run setup
```

`pnpm run setup` symlinks `fulcrum` to `~/.local/bin`, registers Claude/Gemini/PI integrations, and installs Codex/opencode config, hooks, skills, and rules.

The zero-friction install path (no clone required):

```bash
npx fulcrum-mcp@latest init   # auto-detect Claude Code / Gemini CLI / Cursor / Windsurf
```

```bash
pnpm run setup:claude     # Claude Code only
pnpm run setup:gemini     # Gemini CLI only
pnpm run setup:pi         # PI cockpit only
fulcrum install plan      # detect plugin/extension/config path per runtime
fulcrum init --cursor     # project-local Cursor rules + config
fulcrum init --codex      # project-local Codex config
pnpm run setup:dry        # Plan the install — show every action without touching disk
pnpm run setup:check      # Verify an existing install
```

No explicit init step — every `fulcrum` command auto-initializes `$CWD` on first run:

```bash
fulcrum task create --title "Implement OAuth callback"
fulcrum task list --status running
fulcrum board show
fulcrum serve all --port 4721    # MCP + HTTP monitor + web dashboard at :4721
fulcrum tui                      # full-screen terminal cockpit (Tab to switch panes)
fulcrum log                      # last 50 events from DB
fulcrum log --follow             # tail live SSE stream
fulcrum workflow start --workflow-name implement_feature --workspace-id ws_1
fulcrum workflow run --wf-id wfr_01j...
fulcrum queue merge process --workspace-id ws_1 --actor-role integration_worker
fulcrum agent spawn --target-role software_engineer --caller-role chief_of_staff \
  --task-id task_01j... --workspace-id ws_1 --project-id proj_1 --adapter subprocess
fulcrum doctor --fix             # health check + auto-repair
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent CLIs / Runtimes                         │
│    Claude Code  ·  Gemini CLI  ·  PI  ·  custom subprocess       │
│          (PreToolUse hooks call `fulcrum hook <runtime>`)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                         fulcrum-worker                           │
│   spawnAgent → policy gate → adapter.spawn → run lifecycle       │
│   Built-in: stub · subprocess    Pluggable: registerAgentAdapter │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                       fulcrum-agent-core                         │
│   tasks · runs · policy · memory · handoffs · events · CoS       │
│   roles · capabilities · telemetry spans · advisory locks        │
│                  SQLite (WAL + FTS5)                             │
└───┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
    │          │          │          │          │
┌───▼──┐  ┌───▼───┐  ┌───▼──┐  ┌───▼───┐  ┌───▼──────┐
│memory│  │monitor│  │teams │  │policy │  │planning  │
│ L0   │  │HTTP + │  │slots │  │SYSTEM_│  │epics     │
│ L1   │  │SSE    │  │sched.│  │INVARI │  │issues    │
│ L2   │  │control│  │      │  │ANTS   │  │PRDs/plans│
│kuzu  │  │API    │  │      │  │audit  │  │          │
└──────┘  └───────┘  └──────┘  └───────┘  └──────────┘
┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────┐
│workflows │  │   worktrees  │  │     sync      │  │  cli   │
│runner +  │  │ real git     │  │ Plane adapter │  │ 14     │
│29 step   │  │ worktree +   │  │ conflict res. │  │ command│
│handlers  │  │ merge queue  │  │ secret scan   │  │ groups │
└──────────┘  └──────────────┘  └───────────────┘  └────────┘
```

---

## Packages

| Package | Description |
|---------|-------------|
| [`fulcrum-agent-core`](packages/core) | Domain functions, SQLite schema (52 migrations), role capability helpers, telemetry spans + OTel exporter, embedding providers, handoff protocol, event stream |
| [`fulcrum-memory`](packages/memory) | Three-layer memory stack — L0 git vault, L1 FTS5 + scoring, L2 Kuzu graph + HNSW vector search |
| [`fulcrum-monitor`](packages/monitor) | Real-time metrics dashboard — daily/project/agent metrics, burndown, SSE event stream, HTTP control API, built-in web dashboard, bearer-token-gated write endpoints |
| [`fulcrum-planning`](packages/planning) | Project planning domain — epics, issues, PRDs, plans, dependency graph, code review workflows |
| [`fulcrum-policy`](packages/policy) | Policy engine — 5 system invariants, custom rules, secret guard (12 named patterns, range-based dedup, auto-redact), audit log |
| [`fulcrum-sync`](packages/sync) | Bidirectional sync — Plane integration with retry/backoff, conflict detection, secret scan before push, priority queue |
| [`fulcrum-teams`](packages/teams) | Agent team orchestration — typed templates, slot policies, communication/budget/quality/latency classes |
| [`fulcrum-worker`](packages/worker) | Pluggable agent executor — `AgentAdapter` contract, stub + subprocess + claude-code adapters, `spawnAgent` lifecycle with policy gate and span instrumentation |
| [`fulcrum-workflows`](packages/workflows) | Workflow engine — declarative step graphs, runner with structured `RetryPolicy`, 29 step handlers, run state machine |
| [`fulcrum-worktrees`](packages/worktrees) | Worktree lifecycle — real `git worktree add` allocation, artifact tracking, review gating, integration merge queue with `git merge --no-ff` and conflict handling |
| [`fulcrum-agent-fanout`](packages/agent-fanout) | Canonical skill and rule fanout — emits per-agent artifacts for Claude, Codex, Gemini, opencode, PI, Copilot, Cursor, and Windsurf |
| [`fulcrum-agent-cli`](packages/cli) | `fulcrum` binary — 21 command groups, 32 MCP tools, auto-init per project, hook handlers for agent runtimes, cockpit TUI, activity log |
| [`fulcrum-mcp`](packages/fulcrum-mcp) | Zero-install MCP entry point — `npx fulcrum-mcp` starts the MCP server; `npx fulcrum-mcp init` configures Claude Code, Gemini CLI, Cursor, and Windsurf MCP setup |

---

## Documentation

| Guide | Contents |
|-------|----------|
| [Installation](docs/guides/installation.md) | Global setup, per-runtime install, what gets installed where |
| [Plugins & Extensions](docs/guides/plugins-and-extensions.md) | Runtime packaging models, adaptive install paths, publishing guidance |
| [CLI Reference](docs/guides/cli-reference.md) | Full command tree with all flags and examples |
| [Core API](docs/guides/core-api.md) | Tasks, runs, policy, roles, memory, handoffs, events, locks, DB, janitor, embedding |
| [Memory System](docs/guides/memory.md) | L0 vault structure, L1 FTS5/RRF scoring, L2 Kuzu graph + HNSW pipeline |
| [MCP Tools](docs/guides/mcp-tools.md) | All 32 MCP tools with parameters and agent lifecycle |
| [Policy Engine](docs/guides/policy.md) | System invariants, custom rules, secret guard patterns, hook system, doctor |
| [Monitor Server](docs/guides/monitor.md) | All HTTP endpoints, pagination, control API, A2A agent card |
| [Agent Roles & Teams](docs/guides/agent-roles.md) | 24 roles, capability helpers, agent definitions, A2A cards, team templates |
| [Worker Adapters](docs/guides/worker-adapters.md) | AgentAdapter contract, built-in adapters, custom adapter walkthrough |
| [Workflow Authoring](docs/guides/workflow-authoring.md) | Defining workflows, 29 step handlers, runner options |
| [Worktrees](docs/guides/worktrees.md) | Allocation, merge queue, conflict handling, CLI |
| [Sync](docs/guides/sync.md) | Plane integration, conflict resolution, retry behavior |
| [Telemetry](docs/guides/telemetry.md) | Local spans, auto-instrumentation, OTLP export |
| [Configuration](docs/guides/configuration.md) | `.fulcrum.json` schema, all environment variables |
| [Sandboxed E2E](docs/guides/sandbox-e2e.md) | Dagger/Docker sandbox for full install, integration, and UI checks with fake home |
| [Architecture](docs/guides/architecture.md) | System diagram, package ownership, guard tests, project structure |

---

## Running Tests

```bash
pnpm test                          # all packages
cd packages/core && pnpm test      # single package
pnpm test:watch                    # watch mode
FULCRUM_EMBEDDING_TESTS=1 pnpm test  # embedding integration tests
```

Test counts move quickly across the workspace. Run `pnpm test` for the current full-suite count.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome.

> **Note for native module contributors:** `fulcrum-memory` depends on `kuzu` (Rust native addon). pnpm 10 requires `onlyBuiltDependencies=kuzu` in `.npmrc` to allow the native build.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[MIT](LICENSE) — Mo Abualruz
