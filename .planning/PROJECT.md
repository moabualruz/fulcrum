# Fulcrum

## What This Is

Fulcrum is a 16-pillar Agent OS — a Jira+Confluence-grade project management and AI orchestration platform that runs local-first on PGlite/Bun with a path to multi-tenant SaaS on PostgreSQL. It provides task management, document editing, AI agent orchestration (Symphony-conformant), memory/context engines, search, notifications, and three delivery surfaces: Web (SvelteKit + shadcn-svelte), CLI (Bun binary), and TUI (OpenTUI JSX).

## Core Value

Every AI agent workflow — from task triage through code generation to artifact delivery — runs through one integrated, self-hosted platform with full Symphony spec conformance, using Fulcrum's native tracker as the primary orchestration backend.

## Current Milestone: v1.0 Complete Product Delivery

**Goal:** Deliver all 16 pillars to production-ready state with zero deferrals — architecture converged, all bugs fixed, dead code wired, three-surface parity achieved, full test coverage, Symphony spec fully conformant.

**Target features:**
- Architecture convergence (single data layer, service layer, unified events, module boundaries)
- 19 confirmed bugs fixed (2 critical, 6 high, 8 medium, 3 low)
- Missing schema + infrastructure (task_comments, task_watchers, graphile-worker, edges, webhooks, embedding dims)
- Wire dead code (49 CLI commands, REST API stubs, Cmd+K, TipTap, svelte-dnd-action, LayerChart, Orama)
- Per-pillar feature completion against REQUIREMENTS.md done-criteria
- Three-surface parity: Web (full shadcn-svelte) + CLI (wired codegen) + TUI (OpenTUI rewrite)
- Full Symphony spec conformance with native Fulcrum tracker (external trackers as ingest adapters)
- Cross-cutting: i18n, theming, telemetry, error reporting, accessibility, backup/restore
- Test coverage (TDD across all surfaces) + SaaS hardening (multi-user integration tests)

**Current status:** Phases 1-9 complete. Phase 09 final UAT passed on 2026-05-06 with all `XCT-01..12` and `TST-01..10` requirements marked complete; final `bun run ci` passed. Next phase: 10 SaaS Hardening.

## Requirements

### Validated

- ✓ PGlite local DB + MikroORM v7 entities — v0.x
- ✓ Better Auth v1 integration — v0.x
- ✓ Feature flag registry (FULCRUM_FEATURES) — v0.x
- ✓ Rust inference sidecar (fastembed + JSON-RPC) — v0.x
- ✓ Symphony orchestration core (tracker, dispatch, retry, workspace, hooks, prompt, stall) — v0.x
- ✓ Sandcastle wrapper with agent profiles — v0.x
- ✓ Auto-router with json-rules-engine + LLM fallback — v0.x
- ✓ Skills loader with per-agent distribution — v0.x
- ✓ Memory retriever (BM25 + hybrid scoring) + context assembler — v0.x
- ✓ Heuristic memory extractor — v0.x
- ✓ SvelteKit web app shell (60+ routes) — v0.x
- ✓ CLI with hand-written commands (15+ domains) — v0.x
- ✓ TUI with 40+ screens (custom renderer) — v0.x

### Active

See `.planning/REQUIREMENTS.md` for full REQ-ID list.

### Out of Scope

- Mobile native app — web-first, responsive later
- Real-time collaborative editing — Yjs/collab gated, not v1.0 priority
- Third-party marketplace hosting — local skill distribution only for v1.0
- Custom workflow designer UI — WORKFLOW.md file-based per Symphony spec

## Context

- Canonical spec: `.scratch/agent-os-vision/REQUIREMENTS.md` (16 pillars)
- Master audit: `.scratch/master-audit/AUDIT-REPORT.md` (~55% complete)
- Symphony spec: `vendor/openai-symphony/SPEC.md` (full conformance required)
- Existing conformance trace: `docs/symphony-conformance.md`
- Stack: Bun + MikroORM v7 + PGlite (local) / PostgreSQL (SaaS) + SvelteKit + tRPC + Rust inference
- Architecture debt: dual data layer (product-kernel raw SQL vs MikroORM), no service layer, 3 event mechanisms, layering violation (product-kernel imports from web)

## Constraints

- **Symphony conformance**: Full adherence to openai/symphony SPEC.md — no deviations except using Fulcrum native tracker instead of Linear as primary
- **Stack**: Bun runtime, MikroORM v7 (no raw SQL in app code), PGlite local / PostgreSQL SaaS
- **Web**: shadcn-svelte component kit (full adoption per PRD)
- **TUI**: OpenTUI with JSX components (rewrite from current custom renderer)
- **Data access**: All business logic behind tRPC procedures — no surface owns business logic
- **Local-first**: Implementation priority local → SaaS. SaaS planned + integration-tested but built last
- **Feature flags**: All gated features use FULCRUM_FEATURES env var
- **No deferrals**: Every pillar to done-criteria. No MVP carve-outs.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| shadcn-svelte full adoption | PRD requires it; partial adoption creates inconsistency | — Pending |
| OpenTUI rewrite (not keep custom TUI) | Requirements spec JSX components; 40+ screens rewritten | — Pending |
| Fulcrum native tracker as Symphony primary | No dependency on Linear/3rd party; can ingest from external | — Pending |
| Single data layer (MikroORM only) | Dual layer creates 171 unguarded SQL paths; converge to ORM | — Pending |
| Service layer between tRPC and repositories | 763-line router files contain business logic; extract to services | — Pending |
| Unified event mechanism | 3 event buses → 1 domain event dispatcher | — Pending |
| Local-first then SaaS | User priority; SaaS planned but implemented last | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-04 after milestone v1.0 initialization*
