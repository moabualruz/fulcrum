# Roadmap: Fulcrum v1.0

## Overview

Fulcrum v1.0 delivers all 16 pillars of the Agent OS to production-ready state. Architecture convergence first (everything depends on clean data layer), then bugs + foundation, then Symphony conformance (core value — with Sandcastle co-scheduled since Symphony depends on it per vision), then per-pillar features, surface delivery, cross-cutting, testing, and SaaS hardening. TDD woven into every phase (TST-10). No deferrals.

**Corrected 2026-05-04:** Phase ordering fixed (Sandcastle before/with Symphony per vision dependency), requirements expanded from 190 → 213 after Wave 2 audit.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work
- Decimal phases (e.g. 2.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Architecture Convergence + Security** - Single data layer, service layer, unified events, module boundaries, security fixes
- [x] **Phase 2: Bug Fixes + Foundation** - 18 bugs fixed, foundation infrastructure in place
- [x] **Phase 3: Symphony + Sandcastle** - Full SPEC.md conformance with native tracker + agent dispatch infrastructure (completed 2026-05-05)
- [ ] **Phase 4: Inference + Router/Skills** - Inference sidecar hardened, router + skills wired
- [ ] **Phase 5: Task Management + Metrics** - Task comments/watchers, charts, sprint features, custom fields
- [ ] **Phase 6: Documents + Memory + Search** - Editor verification, memory engine, unified search, Cmd+K
- [ ] **Phase 7: Repos + Artifacts + Notifications** - Git sync, artifact pipeline, notification delivery
- [ ] **Phase 8: Surface Delivery** - CLI wiring, TUI rewrite, Web completion, API surface
- [ ] **Phase 9: Cross-Cutting + Testing** - i18n, theming, accessibility, telemetry, backup, comprehensive test coverage
- [ ] **Phase 10: SaaS Hardening** - Multi-org isolation, PostgreSQL pooling, job coordination

## Phase Details

### Phase 1: Architecture Convergence + Security
**Goal**: All business logic flows through clean tRPC → service → repository → entity stack. No raw SQL, no layering violations, unified domain events, no DDL in handlers, security vulnerabilities patched.
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, ARCH-07, ARCH-08, ARCH-09, ARCH-10, ARCH-11, ARCH-12, SEC-01, SEC-02, SEC-03, SEC-04
**TDD**: RED→GREEN tests for each ARCH requirement (verify raw SQL count → 0, verify no cross-boundary imports, verify event consistency)
**Success Criteria**:
  1. `ProductDb.query()` returns zero grep hits in app code — all data access through MikroORM repositories
  2. Events table uses single consistent PK format; EventDispatcher persists + publishes in one call
  3. No ALTER TABLE in request handlers; single PGlite connection pool shared across requests
  4. Webhook secrets encrypted at rest; agent testProfile validates cliPath against allowlist
  5. AppRouter: zero stubs, zero duplicate mounts, zero cross-boundary imports
**Plans:** 10 plans
Plans:
- [x] 01-01-PLAN.md — Router cleanup: remove stub routers + duplicate mount aliases (ARCH-07, ARCH-08)
- [x] 01-02-PLAN.md — Security fixes: cliPath allowlist, webhook encryption, semgrep/gitleaks (SEC-01..04)
- [x] 01-03-PLAN.md — DDL removal: move ALTER TABLE from handlers to migrations (ARCH-11)
- [x] 01-04-PLAN.md — PGlite connection pool: singleton startup init (ARCH-10)
- [x] 01-05-PLAN.md — Product-kernel raw SQL migration to MikroORM repositories (ARCH-02)
- [x] 01-06-PLAN.md — Web server raw SQL migration: 17 files, ~120 db.query() calls (ARCH-01, ARCH-02)
- [x] 01-07-PLAN.md — Service layer extraction: TaskService, DocService, SprintService (ARCH-03)
- [x] 01-08-PLAN.md — Event unification: single EventDispatcher, remove appendEvent + RoutingEventBus (ARCH-04)
- [x] 01-09-PLAN.md — Module boundaries: fix layering violations, barrel exports, lint enforcement (ARCH-05, ARCH-06)
- [x] 01-10-PLAN.md — API consolidation + TrpcContext cleanup (ARCH-09, ARCH-12)

### Phase 2: Bug Fixes + Foundation
**Goal**: All 18 confirmed bugs resolved and foundation infrastructure in place
**Depends on**: Phase 1
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-13, BUG-14, BUG-15, BUG-16, BUG-17, BUG-18, FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07
**TDD**: RED→GREEN for each bug (write test exposing bug, then fix)
**Success Criteria**:
  1. Compiled binary launches on macOS + Linux without ENOENT
  2. `bun run ci` passes at root and web — type-checks clean
  3. graphile-worker bootstrapped with extensible registry; migrations clean on PGlite + PostgreSQL
  4. `assertPermission()` enforced on every tRPC procedure; `tenant_settings` entity exists
  5. Cmd+K keyboard shortcut opens palette in web layout
**Plans:** 8 plans
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — CI and web gates: stable root CI, smoke e2e, release-only skills/compress, cookie advisory (BUG-03, BUG-04, BUG-16)
- [x] 02-02-PLAN.md — Compiled binary + DB backend config: PGlite default, PostgreSQL override, explicit migrate (BUG-01, FND-01)
- [x] 02-03-PLAN.md — Installer ownership and package/component parity safety (BUG-02, BUG-06, BUG-07, BUG-08, BUG-10, BUG-11, BUG-14)

**Wave 2 (blocked on relevant Wave 1 foundations)**
- [x] 02-04-PLAN.md — Byte-stable frontmatter and targeted JSON/TOML config patchers (BUG-05, BUG-13)
- [x] 02-05-PLAN.md — Product CLI parser, doctor warnings, complexity hotspots, Cmd+K shortcut (BUG-09, BUG-12, BUG-15, BUG-18)
- [x] 02-06-PLAN.md — Tenant settings, migration/index verification, canonical flags (FND-01, FND-03, FND-06, FND-07)
- [x] 02-07-PLAN.md — Permission enforcement lint and explicit tRPC resource/action checks (FND-02)

**Wave 3 (blocked on DB, flags, permissions foundations)**
- [x] 02-08-PLAN.md — Worker registry and Web/CLI/TUI auth parity; BUG-17 repo sync completed (FND-04, FND-05, BUG-17)

Cross-cutting constraints:
- RED tests/repros are committed before GREEN fixes for every bug where feasible.
- Plans touching schema must run explicit `fulcrum db migrate` verification.
- `bun run ci` remains final phase gate.

### Phase 3: Symphony + Sandcastle
**Goal**: Full Symphony SPEC.md conformance with native Fulcrum tracker + Sandcastle agent dispatch functional
**Depends on**: Phase 2
**Requirements**: SYM-01..27, SND-01..06
**TDD**: Symphony conformance test suite (§17.1-17.7) written RED then driven GREEN
**Success Criteria**:
  1. All §18.1 REQUIRED items pass — conformance tests green including continuation retry, reconciliation, token accounting
  2. Native tracker adapter returns full 12-field Issue model; blocked_by as `{id, identifier, state}` objects
  3. Dynamic WORKFLOW.md reload functional; stall detection checks last_codex_timestamp first
  4. noSandbox + claudeCode dispatches task end-to-end, harvests artifacts
  5. HTTP server extension responds at all 4 endpoints; approval posture documented
**Plans**: TBD

### Phase 4: Inference + Router/Skills
**Goal**: Inference sidecar hardened, router + skills fully wired across surfaces
**Depends on**: Phase 3
**Requirements**: INF-01..07, RTR-01..08
**TDD**: Inference contract tests; rules-engine unit tests; skill loader tests
**Success Criteria**:
  1. Embeddings produce 384-dim vectors in `vector(384)` columns; cosine >= 0.9 for paraphrase pair
  2. `fulcrum inference start/stop/status` functional; doctor shows sidecar health
  3. Rules-engine routes tasks; no-match stores learned rule; LLM gate works when enabled
  4. MCP servers as virtual skills; upstream sync; skills.lock.json SHA-256 validated
  5. Web routing editor + skill list functional on all three surfaces
**Plans:** 8 plans
Plans:
**Wave 1**
- [x] 04-01-PLAN.md — Wave 0 validation scaffolds for static proof, embeddings, router evals, MCP, and lock gates (completed 2026-05-05)
- [x] 04-02-PLAN.md — Embedding model metadata and 384-dimension write/read/search enforcement

**Wave 2**
- [x] 04-03-PLAN.md — Inference backend health, CLI, tRPC, doctor, and static proof command (completed 2026-05-05)
- [x] 04-05-PLAN.md — MCP virtual skills plus skill lock/sync fail-closed supply-chain controls

**Wave 3**
- [x] 04-04-PLAN.md — Router decision service, disabled learned drafts, conflicts, audit, and LLM fallback safety

**Wave 4**
- [x] 04-06-PLAN.md — Routing/skills tRPC plus CLI/TUI parity
- [x] 04-07-PLAN.md — Web routing editor and inference backend status UI

**Wave 5**
- [x] 04-08-PLAN.md — Root wiring, LangGraph boundary guard, parity tests, and final verification gates

### Phase 5: Task Management + Metrics
**Goal**: Task pillar feature-complete with comments, watchers, charts, sprint features
**Depends on**: Phase 2 (graphile-worker), Phase 1 (clean schema)
**Requirements**: TSK-01..14
**TDD**: RED tests for missing features (comments, watchers, charts), then GREEN implementation
**Success Criteria**:
  1. task_comments + task_watchers entities with CRUD verified
  2. Burndown, velocity, cycle time, throughput, WIP, CFD render from real data via LayerChart
  3. Sprint capacity + retrospective notes; Gantt + calendar views render
  4. Bulk ops handle 50+ tasks; custom fields all 8 types verified; saved view filters round-trip
  5. Task CRUD + sprint management functional on Web, CLI, and TUI (per TSK-14 parity definition)
**Plans**: TBD
**UI hint**: yes

### Phase 6: Documents + Memory + Search
**Goal**: Doc editor verified, memory engine hardened, unified search with Cmd+K
**Depends on**: Phase 4 (inference for embeddings), Phase 2 (schema)
**Requirements**: DOC-01..12, MEM-01..09, SRC-01..09
**TDD**: Verification tests for existing features (TipTap, KaTeX, Mermaid); RED tests for gaps (doc_comments, applyDelta fix, search endpoint, Orama)
**Success Criteria**:
  1. TipTap save+load lossless; KaTeX + Mermaid render; frontmatter round-trips; doc_comments with threading
  2. Version timeline with incremental delta support; drag-drop tree reorder
  3. SearchDocument fully populated; search tRPC endpoint exposed; unified FTS across all entity kinds
  4. Orama in-browser < 100ms at 10k items; Cmd+K dispatches 10+ commands with keyboard shortcut
  5. All three surfaces at parity per DOC-12, MEM-09, SRC-09 definitions
**Plans**: TBD
**UI hint**: yes

### Phase 7: Repos + Artifacts + Notifications
**Goal**: Git sync complete, artifact lifecycle hardened, notification delivery functional
**Depends on**: Phase 2 (graphile-worker), Phase 3 (agent dispatch for artifacts)
**Requirements**: REP-01..07, ART-01..06, NTF-01..09
**TDD**: Tests for LRU cron, artifact pruner, delivery handlers, quiet hours retry
**Success Criteria**:
  1. File watcher syncs within 2s; LRU cron warms top-5 remotes; multi-repo dashboard
  2. Artifact harvest → search indexing verified; retention policies table; pruner cron functional
  3. Delivery workers process SMTP + webhook + push; bell counts unread notifications; quiet hours retry scheduler
  4. Notification rules CRUD in web; CLI notifications wired
  5. All three surfaces at parity per REP-07, ART-06, NTF-09 definitions
**Plans**: TBD
**UI hint**: yes

### Phase 8: Surface Delivery
**Goal**: CLI fully wired, TUI rewritten on OpenTUI, Web complete, API surface validated
**Depends on**: Phases 5-7 (backend features must exist)
**Requirements**: CLI-01..07, TUI-01..08, WEB-01..11, API-01..05
**TDD**: CLI command tests; TUI screen tests; Playwright e2e; API Zod validation tests
**Success Criteria**:
  1. Every CLI command wired — zero "not wired yet"; 15 domains covered; `--json` everywhere; binary builds
  2. TUI on OpenTUI with JSX (or ratatui fallback if OpenTUI insufficient); all screens functional via tRPC
  3. shadcn-svelte verified; LayerChart, DnD, TipTap confirmed; Playwright covers 14 journeys
  4. Single REST API with valid OpenAPI spec; rate limiting; every procedure Zod-tested
  5. Dead code removed: `app.ts` in TUI, stub routers, generated stubs replaced with real implementations
**Plans**: TBD
**UI hint**: yes

### Phase 9: Cross-Cutting + Testing
**Goal**: Cross-cutting concerns delivered and comprehensive test coverage verified
**Depends on**: Phase 8 (surfaces must exist)
**Requirements**: XCT-01..12, TST-01..10
**TDD**: Final coverage sweep — any remaining RED tests from prior phases
**Success Criteria**:
  1. i18n + custom themes + WCAG 2.1 AA (axe-core verified)
  2. Telemetry opt-in + error reporting + secret encryption + audit logging
  3. Backup/restore + import/export + migration downgrade + graceful shutdown
  4. Coverage threshold 80% enforced in CI; Symphony conformance green; gate regression tests pass
  5. TDD evidence: every phase has RED→GREEN commit pairs in git history
**Plans**: TBD
**UI hint**: yes

### Phase 10: SaaS Hardening
**Goal**: Multi-tenant SaaS validated
**Depends on**: Phase 9
**Requirements**: SAS-01..06
**TDD**: Integration tests against PostgreSQL
**Success Criteria**:
  1. Multi-org data isolation — zero cross-org leakage
  2. Auth org-switching + member management functional
  3. EventBus injectable; graphile-worker advisory locks coordinate cross-instance
  4. Connection pooling configured + verified under load
  5. Full integration test suite green against PostgreSQL
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture + Security | 0/10 | Planned | - |
| 2. Bug Fixes + Foundation | 8/8 | Complete | 2026-05-04 |
| 3. Symphony + Sandcastle | 6/6 | Complete   | 2026-05-05 |
| 4. Inference + Router/Skills | 8/8 | Complete | 2026-05-05 |
| 5. Task Management + Metrics | 0/? | Not started | - |
| 6. Documents + Memory + Search | 0/? | Not started | - |
| 7. Repos + Artifacts + Notifications | 0/? | Not started | - |
| 8. Surface Delivery | 0/? | Not started | - |
| 9. Cross-Cutting + Testing | 0/? | Not started | - |
| 10. SaaS Hardening | 0/? | Not started | - |

---
*Roadmap created: 2026-05-04*
*Last corrected: 2026-05-04 after Wave 2 audit*
