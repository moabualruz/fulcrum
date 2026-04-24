# Fulcrum Architecture

Fulcrum is a local-first CLI Agent OS. Architecture follows `SRS-ammend-02.md`: TypeScript first, SQLite canonical state, adapters at trust boundaries, operator-visible evidence, and Go only as measured escape hatch.

## Boundaries

```text
apps/cli       -> packages/core -> packages/db
apps/server    -> packages/core -> packages/db
apps/cockpit   -> local API/core projections
apps/tui       -> local API/core projections
packages/mcp   -> packages/core -> packages/db
packages/plane -> adapter boundary
packages/memory -> adapter boundary
packages/code-tools -> adapter boundary
packages/agents -> process/agent boundary
packages/policy -> policy/redaction/local-only
packages/shared -> schemas, IDs, contracts, lifecycle
```

Rules:

- `packages/shared` owns stable IDs, lifecycle enums, schemas, contract shapes, and event types.
- `packages/core` owns workflow semantics: setup, projects, tasks, runs, context, code evidence, memory, worktrees, quality, graph links, policy enforcement, artifacts, recovery, and doctor aggregation.
- `packages/db` owns migrations, repositories, transactions, canonical SQLite tables, and append-only event storage.
- Apps stay thin. CLI, cockpit, TUI, MCP, JSON/JSONL, and health reports call shared core services and must not fork lifecycle or policy behavior.
- Adapter packages never own Fulcrum workflow truth. They report health, degraded state, privacy impact, ownership boundary, and provenance.

Evidence: plan Constitution Check, BR-004, BR-006, FR-074, FR-075, and SC-012.

## Canonical State

SQLite is authoritative for Fulcrum-owned records:

- projects
- tasks and external mirrors
- runs and run events
- agents and capability health
- context packs and context items
- memory metadata
- code evidence
- graph links
- worktrees
- artifacts
- quality gate definitions and results
- policy decisions
- adapter configuration
- backup manifests and export records

Filesystem stores artifacts, logs, transcripts, backups, exports, generated context packs, managed markdown memory, repo maps, and JSONL event mirrors. Derived indexes, graph projections, context previews, repo maps, code refs, and memory indexes are rebuildable. Rebuild must either regenerate them from canonical records or mark source systems unavailable with actionable degraded state.

Evidence: data model, event contract, FR-071 through FR-075, SC-013, and SC-014.

## Events

Events are append-only and linked to source records. SQLite stores canonical event rows; JSONL mirrors may exist for operator inspection, debugging, agent consumption, and exports. Mirrors are rebuildable and never replace SQLite authority.

Event payloads carry schema version, event ID, time, type, actor/source, linked project/task/run/artifact/policy IDs, redaction status, provenance, summary, and optional payload refs. Events support auditability for setup, doctor, task transitions, run lifecycle, heartbeat, quality gates, artifacts, policy checks, adapter degradation, backup/restore, export, rebuild, reset, and uninstall.

Evidence: `contracts/event-jsonl-contract.md`, FR-090, SC-004, and SC-018.

## Policy And Privacy

Policy evaluation wraps state-changing or trust-boundary-crossing operations before mutation. Default gated categories include destructive changes, remote writeback, permanent memory, public bind, arbitrary shell, remote provider, sensitive export, backup purge, cleanup, reset, uninstall, and disabled adapter access.

Local-only mode blocks remote PM, remote model/provider, telemetry, remote observability, public bind, and other network-dependent actions unless operator changes policy. Redaction is applied before logs, artifacts, context packs, reports, writebacks, MCP call logs, and exports expose known sensitive values.

Evidence: FR-058 through FR-064, FR-084 through FR-086, SC-003, and SC-015.

## Adapters

Adapters are replaceable wrappers:

- External PM/Plane: import, sync, link-task, writeback preview, conflict state.
- Memory: markdown, memsearch, Engram, degraded fallback.
- Code tools: exact search, structural search, repo map, repo pack, optional semantic search.
- CLI agents: command identity, roles, health, prompt support, MCP support, project availability.
- Telemetry/observability/remote providers: disabled by default, explicit opt-in, local-only blocking.

Adapter health records include state, next action, credential/privacy status, affected features, fallback behavior, and freshness. Optional adapter outages preserve local tasks, runs, context, memory, artifacts, quality gates, and recovery.

Evidence: `contracts/adapter-contract.md`, FR-050 through FR-060, SC-017.

## Surfaces

All surfaces expose same canonical IDs, statuses, degraded states, policy decisions, artifacts, quality gates, and provenance:

- CLI: human and `--json` output from same core response.
- Local API/cockpit: loopback by default; non-loopback bind requires policy approval.
- TUI: terminal dashboard over same core services.
- MCP: stdio by default; tools/resources use same schemas and policy gates.
- JSON/JSONL: machine-readable output and append-only event mirrors.
- Exports: local files with provenance and redaction status.

Cross-surface disagreement is a defect unless explicitly marked stale, partial, or degraded.

Evidence: BR-006, FR-074, FR-089, SC-012, SC-021, and SC-022.

## Go Escape Hatch

Go is allowed only after TypeScript implementation shows measured failure in one of these areas:

- process supervision reliability
- packaging or single-binary distribution
- filesystem/worktree safety
- SQLite or long-running daemon memory behavior
- platform-specific signal/process handling

Any Go addition must keep TypeScript contracts and SQLite state authoritative, ship behind same policy/provenance rules, and include evidence that TypeScript could not satisfy required behavior within release constraints.

Evidence: `SRS-ammend-02.md`, plan Technical Context, and plan Constitution Check.
