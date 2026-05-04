# Fulcrum Master Audit Report

> Generated: 2026-05-04
> Source: 6 parallel audit agents against REQUIREMENTS.md (16 pillars)
> Canonical spec: `.scratch/agent-os-vision/REQUIREMENTS.md`

---

## Executive Summary

Fulcrum has **substantial code** (~140K lines src/, 58K web) but **deep implementation gaps** against the 16-pillar vision. The agent-os-vision "342 completed issues" were **PRD/design work, not code**. Every pillar is PARTIAL at best. Zero tests written from 108 planned. Architecture has structural debt (dual data layer, no service layer, 3 event mechanisms).

**Overall completeness: ~55% of vision requirements implemented in code.**

---

## Pillar Reality Matrix

| # | Pillar | Status | Completion | Critical Gap |
|---|--------|--------|-----------|--------------|
| 1 | Foundation Reset | EXISTS | 85% | No lint-enforced assertPermission; no tenant_settings; graphile-worker not bootstrapped |
| 2 | Inference Sidecar | EXISTS | 80% | 384 vs 1536 dim mismatch; binary pipeline unverified |
| 3 | Symphony Orchestration | EXISTS | 85% | Web dashboard + TUI monitor missing; conformance trace doc absent |
| 4 | Sandcastle Wrapper | EXISTS | 80% | Web/TUI dispatch missing; docker doctor warning absent |
| 5 | Auto-Router + Skills | EXISTS | 85% | MCP-as-virtual-skills missing; web routing editor unverified |
| 6 | Tasks + Sprints | PARTIAL | 65% | **No burndown/velocity charts**; no task_comments/watchers; no metrics rollup; no Gantt/calendar |
| 7 | Docs + Block Editor | PARTIAL | 70% | No KaTeX/Mermaid; no frontmatter YAML form; no drag-drop tree reorder |
| 8 | Memory + Context | EXISTS | 85% | 384 vs 1536 dim mismatch; web/TUI memory browser unverified |
| 9 | Repos + Git | PARTIAL | 60% | REST API stub; no multi-repo dashboard; no LRU cron; generated CLI unwired |
| 10 | Artifacts | PARTIAL | 55% | No search indexing pipeline; no edges table; no GC worker; no retention policies table |
| 11 | Search | PARTIAL | 50% | SearchDocument stub; Orama not installed; Cmd+K not bound; API hardcoded |
| 12 | Notifications | PARTIAL | 45% | No web feed page; bell counts wrong thing; no delivery handlers; CLI unwired |
| 13 | API Surface | PARTIAL | 50% | REST routes all stub stores; no webhook subscriptions; no outbound webhooks |
| 14 | CLI Codegen | PARTIAL | 40% | **49 generated commands ALL throw "not wired yet"**; no `fulcrum task` command |
| 15 | TUI | PARTIAL | 55% | Not using OpenTUI; no JSX components; live streaming unclear |
| 16 | Web App | PARTIAL | 60% | LayerChart not installed; DnD unused; TipTap not in doc editor; no Gantt/calendar |

---

## Architectural Red Flags

### A1. Dual Data Layer (CRITICAL)
- **product-kernel**: 713 lines raw SQL in `repositories.ts`, 171 raw SQL calls in `src/web/src/lib/server/`
- **MikroORM**: entities + repositories in `src/db/`
- Both active and growing. `TrpcContext` exposes both: `em` (ORM) + `db` (raw SQL)
- **Impact**: 171 web raw SQL calls bypass tRPC → no permission middleware, no Zod validation, no audit trail

### A2. Layering Violation
- `src/product-kernel/api/router.ts` imports `updateTaskAction`, `deleteTaskAction` FROM `src/web/src/lib/server/tasks.ts`
- Backend service imports from web presentation layer — inverts dependency rule

### A3. No Service Layer
- Business logic lives inside tRPC routers (docs.ts = 763 lines, tasks.ts = 508 lines)
- Routers handle: serialization, event emission, repository resolution, bulk patching, search indexing, narration — all inline

### A4. Three Event Mechanisms
- `src/subscriptions/event-bus.ts` — process-singleton EventBus
- `src/router/event-bus.ts` — separate RoutingEventBus
- `events` table via `appendEvent()` in product-kernel
- No unifying abstraction

### A5. Process-Singleton EventBus
- `getEventBus()` returns singleton — won't scale to multi-instance SaaS

### A6. No Module Boundary Enforcement
- No barrel exports, any file imports from any other file across entire `src/`

### A7. Stub Routers in AppRouter
- ~15 inline CRUD stubs return empty arrays, coexist with real implementations
- Duplicate mounts: `skills`/`fulcrum_skills`, `memory`/`memories`, `runs`/`agent_runs`

---

