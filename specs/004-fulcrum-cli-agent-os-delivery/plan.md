# Implementation Plan: Fulcrum CLI Agent OS Full Product Delivery

**Branch**: `004-fulcrum-cli-agent-os-delivery` | **Date**: 2026-04-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-fulcrum-cli-agent-os-delivery/spec.md`

## Summary

Deliver Fulcrum as a complete local-first CLI Agent OS for one operator supervising many repositories and CLI agents. The implementation uses a TypeScript-first monorepo with shared schemas across CLI, local API, MCP tools, cockpit UI, terminal dashboard/TUI, adapters, events, SQLite persistence, and tests. SQLite is the canonical local state store. Derived indexes, context previews, graph projections, code search caches, repo maps, and memory indexes are rebuildable.

The delivery covers the full SRS scope, not a pilot or prototype: setup preview/apply, doctor/repair/uninstall, project registry, local and external PM tasks, supervised real-agent runs, deterministic validation agent runs, context packs from local evidence, code search/repo-map/repo-pack, memory writeback, terminal dashboard/TUI, worktree safety, policy gates, quality gates, artifact lifecycle, backup/restore/export/rebuild/reset, optional observability adapters, and cross-surface parity. Optional adapters for external PM, memory, semantic search, telemetry, and agent providers are visible, health-checked, replaceable, and degraded when unavailable. Go remains an escape hatch only for measured TypeScript failures in process supervision, packaging, filesystem safety, memory use, long-running daemon reliability, or single-binary distribution.

## Technical Context

**Language/Version**: TypeScript-first. Source must run on Node.js LTS and remain portable to Bun until packaging, subprocess, SQLite, and long-running behavior are proven.
**Primary Dependencies**: MCP TypeScript SDK for stdio and loopback machine interfaces; Hono or Fastify for loopback local API; React + Vite for cockpit; terminal UI package chosen during implementation for the TUI; SQLite driver with explicit SQL migrations; Zod or equivalent runtime schemas; execa or runtime-native spawn wrapper; Vitest or equivalent TypeScript test runner; Playwright for cockpit parity and accessibility flows.
**Storage**: SQLite is canonical for Fulcrum-owned state. Filesystem stores local artifacts, logs, transcripts, backups, exports, generated context packs, and managed markdown memory. Derived tables and cache directories are rebuildable and marked as such.
**Testing**: Unit, contract, integration, policy, privacy/no-network, recovery, worktree safety, adapter degradation, event replay, backup/restore, quickstart, cockpit accessibility, terminal dashboard parity, and release acceptance tests. Tests must include CLI, cockpit, terminal dashboard/TUI, JSON/JSONL, MCP, and local health parity for shared records.
**Target Platform**: Local developer machine. Default service exposure is stdio for MCP and `127.0.0.1` for local API/cockpit. Non-loopback bind requires explicit operator approval.
**Project Type**: Local CLI agent OS: CLI + local API/MCP server + cockpit UI + terminal dashboard/TUI + adapter packages + SQLite canonical state + local artifact filesystem.
**Performance Goals**: Doctor quick checks complete in under 3 seconds excluding explicit deep checks; common status operations return visible results within 1 second for the success-criteria fixture; cockpit views update live without hiding stale/degraded states; context builds remain bounded by explicit budgets; long operations stream events rather than blocking silently.
**Constraints**: Local-first core; no hidden network access; no default telemetry or remote model calls; operator approval for dangerous, destructive, externally visible, permanent-memory, public-bind, and sensitive-export actions; explicit provenance and redaction status; strict TypeScript package boundaries; SQLite transactions for state transitions; append-only events for auditable operations.
**Scale/Scope**: One operator, many local repositories/projects, many CLI agents, 25 registered project fixture, 1,000 tasks, 10,000 run events, 500 artifacts, and 100 memory entries for release validation.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Local-first core**: PASS. Setup, doctor, project registry, local tasks, runs, context from local memory/code, worktrees, artifacts, quality gates, backup/restore/export/rebuild/reset/uninstall are local workflows. Network adapters are opt-in and degraded when unavailable.
- **Operator control**: PASS. Policy decisions gate destructive, externally visible, permanent-memory, remote-provider, public-bind, and sensitive-export actions. Runs remain task-linked and operator-visible.
- **Canonical local state**: PASS. SQLite owns canonical Fulcrum records. Git, external PM systems, and agents remain authoritative only for their own domains. Derived data is rebuildable.
- **Evidence/provenance**: PASS. Context items, memory, code evidence, graph links, policy decisions, quality gates, artifacts, and events carry source refs, freshness, inclusion reason, limitations, and redaction status where applicable.
- **Minimum reinvention/adapters**: PASS. Mature tools are wrapped behind replaceable adapters. Fulcrum owns workflow semantics, lifecycle, policy, provenance, artifacts, and cross-surface consistency.
- **Security/privacy/policy**: PASS. Defaults are no remote telemetry, no remote model calls by Fulcrum core, no hidden network, loopback-only services, ignored-path respect, redaction, and local-only enforcement.
- **Incremental delivery/quality gates**: PASS. User stories are independently testable. Required gates include doctor, quickstart, policy, privacy/no-network, worktree safety, provenance, recovery, adapter degradation, and cross-surface parity.
- **TypeScript boundary discipline**: PASS. Apps and packages are separated. Core services do not depend on React. CLI, cockpit, MCP, and API call shared core services. Go is documented only as an evidence-based escape hatch.

## Project Structure

### Documentation (this feature)

```text
specs/004-fulcrum-cli-agent-os-delivery/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── adapter-contract.md
│   ├── cli-contract.md
│   ├── event-jsonl-contract.md
│   ├── local-api-cockpit-contract.md
│   └── mcp-tool-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── cli/                 # fulcrum CLI entrypoint, command wiring, human and JSON output
├── server/              # loopback local API, MCP server composition, event streams
├── cockpit/             # local cockpit UI served by server or dev tooling
└── tui/                 # terminal dashboard/TUI over shared core services

