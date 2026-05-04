# Requirements: Fulcrum v1.0

**Defined:** 2026-05-04
**Core Value:** Every AI agent workflow runs through one integrated, self-hosted platform with full Symphony spec conformance.

## v1 Requirements

### Architecture Convergence (ARCH)

- [ ] **ARCH-01**: All business logic accessed through tRPC procedures — no surface (web/CLI/TUI) owns business logic directly
- [ ] **ARCH-02**: Single data access layer (MikroORM) — all product-kernel raw SQL migrated to repositories, `ProductDb.query()` removed from app code
- [ ] **ARCH-03**: Service layer exists between tRPC routers and repositories — routers under 200 lines, business logic in injectable services
- [ ] **ARCH-04**: Unified domain event mechanism — single EventDispatcher that persists to events table + publishes to EventBus
- [ ] **ARCH-05**: Module boundary enforcement — barrel exports per module, no cross-boundary deep imports
- [ ] **ARCH-06**: No layering violations — product-kernel never imports from web; dependency direction: web → tRPC → services → repositories → entities
- [ ] **ARCH-07**: Stub routers removed from AppRouter — no inline `crudRouter()` stubs returning empty arrays
- [ ] **ARCH-08**: No duplicate router mounts — single canonical name per domain (no skills/fulcrum_skills aliases)
- [ ] **ARCH-09**: TrpcContext carries only ORM path — `db?: ProductDb` field removed after ARCH-02 complete

### Bug Fixes (BUG)

- [ ] **BUG-01**: Compiled binary resolves PGlite data path correctly (critical — ENOENT `/$bunfs/root/pglite.data`)
- [ ] **BUG-02**: Claude plugin uninstall gated by ownership markers (critical — prevents removing user-installed plugins)
- [ ] **BUG-03**: Web type-check passes with correct `bun:test` type handling
- [ ] **BUG-04**: Root CI includes web checks (`src/web/**` not excluded from tsconfig)
- [ ] **BUG-05**: Frontmatter YAML round-trips byte-stable (patcher approach, not parse/stringify)
- [ ] **BUG-06**: Claude settings cleanup scoped to Fulcrum-owned keys only
- [ ] **BUG-07**: Claude cache/marketplace removals marker-gated
- [ ] **BUG-08**: Agent install does not auto-invoke Claude CLI plugin commands without confirmation
- [ ] **BUG-09**: Product CLI flag parser handles positional args correctly
- [ ] **BUG-10**: Component status inspects filesystem, not ledger state
- [ ] **BUG-11**: Package parity validates native roots, not over-trusts
- [ ] **BUG-12**: Doctor increments warnings on product-kernel DB errors
- [ ] **BUG-13**: JSON/TOML config uses targeted patchers, not whole-file rewrites
- [ ] **BUG-14**: Vendor mirrors do not overwrite top-level skill/command names
- [ ] **BUG-15**: Semgrep 14 findings resolved (non-literal regexp, IFS)
- [ ] **BUG-16**: Gitleaks 18 historical findings addressed (rotate or verify non-sensitive)
- [ ] **BUG-17**: Complexity hotspots (CCN 18-59) refactored below threshold
- [ ] **BUG-18**: cookie@0.6.0 advisory resolved in web lockfile
- [ ] **BUG-19**: Local main synced with origin (41 commits ahead)

### Foundation — Pillar 1 (FND)

- [ ] **FND-01**: Migrations run clean on both PGlite and PostgreSQL with CI verification
- [ ] **FND-02**: `assertPermission()` enforced via lint rule on every tRPC procedure
- [ ] **FND-03**: `tenant_settings` entity exists with per-org configuration
- [ ] **FND-04**: graphile-worker formally bootstrapped with worker registry
- [ ] **FND-05**: All three surfaces (Web/CLI/TUI) reach init/auth parity

### Inference Sidecar — Pillar 2 (INF)

