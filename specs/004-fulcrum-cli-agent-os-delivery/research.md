# Research: Fulcrum CLI Agent OS Full Product Delivery

## Decision: TypeScript-first monorepo

**Rationale**: SRS amendment 02 and the constitution make cockpit-first delivery the final language direction. TypeScript lets cockpit, local API, MCP tools, CLI, shared schemas, event contracts, adapters, and tests use one type system. The code must stay portable across Node.js and Bun until packaging and subprocess reliability are proven.

**Alternatives considered**:

- **Go core plus TypeScript cockpit**: Better native process and packaging story, but creates split-language friction before evidence requires it.
- **Rust core**: Strong safety and performance, but slower iteration and unnecessary for a local orchestration/control-plane product.
- **Bun-only TypeScript**: Attractive for local executables and speed, but too risky as a required runtime before SQLite, spawn, and packaging behavior are validated.

## Decision: MCP TypeScript SDK with stdio default

**Rationale**: Current MCP TypeScript SDK documentation supports `McpServer` and `StdioServerTransport` for local MCP servers, plus `StdioClientTransport` with `command` and `args` for clients that spawn local servers. Fulcrum's default agent-facing interface should therefore be local stdio, matching local-first and no-network defaults. Loopback HTTP remains available for cockpit/API and local clients only when bound to `127.0.0.1` by default.

**Alternatives considered**:

- **Network-first MCP server**: Easier for browser-like clients, but weakens default privacy posture and requires bind/authorization decisions earlier.
- **Custom JSON-RPC over stdin/stdout**: Avoids SDK dependency, but reinvents an open protocol and makes agent integration weaker.
- **Per-agent bespoke protocols**: Adds brittle vendor-specific behavior and violates replaceable adapter boundaries.

## Decision: SQLite canonical state with explicit migrations

**Rationale**: Fulcrum needs durable local state, transactions, inspectability, backup/restore, and cross-surface consistency. SQLite is mature, local, portable, easy to back up, and sufficient for one operator. Every state transition and long-running operation can be recorded transactionally, with append-only event records for audit and replay.

**Alternatives considered**:

- **JSON files as canonical state**: Easy to inspect, but fragile for concurrency, transactions, indexes, and referential integrity.
- **PostgreSQL or hosted database**: More scalable, but violates local-first simplicity for
- **Graph database**: Not needed in this delivery because stable IDs, relational refs, and rebuildable projections answer required traceability questions.

## Decision: Local web cockpit served from loopback API

**Rationale**: The cockpit is first-class. It should show global board, project board, queues, run details, policy approvals, context/evidence, artifacts, quality gates, worktree delivery, adapter settings, doctor, and privacy status. The cockpit must call the same core services as CLI and MCP through the local API, so it cannot own separate workflow state.

**Alternatives considered**:

- **TUI-first**: Useful later, but cockpit is the product direction and carries richer review flows.
- **Static dashboard over exported files**: Good for inspection, but cannot handle approvals, live events, and previews cleanly.
- **Remote hosted cockpit**: Out of scope for this delivery and conflicts with local-first ownership.

## Decision: Shared core services behind all surfaces

**Rationale**: CLI, cockpit, local API, MCP, JSON/JSONL, and terminal dashboard/TUI must agree on IDs, statuses, degraded states, policy results, and provenance. Shared services prevent split-brain behavior and make contract tests meaningful.

**Alternatives considered**:

- **Surface-specific implementations**: Faster initially, but creates cross-surface drift and policy bypass risk.
- **Database-only surface access**: Makes parity easier but leaks persistence details and bypasses policy/service invariants.

## Decision: Supervised subprocess adapter for CLI agents

**Rationale**: Fulcrum must support many CLI agents without deep vendor integrations. Agent wrappers should record command identity, process lifecycle, heartbeat, stdout/stderr log refs, artifacts, worktree state, cancellation results, and exit classification. A deterministic validation agent is required for deterministic validation.

**Alternatives considered**:

- **Agent SDK-first orchestration**: More capability for specific agents, but narrows compatibility and increases vendor coupling.
- **Shell scripts only**: Too little structure for policy gates, events, cancellation, artifacts, and cross-surface visibility.
- **External process supervisor as required dependency**: Useful adapter, but should not be mandatory for core workflows.

## Decision: Explicit worktree safety service

**Rationale**: Worktree cleanup and merge readiness are high-risk. Fulcrum must inspect dirty files, untracked files, unpushed commits, active runs, conflicts, missing artifacts, quality gates, and approvals before cleanup or merge. Blocks must be operator-visible and recorded.

**Alternatives considered**:

