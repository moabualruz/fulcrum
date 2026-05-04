# Roadmap: Fulcrum v1.0

## Overview

Fulcrum v1.0 delivers all 16 pillars of the Agent OS to production-ready state. The roadmap moves from architecture convergence (clean data layer everything depends on) through bug stabilization, Symphony conformance (core value), infrastructure pillars, per-pillar feature completion, surface delivery, cross-cutting concerns, testing, and finally SaaS hardening. Every requirement maps to exactly one phase. No deferrals.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work
- Decimal phases (e.g. 2.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Architecture Convergence** - Single data layer, service layer, unified events, module boundaries
- [ ] **Phase 2: Bug Fixes + Foundation** - 19 confirmed bugs fixed, foundation infrastructure in place
- [ ] **Phase 3: Symphony Conformance** - Full openai/symphony SPEC.md conformance with native tracker
- [ ] **Phase 4: Agent Infrastructure** - Inference sidecar, Sandcastle dispatch, Router + Skills wiring
- [ ] **Phase 5: Task Management + Metrics** - Task comments/watchers, charts, sprint features, custom fields
- [ ] **Phase 6: Documents + Memory + Search** - TipTap editor, memory engine, unified search, Cmd+K
- [ ] **Phase 7: Repos + Artifacts + Notifications** - Git sync, artifact pipeline, notification fanout + delivery
- [ ] **Phase 8: Surface Delivery** - CLI wiring, TUI rewrite, Web completion, API surface
- [ ] **Phase 9: Cross-Cutting + Testing** - i18n, theming, accessibility, telemetry, backup, test coverage
- [ ] **Phase 10: SaaS Hardening** - Multi-org isolation, PostgreSQL pooling, job coordination, integration tests

## Phase Details

### Phase 1: Architecture Convergence
**Goal**: All business logic flows through a clean tRPC -> service -> repository -> entity stack with no raw SQL, no layering violations, and unified domain events
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, ARCH-07, ARCH-08, ARCH-09
**Success Criteria** (what must be TRUE):
  1. Every tRPC router is under 200 lines with business logic extracted to injectable service classes
  2. `ProductDb.query()` calls return zero grep hits in app code — all data access through MikroORM repositories
  3. Domain events persist to events table AND publish to EventBus through a single EventDispatcher
  4. No cross-boundary deep imports exist — barrel exports enforced, product-kernel has zero imports from web
  5. AppRouter contains zero inline `crudRouter()` stubs and zero duplicate mounts
**Plans**: TBD

### Phase 2: Bug Fixes + Foundation
**Goal**: All 19 confirmed bugs resolved and foundation infrastructure (migrations, permissions, settings, worker, surface init) in place
**Depends on**: Phase 1
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-13, BUG-14, BUG-15, BUG-16, BUG-17, BUG-18, BUG-19, FND-01, FND-02, FND-03, FND-04, FND-05
**Success Criteria** (what must be TRUE):
  1. Compiled binary launches and resolves PGlite data path on macOS + Linux without ENOENT
  2. `bun run ci` passes at root and in web — type-checks clean, no excluded paths
  3. All config operations (frontmatter, JSON, TOML, Claude settings) use targeted patchers — no whole-file rewrites
  4. Migrations run clean on both PGlite and PostgreSQL; graphile-worker bootstrapped with worker registry
  5. `assertPermission()` enforced on every tRPC procedure; `tenant_settings` entity exists
**Plans**: TBD

### Phase 3: Symphony Conformance
**Goal**: Full conformance to openai/symphony SPEC.md with Fulcrum native tracker as primary orchestration backend
**Depends on**: Phase 2
**Requirements**: SYM-01, SYM-02, SYM-03, SYM-04, SYM-05, SYM-06, SYM-07, SYM-08, SYM-09, SYM-10, SYM-11, SYM-12, SYM-13, SYM-14, SYM-15, SYM-16, SYM-17, SYM-18, SYM-19, SYM-20
**Success Criteria** (what must be TRUE):
  1. All §18.1 REQUIRED items pass — conformance test suite (§17.1-17.7) green
  2. Native tracker adapter implements fetch_candidate_issues, fetch_issues_by_states, fetch_issue_states_by_ids against Fulcrum DB
  3. Poll loop executes correct tick sequence (reconcile -> validate -> fetch -> sort -> dispatch -> notify) with observable log output
  4. Stall detection, retry backoff, multi-turn continuation, workspace safety all verified with integration tests
  5. HTTP server extension responds at GET /, /api/v1/state, /api/v1/<issue>, POST /api/v1/refresh
**Plans**: TBD

### Phase 4: Agent Infrastructure
**Goal**: Inference sidecar, Sandcastle agent dispatch, and Router + Skills system all functional end-to-end across surfaces
**Depends on**: Phase 3
**Requirements**: INF-01, INF-02, INF-03, INF-04, INF-05, SND-01, SND-02, SND-03, SND-04, SND-05, SND-06, RTR-01, RTR-02, RTR-03, RTR-04, RTR-05, RTR-06, RTR-07
**Success Criteria** (what must be TRUE):
  1. `fulcrum inference start/stop/status` controls sidecar; doctor shows sidecar health; embeddings produce 384-dim vectors
  2. Agent dispatch from any surface creates agent_runs row, executes task, and harvests artifacts via copyFileOut
  3. Rules-engine routes tasks to correct agent in unit test; no-match stores learned rule; LLM gate functional when enabled
  4. MCP servers available as virtual skills; upstream skill sync diffs and auto-merges
  5. Web routing rules editor and skill list functional; all three surfaces show routing config
**Plans**: TBD

### Phase 5: Task Management + Metrics
**Goal**: Task pillar feature-complete with comments, watchers, charts, sprint features, custom fields, and three-surface parity
**Depends on**: Phase 2 (needs graphile-worker from FND-04, clean schema from Phase 1)
**Requirements**: TSK-01, TSK-02, TSK-03, TSK-04, TSK-05, TSK-06, TSK-07, TSK-08, TSK-09, TSK-10, TSK-11, TSK-12, TSK-13, TSK-14
**Success Criteria** (what must be TRUE):
  1. Users can add comments to tasks and subscribe/unsubscribe as watchers — CRUD verified
  2. Burndown, velocity, cycle time, throughput, WIP, and CFD charts render from real event data using LayerChart
  3. Sprint capacity preview shows capacity math; retrospective notes save and load; Gantt + calendar views render
  4. Bulk operations handle 50+ tasks; custom field engine supports all 8 types; saved view filters round-trip
  5. Task CRUD + sprint management functional on Web, CLI, and TUI
**Plans**: TBD
**UI hint**: yes

### Phase 6: Documents + Memory + Search
**Goal**: Doc editor, memory engine, and unified search fully functional with three-surface parity
**Depends on**: Phase 4 (needs inference for embeddings), Phase 2 (needs schema)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06, MEM-07, MEM-08, MEM-09, SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, SRC-06, SRC-07, SRC-08
**Success Criteria** (what must be TRUE):
  1. TipTap editor saves/loads losslessly with KaTeX, Mermaid, frontmatter form, wikilinks, and doc_type-driven toolbars
  2. Doc sidebar supports drag-drop reorder; version timeline shows snapshot + delta chain with restore; read-only render works
  3. Memory extractor produces rows from transcripts; FTS + hybrid scoring retrieves correctly; context bundle assembles under token budget
  4. Unified search returns results across all 5 entity kinds with facet filters; Orama in-browser < 100ms at 10k items; Cmd+K dispatches 10+ commands
  5. All three surfaces at parity for doc CRUD, memory CRUD + search, and search
**Plans**: TBD
**UI hint**: yes

### Phase 7: Repos + Artifacts + Notifications
**Goal**: Git sync, artifact lifecycle, and notification system fully functional with delivery tracking
**Depends on**: Phase 2 (needs graphile-worker, edges table schema), Phase 4 (needs agent dispatch for artifacts)
**Requirements**: REP-01, REP-02, REP-03, REP-04, REP-05, REP-06, REP-07, ART-01, ART-02, ART-03, ART-04, ART-05, ART-06, NTF-01, NTF-02, NTF-03, NTF-04, NTF-05, NTF-06, NTF-07, NTF-08, NTF-09
**Success Criteria** (what must be TRUE):
  1. File watcher triggers repo sync within 2s; LRU cron warms top-5 remotes; multi-repo dashboard shows branch status + commits + tasks
  2. Artifact indexing pipeline runs end-to-end (run -> artifact -> search_documents); edges table links artifacts to agent runs; GC job deletes expired artifacts
  3. Notification rules evaluate on every event; in-app feed renders last 50 with unread counter; quiet hours respected
  4. SMTP + webhook delivery workers send with tracking and retry; webhook sends signed POST
  5. All three surfaces at parity for repos, artifacts, and notifications
**Plans**: TBD
**UI hint**: yes

### Phase 8: Surface Delivery
**Goal**: CLI fully wired, TUI rewritten on OpenTUI, Web component kit complete, API surface validated
**Depends on**: Phases 5-7 (backend features must exist before surface wiring)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, TUI-01, TUI-02, TUI-03, TUI-04, TUI-05, TUI-06, TUI-07, WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, WEB-07, WEB-08, WEB-09, WEB-10, WEB-11, API-01, API-02, API-03, API-04, API-05, API-06
**Success Criteria** (what must be TRUE):
  1. Every CLI command wired to tRPC — zero "not wired yet" throws; `--json` flag on every command; binary builds on macOS + Linux
  2. TUI rewritten on OpenTUI with JSX; launches without error; task CRUD, sprint board, doc browser, live run monitor all functional
  3. Full shadcn-svelte adopted across all pages; LayerChart, svelte-dnd-action, TipTap, Cmd+K all integrated; dark mode persists
  4. Every tRPC procedure has Zod-validated test; REST routes wired to real tRPC; OpenAPI spec valid at /api/v1/openapi.json
  5. Playwright e2e covers create-project, create-task, kanban-move, create-doc, search; `bun run ci` web gates pass
**Plans**: TBD
**UI hint**: yes

### Phase 9: Cross-Cutting + Testing
**Goal**: Cross-cutting concerns (i18n, theming, accessibility, telemetry, backup) delivered and comprehensive test coverage achieved
**Depends on**: Phase 8 (surfaces must exist for cross-cutting + testing)
**Requirements**: XCT-01, XCT-02, XCT-03, XCT-04, XCT-05, XCT-06, XCT-07, XCT-08, XCT-09, XCT-10, TST-01, TST-02, TST-03, TST-04, TST-05, TST-06, TST-07, TST-08, TST-09
**Success Criteria** (what must be TRUE):
  1. Locale switching works (en + 1 additional); custom themes beyond dark/light apply; WCAG 2.1 AA passes on core web flows
  2. Telemetry opt-in collects to local table; error reporting captures + displays errors; secret management encrypts at rest
  3. Backup/restore exports + imports org data; JSON + CSV import/export functional; migration downgrade tested
  4. tRPC integration tests cover all routers; Playwright e2e covers 14 user journeys; CLI + TUI tests cover all domains/screens
  5. Coverage threshold enforced in CI; Symphony conformance tests pass; gate review regression tests pass for all 13 CF/F bugs
**Plans**: TBD
**UI hint**: yes

### Phase 10: SaaS Hardening
**Goal**: Multi-tenant SaaS deployment validated with data isolation, connection pooling, and cross-instance coordination
**Depends on**: Phase 9 (full test coverage provides safety net for SaaS changes)
**Requirements**: SAS-01, SAS-02, SAS-03, SAS-04, SAS-05, SAS-06
**Success Criteria** (what must be TRUE):
  1. Multi-org data isolation verified — no cross-org data leakage via RLS or org_id scoping
  2. Auth org-switching and org member management functional end-to-end
  3. EventBus injectable for Redis/NATS in multi-instance; graphile-worker advisory locks coordinate across instances
  4. Connection pooling configured for PostgreSQL with verified pool behavior under load
  5. Integration test suite runs green against PostgreSQL (not just PGlite)
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture Convergence | 0/? | Not started | - |
| 2. Bug Fixes + Foundation | 0/? | Not started | - |
| 3. Symphony Conformance | 0/? | Not started | - |
| 4. Agent Infrastructure | 0/? | Not started | - |
| 5. Task Management + Metrics | 0/? | Not started | - |
| 6. Documents + Memory + Search | 0/? | Not started | - |
| 7. Repos + Artifacts + Notifications | 0/? | Not started | - |
| 8. Surface Delivery | 0/? | Not started | - |
| 9. Cross-Cutting + Testing | 0/? | Not started | - |
| 10. SaaS Hardening | 0/? | Not started | - |

---
*Roadmap created: 2026-05-04*
*Last updated: 2026-05-04*