- [ ] **INF-01**: Embedding dimension consistency — 384-dim fastembed vectors stored in correctly-sized column (not 1536)
- [ ] **INF-02**: Static binary build pipeline verified on macOS + Linux
- [ ] **INF-03**: `fulcrum inference start/stop/status` CLI commands functional
- [ ] **INF-04**: Doctor shows sidecar status (running/stopped/errored)
- [ ] **INF-05**: All inference backends tested with real model calls (not just mocks)

### Symphony Orchestration — Pillar 3 (SYM)

- [ ] **SYM-01**: Full conformance to openai/symphony SPEC.md §18.1 — all REQUIRED items pass
- [ ] **SYM-02**: Fulcrum native tracker adapter implements all 3 REQUIRED operations (fetch_candidate_issues, fetch_issues_by_states, fetch_issue_states_by_ids)
- [ ] **SYM-03**: External tracker adapters (Linear, GitHub Issues) available as ingest-only connectors
- [ ] **SYM-04**: Poll loop tick sequence matches spec: reconcile → validate → fetch → sort → dispatch → notify
- [ ] **SYM-05**: Issue orchestration states match spec: Unclaimed → Claimed → Running/RetryQueued → Released
- [ ] **SYM-06**: Multi-turn continuation: successful exit → 1s continuation retry, re-check tracker, same thread
- [ ] **SYM-07**: Retry backoff: `min(10000 * 2^(attempt-1), max_retry_backoff_ms)` with configurable cap
- [ ] **SYM-08**: Stall detection kills worker + queues retry when event inactivity exceeds `stall_timeout_ms`
- [ ] **SYM-09**: Workspace safety: cwd == workspace_path, path inside root, key sanitized `[A-Za-z0-9._-]`
- [ ] **SYM-10**: All 4 lifecycle hooks (after_create, before_run, after_run, before_remove) with timeout config
- [ ] **SYM-11**: Strict prompt rendering — unknown variables/filters MUST fail
- [ ] **SYM-12**: Dynamic WORKFLOW.md reload without restart; invalid reload keeps last good config
- [ ] **SYM-13**: Candidate sorting: priority asc → created_at oldest → identifier lexicographic
- [ ] **SYM-14**: Blocker rule: Todo state with non-terminal blockers = ineligible
- [ ] **SYM-15**: Per-state concurrency limits via `max_concurrent_agents_by_state`
- [ ] **SYM-16**: Reconciliation stops runs on terminal/non-active tracker states
- [ ] **SYM-17**: Startup terminal workspace cleanup
- [ ] **SYM-18**: Conformance tests pass for all §17.1-17.7 categories
- [ ] **SYM-19**: HTTP server extension (GET /, /api/v1/state, /api/v1/<issue>, POST /api/v1/refresh)
- [ ] **SYM-20**: Token accounting per spec — cumulative totals, no double-counting, keyed by thread_id

### Sandcastle — Pillar 4 (SND)

- [ ] **SND-01**: noSandbox + claudeCode dispatches task and writes agent_runs row end-to-end
- [ ] **SND-02**: copyFileOut (artifact harvest) produces artifact entity from sandbox output
- [ ] **SND-03**: Adapter-swap test: AgentRun interface unchanged across providers
- [ ] **SND-04**: Doctor warns if Docker absent when sandbox-docker flag enabled
- [ ] **SND-05**: Session JSONL capture and resumeSession tested
- [ ] **SND-06**: Web + CLI + TUI can all dispatch agent runs

### Router + Skills — Pillar 5 (RTR)

- [ ] **RTR-01**: Rules-engine routes matching task in unit test
- [ ] **RTR-02**: No-match path stores learned rule in DB
- [ ] **RTR-03**: LLM routing gate off by default, functional when enabled
- [ ] **RTR-04**: Upstream skill sync diffs and auto-merges
- [ ] **RTR-05**: MCP servers available as virtual skills
- [ ] **RTR-06**: Web routing rules editor functional
- [ ] **RTR-07**: All three surfaces show routing config and skill list

### Tasks + Sprints — Pillar 6 (TSK)