- **Trust Git commands directly from agents**: Violates operator control and user-work preservation.
- **Disable cleanup automation entirely**: Safer but weakens product value. Preview, approval, and block rules provide controlled automation.

## Decision: Context packs as durable, explainable bundles

**Rationale**: Context quality is core product value. Context packs need stable IDs, linked task/run, lane budgets, items, omissions, degraded lanes, freshness, evidence types, and export formats. Exact/path/structural evidence must be distinguished from semantic or ranked evidence.

**Alternatives considered**:

- **Opaque RAG prompt generation**: Fails provenance and operator trust requirements.
- **Always include all evidence**: Breaks budgets and can leak sensitive or ignored content.
- **Semantic-first ranking**: Risks burying exact code facts under weak results.

## Decision: Markdown-first memory with optional adapters

**Rationale**: Local markdown and text memory satisfy early memory requirements while remaining inspectable, exportable, and tool-friendly. Optional memsearch, Engram, or semantic backends can improve recall but must degrade visibly.

**Alternatives considered**:

- **Vector database required for memory**: Too much infrastructure and not local-first enough for
- **Agent-provider memory only**: Opaque and not Fulcrum-owned.
- **Custom memory database only**: Reinvents mature search/storage without enough product need.

## Decision: Replaceable adapter contract for optional tools

**Rationale**: External PM, memory, code tools, semantic search, telemetry, remote providers, CLI agents, and quality gates must be optional, health-checked, and replaceable. Each adapter reports ownership boundaries, health, offline behavior, disablement behavior, credential status, privacy impact, and import/export or rebuild strategy.

**Alternatives considered**:

- **One preferred adapter per domain with hard dependency**: Faster but makes hidden sources of truth likely.
- **Plugin marketplace in this delivery**: Too broad and outside product boundaries.

## Decision: Policy and privacy gates are service-level invariants

**Rationale**: Dangerous actions can enter from CLI, cockpit, MCP, or an adapter. Policy checks must run in shared services before state-changing effects. Local-only mode blocks remote PM, remote model, telemetry, remote observability, public bind, and remote provider actions unless policy is changed by the operator.

**Alternatives considered**:

- **Surface-level confirmation prompts only**: MCP or adapter paths could bypass human surfaces.
- **Agent self-approval**: Violates operator control.
- **Static allowlist only**: Insufficient for project/action/run-specific context.

## Decision: Quality gates as evidence, not optimism

**Rationale**: Fulcrum must capture gate command identity, working context, timing, status, output refs, parsed summary, redaction status, and linked run/task. Required gates block writeback, merge readiness, review completion, and completion claims until passing evidence exists. Operator exceptions remain visible review records and do not satisfy release acceptance.

**Alternatives considered**:

- **Always-on language server as readiness authority**: Heavy and optional per SRS.
- **Agent summary as readiness proof**: Not evidence-based.
- **Run all gates automatically**: Can surprise operators; heavy gates should be explicit or async.

## Decision: Backup, restore, export, rebuild, reset, uninstall as first-class flows

**Rationale**: Local-first ownership requires recovery and exit paths. Every destructive or broad action previews affected data, preserves backups by default, requires confirmation where needed, and records events/policy decisions.

**Alternatives considered**:

- **Manual filesystem backup only**: Insufficient for referential integrity and operator confidence.
- **Opaque app-specific archive**: Hard to inspect and conflicts with local ownership.

## Decision: JSONL event mirror for inspectability

**Rationale**: SQLite remains canonical, but local JSONL event mirrors are useful for agents, debugging, exports, and operator inspection. Events must be append-only, redacted, schema-versioned, and linked to canonical IDs.

**Alternatives considered**:

- **SQLite events only**: Simpler, but less inspectable outside the app.
- **JSONL as canonical**: Weak transaction and query semantics for this delivery scale.

## Recommended Skill Calls

Use [skill-calls.md](skill-calls.md) as the full catalog. For research updates,
prioritize [$find-docs](/home/mkh/.agents/skills/find-docs/SKILL.md),
[$framework-docs-researcher](/home/mkh/.raise/profiles/vanilla/codex/skills/framework-docs-researcher/SKILL.md),
[$best-practices-researcher](/home/mkh/.raise/profiles/vanilla/codex/skills/best-practices-researcher/SKILL.md),
[$source-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/source-driven-development/SKILL.md),
[$tavily-research](/home/mkh/.agents/skills/tavily-research/SKILL.md),
[$tavily-search](/home/mkh/.agents/skills/tavily-search/SKILL.md),
and [$tavily-extract](/home/mkh/.agents/skills/tavily-extract/SKILL.md).