packages/
├── core/                # task/run/worktree/context/policy/backup domain services
├── db/                  # SQLite schema, migrations, repositories, transactions
├── mcp/                 # MCP tools/resources calling core services
├── plane/               # optional PM adapter, import/sync/writeback boundaries
├── memory/              # markdown, memsearch, Engram, and optional memory adapters
├── code-tools/          # ripgrep/fd/ast-grep/repo-map/repomix/semantic wrappers
├── agents/              # CLI agent wrappers, deterministic validation agent, process supervision
├── policy/              # policy evaluator, approvals, redaction, local-only gates
└── shared/              # schemas, IDs, lifecycle states, event types, API contracts

tests/
├── contract/            # CLI/API/MCP/event/adapter contract tests
├── integration/         # operator journeys and cross-surface parity tests
├── policy/              # destructive and trust-boundary gate tests
├── privacy/             # no-network, redaction, ignored-path, public-bind tests
├── recovery/            # crash, restore, rebuild, reset, uninstall tests
├── unit/                # pure domain, schema, transition, ranking, redaction tests
└── e2e/                 # cockpit accessibility and quickstart validation
```

**Structure Decision**: Use the TypeScript monorepo layout mandated by the constitution and SRS amendment 02. `packages/shared` defines schemas and stable IDs used by all surfaces. `packages/core` owns lifecycle and policy-facing services. `packages/db` owns SQLite migrations and repositories. Apps are thin surface layers for CLI, local API/MCP, cockpit, and terminal dashboard/TUI. Adapter packages expose explicit health, degraded-state, privacy, and ownership contracts. Existing deleted tracked source files are not restored by this plan; implementation tasks create or replace the TypeScript layout in the current worktree when approved.

## Complexity Tracking

No constitution violations are approved or required by this plan.

## Phase 0 Research Summary

Research decisions are recorded in [research.md](research.md). Key decisions:

- TypeScript-first monorepo with Node-compatible source and Bun evaluated as packaging/runtime target.
- MCP uses the official TypeScript SDK. Stdio is the default local process-spawned transport for agent-facing MCP. Loopback HTTP can serve cockpit/API and MCP-compatible local clients when explicitly enabled.
- SQLite is canonical local state. JSONL event files may mirror append-only events for operator inspection, but SQLite remains authoritative.
- Cockpit and terminal dashboard/TUI read local API/core projections from canonical services and never own separate workflow state.
- Adapters are replaceable and must report health, offline behavior, disablement, credential/privacy status, and provenance boundaries.

## Phase 1 Design Summary

Design artifacts:

- [data-model.md](data-model.md) defines entities, fields, relationships, lifecycle transitions, and validation rules.
- [contracts/cli-contract.md](contracts/cli-contract.md) defines CLI command shape and JSON output.
- [contracts/mcp-tool-contract.md](contracts/mcp-tool-contract.md) defines MCP tools/resources, stdio defaults, and structured errors.
- [contracts/local-api-cockpit-contract.md](contracts/local-api-cockpit-contract.md) defines loopback API/cockpit contract.
- [contracts/event-jsonl-contract.md](contracts/event-jsonl-contract.md) defines local JSONL event shape.
- [contracts/adapter-contract.md](contracts/adapter-contract.md) defines replaceable adapter behavior.
- [quickstart.md](quickstart.md) defines the clean-install operator validation scenario.

## Post-Design Constitution Check

- **Local-first core**: PASS. Contracts default to stdio and loopback. Quickstart includes no-network validation.
- **Operator control**: PASS. Data model and contracts include approval requests, policy decisions, previews, and destructive-action denials.
- **Canonical local state**: PASS. Data model identifies canonical vs derived records. Contracts require shared IDs and cross-surface parity.
- **Evidence/provenance**: PASS. Context, code, memory, artifacts, events, and exports require source references and limitations.
- **Minimum reinvention/adapters**: PASS. Adapter contract formalizes replaceable boundaries and degraded behavior.
- **Security/privacy/policy**: PASS. Privacy mode, local-only, redaction status, ignored paths, credential status, and public-bind approval are modeled.
- **Incremental delivery/quality gates**: PASS. Quickstart and tasks require independent validation per user story.
- **TypeScript boundary discipline**: PASS. Source structure and contracts keep core services separate from UI and adapters.

## Recommended Skill Calls

Use [skill-calls.md](skill-calls.md) as the full catalog. For implementation
planning, prioritize [$speckit-plan](/home/mkh/.agents/skills/speckit-plan/SKILL.md),
[$architecture-strategist](/home/mkh/.raise/profiles/vanilla/codex/skills/architecture-strategist/SKILL.md),
[$api-and-interface-design](/home/mkh/.raise/profiles/vanilla/codex/skills/api-and-interface-design/SKILL.md),
[$agent-native-architecture](/home/mkh/.raise/profiles/vanilla/codex/skills/agent-native-architecture/SKILL.md),
[$source-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/source-driven-development/SKILL.md),
[$ci-cd-and-automation](/home/mkh/.raise/profiles/vanilla/codex/skills/ci-cd-and-automation/SKILL.md),
and [$document-review](/home/mkh/.raise/profiles/vanilla/codex/skills/document-review/SKILL.md).