- [ ] **TSK-01**: task_comments entity with CRUD (create, list, delete)
- [ ] **TSK-02**: task_watchers entity with subscribe/unsubscribe
- [ ] **TSK-03**: Burndown chart renders from events log using LayerChart
- [ ] **TSK-04**: Velocity rollup chart functional
- [ ] **TSK-05**: Cycle time + throughput + WIP + CFD reports
- [ ] **TSK-06**: metrics_cache rollup worker (graphile-worker job) with invalidation
- [ ] **TSK-07**: Sprint capacity preview with capacity math
- [ ] **TSK-08**: Sprint retrospective notes field
- [ ] **TSK-09**: Gantt view renders task timeline with dependencies
- [ ] **TSK-10**: Calendar view renders tasks by due date
- [ ] **TSK-11**: Bulk operations tested with 50+ tasks
- [ ] **TSK-12**: Custom field engine all 8 types end-to-end verified
- [ ] **TSK-13**: Saved view filter AST round-trips and renders correctly
- [ ] **TSK-14**: All three surfaces at parity for task CRUD + sprint management

### Docs + Editor — Pillar 7 (DOC)

- [ ] **DOC-01**: TipTap editor integrated into doc edit routes (save + load lossless)
- [ ] **DOC-02**: Frontmatter form with Zod-validated TipTap block + raw YAML toggle
- [ ] **DOC-03**: KaTeX extension for math rendering
- [ ] **DOC-04**: Mermaid extension for diagram rendering
- [ ] **DOC-05**: Drag-drop tree reorder in doc sidebar
- [ ] **DOC-06**: Version timeline UI with snapshot + delta chain restore
- [ ] **DOC-07**: Wikilink writes doc_links row on save
- [ ] **DOC-08**: doc_type drives distinct toolbar configurations
- [ ] **DOC-09**: context_summary extraction on save (headings + wikilinks + mentions)
- [ ] **DOC-10**: Read-only render via remark + unified + shiki + DOMPurify
- [ ] **DOC-11**: All three surfaces at parity for doc CRUD + browsing

### Memory + Context — Pillar 8 (MEM)

- [ ] **MEM-01**: Embedding column sized to match actual model dimensions (384 for fastembed)
- [ ] **MEM-02**: Heuristic extractor produces memory rows from sample transcript verified
- [ ] **MEM-03**: FTS retrieval ranks project + global rows correctly
- [ ] **MEM-04**: Context bundle assembles all slices under token budget
- [ ] **MEM-05**: Embeddings flag toggles hybrid scoring path
- [ ] **MEM-06**: Memory promotion (project → global) round-trips via UI
- [ ] **MEM-07**: Web memory browser functional
- [ ] **MEM-08**: TUI memory search functional
- [ ] **MEM-09**: All three surfaces at parity for memory CRUD + search

### Repos + Git — Pillar 9 (REP)

- [ ] **REP-01**: File watcher triggers sync within 2s of local change
- [ ] **REP-02**: On-demand sync accurate (worker jobs functional)
- [ ] **REP-03**: LRU cron job for top-5 remote repo warm cache
- [ ] **REP-04**: Multi-repo dashboard showing branch status + recent commits + open tasks per repo
- [ ] **REP-05**: REST API route wired to real DB (not stub store)
- [ ] **REP-06**: CLI `--with-branches --json` returns typed output
- [ ] **REP-07**: All three surfaces at parity for repo management

### Artifacts — Pillar 10 (ART)

- [ ] **ART-01**: run → artifact → search_documents indexing pipeline end-to-end
- [ ] **ART-02**: edges table for cross-domain relationships (artifact → generated_by → agent_run)
- [ ] **ART-03**: artifact_retention_policies table (per-project kind + retention_days)
- [ ] **ART-04**: graphile-worker GC job deletes expired artifacts
- [ ] **ART-05**: Artifact preview renders PNG + text inline
- [ ] **ART-06**: All three surfaces at parity for artifact browsing + download

### Search — Pillar 11 (SRC)