## Confirmed Bugs (19)

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Compiled binary ENOENT for PGlite | critical | unresolved |
| 2 | Claude plugin uninstall not ownership-gated | critical | unresolved |
| 3 | Web type-check fails (missing bun:test types) | high | unresolved |
| 4 | Root CI excludes web checks | high | unresolved |
| 5 | Frontmatter YAML not byte-stable | high | unresolved |
| 6 | Claude settings cleanup deletes broad keys | high | unresolved |
| 7 | Claude cache/marketplace removals too broad | high | unresolved |
| 8 | Install auto-invokes Claude CLI plugin commands | high | unresolved |
| 9 | Local main 41 commits ahead of origin | high | unresolved |
| 10 | Product CLI flag parser positional bug | medium | unresolved |
| 11 | component status reports ledger not filesystem | medium | unresolved |
| 12 | Package parity over-trusts native roots | medium | unresolved |
| 13 | Doctor ignores product-kernel DB errors in verdict | medium | unresolved |
| 14 | JSON/TOML config whole-file rewrites across agents | medium | unresolved |
| 15 | Vendor mirrors overwrite top-level skill names | medium | unresolved |
| 16 | Semgrep 14 findings (regexp, IFS) | medium | unresolved |
| 17 | Gitleaks 18 historical leaks | medium | unresolved |
| 18 | Complexity warnings (CCN 18-59) | low | unresolved |
| 19 | cookie@0.6.0 low advisory in web lockfile | low | unresolved |

---

## Cross-Cutting Gaps (17)

| # | Gap | Priority |
|---|-----|----------|
| 1 | Zero test coverage — 108 issues planned, none executed | P0 |
| 2 | Web shell not product-grade (PRD vs reality) | P0 |
| 3 | 49 CLI generated commands non-functional | P0 |
| 4 | REST API routes all stub stores | P1 |
| 5 | No burndown/velocity/chart rendering (LayerChart not installed) | P1 |
| 6 | task_comments + task_watchers entities missing | P1 |
| 7 | No graphile-worker formal bootstrap | P1 |
| 8 | Orama in-browser search not installed | P1 |
| 9 | TipTap not integrated into doc editor routes | P1 |
| 10 | svelte-dnd-action installed but unused | P1 |
| 11 | Migration downgrade strategy absent | P2 |
| 12 | i18n/l10n not started | P2 |
| 13 | Theming beyond dark/light | P2 |
| 14 | Telemetry/analytics not started | P2 |
| 15 | Error reporting/observability | P2 |
| 16 | TUI accessibility incomplete | P2 |
| 17 | License/CONTRIBUTING governance not PRD'd | P3 |

---

## Unimplemented Recommendations (11)

1. Per-plugin ownership markers for Claude install/uninstall
2. Targeted agent config patchers (patch not rewrite)
3. Marker-gate every top-level skill/cache removal
4. Agent backups in `~/.fulcrum/state/global/backups`
5. Wire `src/web` check/build into root CI
6. Frontmatter patcher (not parse/stringify)
7. Component status should inspect filesystem not ledger
8. Doctor should increment warnings on product DB errors
9. Replace ad-hoc product CLI parser with tested parser
10. Enforce coverage threshold in CI
11. Push local main to origin (41 commits behind)

---

## Pending Human Decision

| # | Decision | Context |
|---|----------|---------|
| 1 | shadcn-svelte + adapter-node: adopt per PRD or ratify current deviation? | Web shell PRD requires shadcn-svelte but current implementation uses different approach |

---

## Three-Surface Parity Failure

**EVERY pillar fails three-surface parity** (Web + CLI + TUI). Pattern:
- Web: furthest along but missing key libraries (LayerChart, Orama, svelte-dnd-action wiring)
- CLI: hand-written commands work, 49 generated commands dead code
- TUI: screens exist but data wiring to tRPC unclear, not using OpenTUI per spec

---

## Recommended Work Order

### Phase 0: Architecture Convergence (prerequisite for everything)
1. Eliminate product-kernel → web import (layering violation)
2. Introduce service layer (extract from 763-line docs router, 508-line tasks router)
3. Converge on single data access pattern (migrate 171 raw SQL calls to MikroORM)
4. Unify event mechanisms
5. Add module boundaries (barrel exports)
6. Remove stub routers and duplicate mounts from AppRouter

### Phase 1: Critical Bugs (19 bugs, 2 critical)
Fix all 19 bugs, critical first.

### Phase 2: Missing Schema + Infrastructure
1. Add task_comments, task_watchers entities
2. Bootstrap graphile-worker formally
3. Add tenant_settings entity
4. Add artifact_retention_policies table
5. Add edges table for cross-domain relationships
6. Add webhook_subscriptions entity
7. Fix 384 vs 1536 embedding dimension mismatch

### Phase 3: Wire Dead Code
1. Wire 49 CLI generated commands to actual tRPC calls
2. Wire REST API routes to real DB (replace stub stores)
3. Wire Cmd+K keyboard shortcut
4. Integrate TipTap into doc editor routes
5. Wire svelte-dnd-action into board
6. Install + integrate LayerChart for burndown/velocity
7. Install + integrate Orama for in-browser search

### Phase 4: Missing Features per Pillar
Per-pillar completion of remaining done-criteria items.

### Phase 5: Three-Surface Parity
Bring CLI + TUI to feature parity with Web for each pillar.

### Phase 6: Cross-Cutting Concerns
i18n, theming, telemetry, error reporting, accessibility, backup/restore.

### Phase 7: Test Coverage
Full TDD pass across all 108+ test scenarios.

### Phase 8: SaaS Hardening
Multi-user, multi-org, connection pooling, injectable EventBus, RLS verification.