- [ ] **SRC-01**: SearchDocument entity fully populated (text, tokens, lastIndexedAt) — not stub
- [ ] **SRC-02**: Unified FTS across all 5 entity kinds (tasks, docs, runs, memories, artifacts)
- [ ] **SRC-03**: Orama in-browser search installed and benchmarked < 100ms at 10k items
- [ ] **SRC-04**: Facet filters correct across kind, project, status, date range
- [ ] **SRC-05**: Saved search round-trips (create, load, delete)
- [ ] **SRC-06**: Cmd+K palette opens on keyboard shortcut, dispatches 10+ commands
- [ ] **SRC-07**: REST API search returns real results (not hardcoded)
- [ ] **SRC-08**: All three surfaces at parity for search

### Notifications — Pillar 12 (NTF)

- [ ] **NTF-01**: Rules evaluated for every new event via fanout worker
- [ ] **NTF-02**: In-app notification feed page renders last 50 per user
- [ ] **NTF-03**: Bell counter counts unread notifications (not raw events)
- [ ] **NTF-04**: SMTP delivery worker sends with delivery row tracking
- [ ] **NTF-05**: Webhook delivery with signed POST + retry
- [ ] **NTF-06**: Quiet hours respected with retry scheduling
- [ ] **NTF-07**: Web notification rules management UI
- [ ] **NTF-08**: CLI notification commands wired and functional
- [ ] **NTF-09**: All three surfaces at parity for notifications

### API Surface — Pillar 13 (API)

- [ ] **API-01**: Every tRPC procedure has Zod-validated test
- [ ] **API-02**: REST API routes wired to tRPC procedures (not stub stores)
- [ ] **API-03**: OpenAPI spec at /api/v1/openapi.json valid and complete
- [ ] **API-04**: Outbound webhook subscriptions entity + delivery tracking
- [ ] **API-05**: Webhook sends signed POST with retry on failure
- [ ] **API-06**: `assertPermission()` enforced on every procedure (same as FND-02)

### CLI — Pillar 14 (CLI)

- [ ] **CLI-01**: All generated commands wired to tRPC calls (no "not wired yet" throws)
- [ ] **CLI-02**: `fulcrum task list --json` returns typed JSON
- [ ] **CLI-03**: `fulcrum doctor --json` covers all subsystems
- [ ] **CLI-04**: Every domain has list/get/create/update/delete commands
- [ ] **CLI-05**: Binary builds and runs on macOS + Linux
- [ ] **CLI-06**: `--json` flag on every command outputs structured data

### TUI — Pillar 15 (TUI)

- [ ] **TUI-01**: TUI rewritten using OpenTUI with JSX components
- [ ] **TUI-02**: Launches without error on macOS + Linux
- [ ] **TUI-03**: Task CRUD, sprint board, doc browser functional via tRPC in-process
- [ ] **TUI-04**: Live run monitor streams real-time updates
- [ ] **TUI-05**: Cmd-palette dispatches same commands as Web
- [ ] **TUI-06**: Keyboard navigation tested on all screens
- [ ] **TUI-07**: Feature parity with Web for every domain

### Web App — Pillar 16 (WEB)

- [ ] **WEB-01**: Full shadcn-svelte component kit adopted across all pages
- [ ] **WEB-02**: LayerChart installed and used for burndown/velocity/reports
- [ ] **WEB-03**: svelte-dnd-action wired for drag-and-drop on kanban board
- [ ] **WEB-04**: TipTap editor integrated into doc edit pages
- [ ] **WEB-05**: Cmd+K keyboard shortcut bound and dispatches 10+ commands
- [ ] **WEB-06**: Gantt view renders with dependencies
- [ ] **WEB-07**: Calendar view renders tasks by due date
- [ ] **WEB-08**: Playwright e2e covers: create-project, create-task, kanban-move, create-doc, search
- [ ] **WEB-09**: `bun run ci` web gates pass
- [ ] **WEB-10**: Dark mode persists across sessions
- [ ] **WEB-11**: All routes render without server errors

### Cross-Cutting (XCT)

- [ ] **XCT-01**: i18n framework with locale switching (en default + 1 additional)
- [ ] **XCT-02**: Theming beyond dark/light (custom theme support)
- [ ] **XCT-03**: Telemetry opt-in with local collection table
- [ ] **XCT-04**: Error reporting/observability (local sentry-equivalent)
- [ ] **XCT-05**: Backup/restore of org data (export + import)
- [ ] **XCT-06**: Import/export of org data (JSON + CSV)
- [ ] **XCT-07**: Secret management with encryption-at-rest
- [ ] **XCT-08**: TUI accessibility (screen reader, high contrast)
- [ ] **XCT-09**: Web accessibility (WCAG 2.1 AA on core flows)
- [ ] **XCT-10**: Migration downgrade strategy documented + tested

### Testing (TST)

- [ ] **TST-01**: Infrastructure tests: migration compat, dev server smoke, SvelteKit export validation, auth mode, default org seeding
- [ ] **TST-02**: tRPC integration tests for all routers
- [ ] **TST-03**: Playwright e2e for 14 user journeys
- [ ] **TST-04**: TUI screen tests for all 40+ screens
- [ ] **TST-05**: CLI command tests for all domains
- [ ] **TST-06**: Inference backend contract tests
- [ ] **TST-07**: Symphony conformance tests (§17.1-17.7)
- [ ] **TST-08**: Coverage threshold enforced in CI
- [ ] **TST-09**: Gate review regression tests for all 13 CF/F bugs

### SaaS Hardening (SAS)

- [ ] **SAS-01**: Multi-org data isolation verified (RLS or org_id scoping)
- [ ] **SAS-02**: Connection pooling configured for PostgreSQL
- [ ] **SAS-03**: EventBus injectable (pluggable for Redis/NATS in multi-instance)
- [ ] **SAS-04**: Auth org-switching + org member management functional
- [ ] **SAS-05**: Job queue coordination across instances (graphile-worker advisory locks)
- [ ] **SAS-06**: Integration tests run against PostgreSQL (not just PGlite)

## v2 Requirements

### Advanced Features

- **ADV-01**: Real-time collaborative editing (Yjs/CRDT)
- **ADV-02**: Third-party marketplace hosting
- **ADV-03**: Custom workflow designer UI
- **ADV-04**: Mobile responsive web (PWA)
- **ADV-05**: Plugin sandboxing (WASM)
- **ADV-06**: Multi-region deployment
- **ADV-07**: Audit log export to external SIEM
- **ADV-08**: SSO (SAML/OIDC) beyond OAuth

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first; responsive PWA in v2 |
| Real-time collab editing | High complexity; Yjs gated but not v1 priority |
| Marketplace hosting | Local skill distribution sufficient for v1 |
| Workflow designer UI | WORKFLOW.md file-based per Symphony spec |
| Video/audio in docs | Storage/bandwidth; text + images only |
| AI model training | Inference only; no fine-tuning |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Pending |
| ARCH-02 | Phase 1 | Pending |
| ARCH-03 | Phase 1 | Pending |
| ARCH-04 | Phase 1 | Pending |
| ARCH-05 | Phase 1 | Pending |
| ARCH-06 | Phase 1 | Pending |
| ARCH-07 | Phase 1 | Pending |
| ARCH-08 | Phase 1 | Pending |
| ARCH-09 | Phase 1 | Pending |
| BUG-01 | Phase 2 | Pending |
| BUG-02 | Phase 2 | Pending |
| BUG-03 | Phase 2 | Pending |
| BUG-04 | Phase 2 | Pending |
| BUG-05 | Phase 2 | Pending |
| BUG-06 | Phase 2 | Pending |
| BUG-07 | Phase 2 | Pending |
| BUG-08 | Phase 2 | Pending |
| BUG-09 | Phase 2 | Pending |
| BUG-10 | Phase 2 | Pending |
| BUG-11 | Phase 2 | Pending |
| BUG-12 | Phase 2 | Pending |
| BUG-13 | Phase 2 | Pending |
| BUG-14 | Phase 2 | Pending |
| BUG-15 | Phase 2 | Pending |
| BUG-16 | Phase 2 | Pending |
| BUG-17 | Phase 2 | Pending |
| BUG-18 | Phase 2 | Pending |
| BUG-19 | Phase 2 | Pending |
| FND-01 | Phase 2 | Pending |
| FND-02 | Phase 2 | Pending |
| FND-03 | Phase 2 | Pending |
| FND-04 | Phase 2 | Pending |
| FND-05 | Phase 2 | Pending |
| SYM-01 | Phase 3 | Pending |
| SYM-02 | Phase 3 | Pending |
| SYM-03 | Phase 3 | Pending |
| SYM-04 | Phase 3 | Pending |
| SYM-05 | Phase 3 | Pending |
| SYM-06 | Phase 3 | Pending |
| SYM-07 | Phase 3 | Pending |
| SYM-08 | Phase 3 | Pending |
| SYM-09 | Phase 3 | Pending |
| SYM-10 | Phase 3 | Pending |
| SYM-11 | Phase 3 | Pending |
| SYM-12 | Phase 3 | Pending |
| SYM-13 | Phase 3 | Pending |
| SYM-14 | Phase 3 | Pending |
| SYM-15 | Phase 3 | Pending |
| SYM-16 | Phase 3 | Pending |
| SYM-17 | Phase 3 | Pending |
| SYM-18 | Phase 3 | Pending |
| SYM-19 | Phase 3 | Pending |
| SYM-20 | Phase 3 | Pending |
| INF-01 | Phase 4 | Pending |
| INF-02 | Phase 4 | Pending |
| INF-03 | Phase 4 | Pending |
| INF-04 | Phase 4 | Pending |
| INF-05 | Phase 4 | Pending |
| SND-01 | Phase 4 | Pending |
| SND-02 | Phase 4 | Pending |
| SND-03 | Phase 4 | Pending |
| SND-04 | Phase 4 | Pending |
| SND-05 | Phase 4 | Pending |
| SND-06 | Phase 4 | Pending |
| RTR-01 | Phase 4 | Pending |
| RTR-02 | Phase 4 | Pending |
| RTR-03 | Phase 4 | Pending |
| RTR-04 | Phase 4 | Pending |
| RTR-05 | Phase 4 | Pending |
| RTR-06 | Phase 4 | Pending |
| RTR-07 | Phase 4 | Pending |
| TSK-01 | Phase 5 | Pending |
| TSK-02 | Phase 5 | Pending |
| TSK-03 | Phase 5 | Pending |
| TSK-04 | Phase 5 | Pending |
| TSK-05 | Phase 5 | Pending |
| TSK-06 | Phase 5 | Pending |
| TSK-07 | Phase 5 | Pending |
| TSK-08 | Phase 5 | Pending |
| TSK-09 | Phase 5 | Pending |
| TSK-10 | Phase 5 | Pending |
| TSK-11 | Phase 5 | Pending |
| TSK-12 | Phase 5 | Pending |
| TSK-13 | Phase 5 | Pending |
| TSK-14 | Phase 5 | Pending |
| DOC-01 | Phase 6 | Pending |
| DOC-02 | Phase 6 | Pending |
| DOC-03 | Phase 6 | Pending |
| DOC-04 | Phase 6 | Pending |
| DOC-05 | Phase 6 | Pending |
| DOC-06 | Phase 6 | Pending |
| DOC-07 | Phase 6 | Pending |
| DOC-08 | Phase 6 | Pending |
| DOC-09 | Phase 6 | Pending |
| DOC-10 | Phase 6 | Pending |
| DOC-11 | Phase 6 | Pending |
| MEM-01 | Phase 6 | Pending |
| MEM-02 | Phase 6 | Pending |
| MEM-03 | Phase 6 | Pending |
| MEM-04 | Phase 6 | Pending |
| MEM-05 | Phase 6 | Pending |
| MEM-06 | Phase 6 | Pending |
| MEM-07 | Phase 6 | Pending |
| MEM-08 | Phase 6 | Pending |
| MEM-09 | Phase 6 | Pending |
| SRC-01 | Phase 6 | Pending |
| SRC-02 | Phase 6 | Pending |
| SRC-03 | Phase 6 | Pending |
| SRC-04 | Phase 6 | Pending |
| SRC-05 | Phase 6 | Pending |
| SRC-06 | Phase 6 | Pending |
| SRC-07 | Phase 6 | Pending |
| SRC-08 | Phase 6 | Pending |
| REP-01 | Phase 7 | Pending |
| REP-02 | Phase 7 | Pending |
| REP-03 | Phase 7 | Pending |
| REP-04 | Phase 7 | Pending |
| REP-05 | Phase 7 | Pending |
| REP-06 | Phase 7 | Pending |
| REP-07 | Phase 7 | Pending |
| ART-01 | Phase 7 | Pending |
| ART-02 | Phase 7 | Pending |
| ART-03 | Phase 7 | Pending |
| ART-04 | Phase 7 | Pending |
| ART-05 | Phase 7 | Pending |
| ART-06 | Phase 7 | Pending |
| NTF-01 | Phase 7 | Pending |
| NTF-02 | Phase 7 | Pending |
| NTF-03 | Phase 7 | Pending |
| NTF-04 | Phase 7 | Pending |
| NTF-05 | Phase 7 | Pending |
| NTF-06 | Phase 7 | Pending |
| NTF-07 | Phase 7 | Pending |
| NTF-08 | Phase 7 | Pending |
| NTF-09 | Phase 7 | Pending |
| CLI-01 | Phase 8 | Pending |
| CLI-02 | Phase 8 | Pending |
| CLI-03 | Phase 8 | Pending |
| CLI-04 | Phase 8 | Pending |
| CLI-05 | Phase 8 | Pending |
| CLI-06 | Phase 8 | Pending |
| TUI-01 | Phase 8 | Pending |
| TUI-02 | Phase 8 | Pending |
| TUI-03 | Phase 8 | Pending |
| TUI-04 | Phase 8 | Pending |
| TUI-05 | Phase 8 | Pending |
| TUI-06 | Phase 8 | Pending |
| TUI-07 | Phase 8 | Pending |
| WEB-01 | Phase 8 | Pending |
| WEB-02 | Phase 8 | Pending |
| WEB-03 | Phase 8 | Pending |
| WEB-04 | Phase 8 | Pending |
| WEB-05 | Phase 8 | Pending |
| WEB-06 | Phase 8 | Pending |
| WEB-07 | Phase 8 | Pending |
| WEB-08 | Phase 8 | Pending |
| WEB-09 | Phase 8 | Pending |
| WEB-10 | Phase 8 | Pending |
| WEB-11 | Phase 8 | Pending |
| API-01 | Phase 8 | Pending |
| API-02 | Phase 8 | Pending |
| API-03 | Phase 8 | Pending |
| API-04 | Phase 8 | Pending |
| API-05 | Phase 8 | Pending |
| API-06 | Phase 8 | Pending |
| XCT-01 | Phase 9 | Pending |
| XCT-02 | Phase 9 | Pending |
| XCT-03 | Phase 9 | Pending |
| XCT-04 | Phase 9 | Pending |
| XCT-05 | Phase 9 | Pending |
| XCT-06 | Phase 9 | Pending |
| XCT-07 | Phase 9 | Pending |
| XCT-08 | Phase 9 | Pending |
| XCT-09 | Phase 9 | Pending |
| XCT-10 | Phase 9 | Pending |
| TST-01 | Phase 9 | Pending |
| TST-02 | Phase 9 | Pending |
| TST-03 | Phase 9 | Pending |
| TST-04 | Phase 9 | Pending |
| TST-05 | Phase 9 | Pending |
| TST-06 | Phase 9 | Pending |
| TST-07 | Phase 9 | Pending |
| TST-08 | Phase 9 | Pending |
| TST-09 | Phase 9 | Pending |
| SAS-01 | Phase 10 | Pending |
| SAS-02 | Phase 10 | Pending |
| SAS-03 | Phase 10 | Pending |
| SAS-04 | Phase 10 | Pending |
| SAS-05 | Phase 10 | Pending |
| SAS-06 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 190 total
- Mapped to phases: 190
- Unmapped: 0

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-04 after roadmap creation*
