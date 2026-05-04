# Requirements: Fulcrum v1.0

**Defined:** 2026-05-04
**Core Value:** Every AI agent workflow runs through one integrated, self-hosted platform with full Symphony spec conformance.
**Last corrected:** 2026-05-04 after Wave 2 audit (12 deep-dive agents)

## v1 Requirements

### Architecture Convergence (ARCH)

- [ ] **ARCH-01**: All business logic accessed through tRPC procedures — no surface (web/CLI/TUI) owns business logic directly
- [ ] **ARCH-02**: Single data access layer (MikroORM) — all product-kernel raw SQL migrated to repositories, `ProductDb.query()` removed from app code
- [ ] **ARCH-03**: Service layer exists between tRPC routers and repositories — routers under 200 lines, business logic in injectable services
- [ ] **ARCH-04**: Unified domain event mechanism — single EventDispatcher that persists to events table (consistent PK format) + publishes to EventBus. No mixed UUID/ULID PKs in events table.
- [ ] **ARCH-05**: Module boundary enforcement — barrel exports per module, no cross-boundary deep imports
- [ ] **ARCH-06**: No layering violations — product-kernel never imports from web; CLI never imports from web; dependency direction: web → tRPC → services → repositories → entities
- [ ] **ARCH-07**: Stub routers removed from AppRouter — no inline `crudRouter()` stubs returning empty arrays or `{ok: true}` for mutations that persist nothing
- [ ] **ARCH-08**: No duplicate router mounts — single canonical name per domain (no skills/fulcrum_skills, memory/memories, runs/agent_runs aliases). Eliminates Casbin authorization bypass via aliased paths.
- [ ] **ARCH-09**: TrpcContext carries only ORM path — `db?: ProductDb` field removed after ARCH-02 complete. No all-nullable context that silently returns empty results.
- [ ] **ARCH-10**: Single PGlite connection pool — no per-request `openProductDb()`. Connection opened once at startup, shared across requests. No migrations in request handlers.
- [ ] **ARCH-11**: No DDL (ALTER TABLE) in request handlers — all schema changes via migration files only. Remove ALTER TABLE from `updateTaskAction` and `ensureDocLinksCompatibility`.
- [ ] **ARCH-12**: Single Hono public API — merge `product-kernel/api/router.ts` and `src/api/hono.ts` into one API with one auth middleware and one OpenAPI spec.

### Security (SEC)

- [ ] **SEC-01**: Webhook secrets encrypted at rest — `encrypted_secret` column actually encrypted, not plaintext storage
- [ ] **SEC-02**: `agents.testProfile` validates cliPath against allowlist of known agent binaries — no arbitrary binary execution from DB-stored paths
- [ ] **SEC-03**: Semgrep 14 findings resolved (non-literal regexp, IFS)
- [ ] **SEC-04**: Gitleaks 18 historical findings addressed (rotate or verify non-sensitive)

### Bug Fixes (BUG)

- [x] **BUG-01**: Compiled binary resolves PGlite data path correctly (critical — ENOENT `/$bunfs/root/pglite.data`)
- [x] **BUG-02**: Claude plugin uninstall gated by ownership markers (critical — prevents removing user-installed plugins)
- [x] **BUG-03**: Web type-check passes with correct `bun:test` type handling
- [x] **BUG-04**: Root CI includes web checks (`src/web/**` not excluded from tsconfig)
- [x] **BUG-05**: Frontmatter YAML round-trips byte-stable (patcher approach, not parse/stringify)
- [x] **BUG-06**: Claude settings cleanup scoped to Fulcrum-owned keys only
- [x] **BUG-07**: Claude cache/marketplace removals marker-gated
- [x] **BUG-08**: Agent install does not auto-invoke Claude CLI plugin commands without confirmation
- [x] **BUG-09**: Product CLI flag parser handles positional args correctly
- [x] **BUG-10**: Component status inspects filesystem, not ledger state
- [x] **BUG-11**: Package parity validates native roots, not over-trusts
- [x] **BUG-12**: Doctor increments warnings on product-kernel DB errors
- [x] **BUG-13**: JSON/TOML config uses targeted patchers, not whole-file rewrites
- [x] **BUG-14**: Vendor mirrors do not overwrite top-level skill/command names
- [x] **BUG-15**: Complexity hotspots (CCN 18-59) refactored below CCN 15 threshold
- [x] **BUG-16**: cookie@0.6.0 advisory resolved in web lockfile
- [x] **BUG-17**: Local main synced with origin
- [x] **BUG-18**: Cmd+K keyboard shortcut bound in web layout (palette component exists but `svelte:window` keydown handler missing)

### Foundation — Pillar 1 (FND)

- [x] **FND-01**: Migrations run clean on both PGlite and PostgreSQL with CI verification (document PGlite limitations vs PostgreSQL)
- [x] **FND-02**: `assertPermission()` enforced via lint rule on every tRPC procedure
- [x] **FND-03**: `tenant_settings` entity exists with per-org configuration
- [x] **FND-04**: graphile-worker formally bootstrapped with extensible worker registry (supports job types for pillars 6, 9, 10, 12)
- [x] **FND-05**: All three surfaces reach init/auth parity: Web login/auto-session, CLI `fulcrum auth whoami`, TUI auth screen
- [x] **FND-06**: Composite `(org_id, ...)` indexes verified on all tenant-scoped tables
- [x] **FND-07**: Feature-flag registry returns stable booleans from `src/flags/registry.ts`

### Inference Sidecar — Pillar 2 (INF)

- [ ] **INF-01**: Embedding dimension consistency — 384-dim fastembed vectors stored in `vector(384)` column. Update all `vector(1536)` references in schema and canonical spec.
- [ ] **INF-02**: Static binary build pipeline verified on macOS + Linux
- [ ] **INF-03**: `fulcrum inference start/stop/status` CLI commands functional
- [ ] **INF-04**: Doctor shows sidecar status (running/stopped/errored)
- [ ] **INF-05**: All inference backends tested with real model calls (not just mocks)
- [ ] **INF-06**: Embedding round-trip cosine >= 0.9 for paraphrase pair (acceptance threshold from vision)
- [ ] **INF-07**: Auto-spawn triggered by first flag caller verified

### Symphony Orchestration — Pillar 3 (SYM)

- [x] **SYM-01**: Workflow path selection supports explicit runtime path and cwd default (`WORKFLOW.md`)
- [x] **SYM-02**: `WORKFLOW.md` loader with YAML front matter + prompt body split
- [x] **SYM-03**: Typed config layer with defaults and `$VAR` env resolution + `~` path expansion
- [x] **SYM-04**: Dynamic `WORKFLOW.md` watch/reload/re-apply — invalid reload keeps last good config + emits error
- [x] **SYM-05**: Fulcrum native tracker adapter implements all 3 REQUIRED operations with full Issue model (all 12 fields including description, branch_name, url, labels, blocked_by as `{id, identifier, state}` objects)
- [x] **SYM-06**: External tracker adapters (Linear, GitHub Issues) available as ingest-only connectors
- [x] **SYM-07**: Poll loop tick sequence: reconcile → validate → fetch → sort → dispatch → notify
- [x] **SYM-08**: Issue orchestration states match spec §7.1: Unclaimed → Claimed → Running/RetryQueued → Released
- [ ] **SYM-09**: Multi-turn continuation: normal worker exit → 1000ms fixed-delay continuation retry → re-check tracker state → re-dispatch on same thread if still active
- [ ] **SYM-10**: Failure-driven retry: `min(10000 * 2^(attempt-1), max_retry_backoff_ms)` with configurable cap
- [ ] **SYM-11**: Stall detection checks `last_codex_timestamp` first (if any event seen), falls back to `started_at`. Kills worker + queues retry.
- [ ] **SYM-12**: Workspace safety: cwd == workspace_path enforced before agent launch, path inside root, key sanitized `[A-Za-z0-9._-]`
- [ ] **SYM-13**: All 4 lifecycle hooks (after_create, before_run, after_run, before_remove) with timeout config
- [x] **SYM-14**: Strict prompt rendering — unknown variables/filters MUST fail. `issue` object includes all 12 normalized fields.
- [x] **SYM-15**: Candidate sorting: priority asc → created_at oldest → identifier lexicographic (not UUID)
- [x] **SYM-16**: Blocker rule: Todo state (specifically) with non-terminal blockers = ineligible
- [x] **SYM-17**: Per-state concurrency limits via `max_concurrent_agents_by_state` config
- [x] **SYM-18**: Reconciliation Part B: per-tick tracker state refresh for running issues — terminal → stop + cleanup, non-active → stop, active → update snapshot
- [ ] **SYM-19**: Startup terminal workspace cleanup sweep
- [ ] **SYM-20**: Coding-agent app-server subprocess client — JSON line protocol, session startup, thread/turn ID extraction, read/turn timeouts
- [x] **SYM-21**: Codex launch command config (`codex.command`, default `codex app-server`)
- [ ] **SYM-22**: Structured logs with `issue_id`, `issue_identifier`, and `session_id` on every log entry
- [ ] **SYM-23**: Token accounting — cumulative totals from `thread/tokenUsage/updated`, no double-counting, keyed by thread_id
- [x] **SYM-24**: Conformance tests pass for all §17.1-17.7 categories
- [ ] **SYM-25**: HTTP server extension (GET /, /api/v1/state, /api/v1/<issue>, POST /api/v1/refresh)
- [x] **SYM-26**: Approval/sandbox posture documented per §10.5 REQUIRED
- [ ] **SYM-27**: Run attempt lifecycle states implemented: PreparingWorkspace → BuildingPrompt → LaunchingAgentProcess → InitializingSession → StreamingTurn → Finishing → terminal

### Sandcastle — Pillar 4 (SND)

- [ ] **SND-01**: noSandbox + claudeCode dispatches task and writes agent_runs row end-to-end
- [ ] **SND-02**: Artifact harvest via copyFileOut produces artifact entity from sandbox output
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
- [ ] **RTR-07**: `skills.lock.json` SHA-256 pins validated on install
- [ ] **RTR-08**: All three surfaces show routing config: Web (routing editor), CLI (`fulcrum routing`), TUI (routing-rules screen)

### Tasks + Sprints — Pillar 6 (TSK)

- [ ] **TSK-01**: task_comments entity with CRUD (create, list, delete, resolve)
- [ ] **TSK-02**: task_watchers entity with subscribe/unsubscribe
- [ ] **TSK-03**: Burndown chart renders from events log using LayerChart (install + integrate)
- [ ] **TSK-04**: Velocity rollup chart functional
- [ ] **TSK-05**: Cycle time + throughput + WIP + CFD reports
- [ ] **TSK-06**: metrics_cache rollup worker (graphile-worker job) with invalidation
- [ ] **TSK-07**: Sprint capacity preview with capacity math
- [ ] **TSK-08**: Sprint retrospective notes field on Sprint entity
- [ ] **TSK-09**: Gantt view renders task timeline with dependencies
- [ ] **TSK-10**: Calendar view renders tasks by due date
- [ ] **TSK-11**: Bulk operations tested with 50+ tasks
- [ ] **TSK-12**: Custom field engine all 8 types verified end-to-end (already implemented — verification only)
- [ ] **TSK-13**: Saved view filter AST round-trips and renders correctly
- [ ] **TSK-14**: Three-surface parity: Web (board+list+calendar+Gantt+reports), CLI (task CRUD+sprint CRUD+`--json`), TUI (task-board+task-list+sprints+reports with ASCII charts)

### Docs + Editor — Pillar 7 (DOC)

- [ ] **DOC-01**: TipTap editor save+load verified lossless across all doc types (already integrated — verification)
- [ ] **DOC-02**: Frontmatter form verified across all doc_type schemas (already exists — verification)
- [ ] **DOC-03**: KaTeX math rendering verified in editor and read-only view (already exists — verification)
- [ ] **DOC-04**: Mermaid diagram rendering verified end-to-end (already exists — verification)
- [ ] **DOC-05**: Drag-drop tree reorder in doc sidebar
- [ ] **DOC-06**: Version timeline UI — snapshot + delta chain restore verified. Fix `applyDelta()` to support incremental ops (not just full-replacement).
- [ ] **DOC-07**: Wikilink writes doc_links row verified (already implemented — verification)
- [ ] **DOC-08**: doc_type drives distinct toolbar configurations verified
- [ ] **DOC-09**: context_summary extraction on save (headings + wikilinks + mentions for Pillar 8)
- [ ] **DOC-10**: Read-only render via remark + unified + shiki + DOMPurify verified
- [ ] **DOC-11**: doc_comments entity with anchored comments, threading, resolve (vision Pillar 7 schema)
- [ ] **DOC-12**: Three-surface parity: Web (editor+sidebar+history+comments), CLI (doc CRUD+versions+`--json`), TUI (docs-tree+reader-editor)

### Memory + Context — Pillar 8 (MEM)

- [ ] **MEM-01**: Embedding column `vector(384)` matching fastembed. Update all `vector(1536)` references.
- [ ] **MEM-02**: Heuristic extractor produces memory rows from sample transcript verified (already implemented)
- [ ] **MEM-03**: FTS retrieval ranks project + global rows correctly verified
- [ ] **MEM-04**: Context bundle assembles 5 slices (memories 25%, linkedDocs 20%, recentRuns 35%, repoState 10%, skillPrompts 10%) under token budget
- [ ] **MEM-05**: Embeddings flag toggles hybrid scoring path verified
- [ ] **MEM-06**: Memory promotion (project → global) via Web UI + CLI
- [ ] **MEM-07**: Web memory browser functional
- [ ] **MEM-08**: TUI memory search functional
- [ ] **MEM-09**: Repo state snapshot fed to context bundle (connect Pillar 9 → Pillar 8)

### Repos + Git — Pillar 9 (REP)

- [ ] **REP-01**: File watcher triggers sync within 2s of local change (already implemented — verification)
- [ ] **REP-02**: On-demand sync via graphile-worker jobs verified functional
- [ ] **REP-03**: LRU cron job registered for top-5 remote repo warm cache (function exists, cron registration missing)
- [ ] **REP-04**: Multi-repo dashboard showing branch status + recent commits + open tasks per repo
- [ ] **REP-05**: REST API route wired to real DB (replace stub store)
- [ ] **REP-06**: CLI repos commands wired to tRPC (replace generated stubs)
- [ ] **REP-07**: Three-surface parity: Web (repo list+detail+branches+commits+files), CLI (register+list+sync+status+`--json`), TUI (repos screen)

### Artifacts — Pillar 10 (ART)

- [ ] **ART-01**: run → artifact → search_documents indexing pipeline verified end-to-end (harvest pipeline implemented — verify search indexing)
- [ ] **ART-02**: Edges table verified functional (already implemented — verify bidirectional artifact↔run edges)
- [ ] **ART-03**: artifact_retention_policies table (per-project kind + retention_days). Default: forever for projects, 90d for scratch.
- [ ] **ART-04**: Artifact pruner cron verified (pruner.ts exists + registerPrunerCron — verify actually processes expired)
- [ ] **ART-05**: Artifact preview renders PNG + text inline in web detail page
- [ ] **ART-06**: Three-surface parity: Web (list+detail+download+preview), CLI (artifact CRUD+`--json`), TUI (artifacts screen)

### Search — Pillar 11 (SRC)

- [ ] **SRC-01**: SearchDocument entity fully populated — add title, body, labels, metadata, updatedAt, projectId columns (currently 4-column stub)
- [ ] **SRC-02**: Search tRPC query endpoint exposed (currently missing — only write-side indexing exists)
- [ ] **SRC-03**: Unified FTS across all entity kinds via PGlite + optional Meilisearch backend (7 indexers already exist — wire to query endpoint)
- [ ] **SRC-04**: Orama in-browser search installed and benchmarked < 100ms at 10k items
- [ ] **SRC-05**: Facet filters correct across kind, project, status, date range
- [ ] **SRC-06**: Saved search round-trips (create, load, delete)
- [ ] **SRC-07**: Cmd+K palette opens on keyboard shortcut, dispatches 10+ commands (consolidates WEB-05)
- [ ] **SRC-08**: REST API search returns real results (replace hardcoded data)
- [ ] **SRC-09**: Three-surface parity: Web (search page+facets+saved), CLI (query+suggest+saved+`--json`), TUI (search screen+facet chips)

### Notifications — Pillar 12 (NTF)

- [ ] **NTF-01**: Rules evaluated for every new event via fanout worker (already implemented — verification)
- [ ] **NTF-02**: In-app notification feed (inbox page exists — verify renders last 50 per user with unread count)
- [ ] **NTF-03**: Bell counter counts unread user_notifications (not raw events — fix bell API)
- [ ] **NTF-04**: Delivery worker handlers: implement SMTP, webhook (HMAC-signed POST), push notification workers to process fanout-enqueued jobs
- [ ] **NTF-05**: Webhook delivery with signed POST + retry + delivery tracking (consolidates API-05)
- [ ] **NTF-06**: Quiet hours respected + retry scheduler re-processes held deliveries after window ends
- [ ] **NTF-07**: Web notification rules management UI (settings page exists — verify rules CRUD)
- [ ] **NTF-08**: CLI notification commands wired to tRPC (replace generated stubs)
- [ ] **NTF-09**: Three-surface parity: Web (inbox+rules+channels), CLI (notify CRUD+rules+`--json`), TUI (notifications+notification-rules screens)

### API Surface — Pillar 13 (API)

- [ ] **API-01**: Every tRPC procedure has Zod-validated test
- [ ] **API-02**: REST API routes wired to tRPC procedures (not stub stores) — single Hono API per ARCH-12
- [ ] **API-03**: OpenAPI spec at /api/v1/openapi.json valid and complete
- [ ] **API-04**: Outbound webhook subscriptions entity + delivery tracking (shared with NTF-05)
- [ ] **API-05**: Rate limiting on REST API and tRPC procedures

### CLI — Pillar 14 (CLI)

- [ ] **CLI-01**: All generated commands wired to tRPC calls (no "not wired yet" throws). Depends on domain pillars 5-12 being complete.
- [ ] **CLI-02**: `fulcrum task list --json` returns typed JSON
- [ ] **CLI-03**: `fulcrum doctor --json` covers all subsystems (inference, DB, auth, features, Symphony, agents)
- [ ] **CLI-04**: Every domain (15 total: projects, tasks, docs, memory, runs, repos, artifacts, search, notifications, skills, router, symphony, inference, components, doctor) has list/get/create/update/delete
- [ ] **CLI-05**: Binary builds and runs on macOS + Linux
- [ ] **CLI-06**: `--json` flag on every command outputs structured data
- [ ] **CLI-07**: Shell completion registered and functional

### TUI — Pillar 15 (TUI)

- [ ] **TUI-01**: TUI rewritten using OpenTUI with JSX components (evaluate OpenTUI maturity first — if insufficient, fall back to ratatui per vision fallback gate)
- [ ] **TUI-02**: Launches without error on macOS + Linux
- [ ] **TUI-03**: Task CRUD, sprint board, doc browser functional via tRPC in-process (no direct DB entity imports)
- [ ] **TUI-04**: Live run monitor streams real-time updates via EventBus subscription
- [ ] **TUI-05**: Cmd-palette dispatches same commands as Web
- [ ] **TUI-06**: Keyboard navigation tested on all screens
- [ ] **TUI-07**: Feature parity with Web for all domains (see per-domain parity definitions in TSK-14, DOC-12, REP-07, ART-06, SRC-09, NTF-09)
- [ ] **TUI-08**: Remove dead `app.ts` (superseded by `index.ts`)

### Web App — Pillar 16 (WEB)

- [ ] **WEB-01**: Full shadcn-svelte component kit verified across all pages (24 components already installed)
- [ ] **WEB-02**: LayerChart installed and used for burndown/velocity/reports (TSK-03 dependency)
- [ ] **WEB-03**: svelte-dnd-action verified functional on kanban board (already wired via BoardColumn — verification)
- [ ] **WEB-04**: TipTap editor verified integrated into doc edit pages (already integrated — verification)
- [ ] **WEB-05**: Gantt view renders with dependencies
- [ ] **WEB-06**: Calendar view renders tasks by due date
- [ ] **WEB-07**: Playwright e2e covers 14 user journeys (enumerate: first-time setup, project CRUD, task CRUD, kanban move, sprint management, doc CRUD, doc editing, search+facets, memory browse, repo management, artifact download, notification rules, agent dispatch, theme customization)
- [ ] **WEB-08**: `bun run ci` web gates pass
- [ ] **WEB-09**: Dark mode persists across sessions (already functional — verification)
- [ ] **WEB-10**: All routes render without server errors
- [ ] **WEB-11**: Collab features (presence avatars, cursor overlay) verified when collab flag enabled

### Cross-Cutting (XCT)

- [ ] **XCT-01**: i18n framework with locale switching (en default + 1 additional)
- [ ] **XCT-02**: Theming beyond dark/light (custom theme support)
- [ ] **XCT-03**: Telemetry opt-in with local collection table
- [ ] **XCT-04**: Error reporting/observability (local sentry-equivalent)
- [ ] **XCT-05**: Backup/restore of org data (export + import)
- [ ] **XCT-06**: Import/export of org data (JSON + CSV)
- [ ] **XCT-07**: Secret management with encryption-at-rest — specify: API keys, webhook secrets, connector tokens. Specify scheme.
- [ ] **XCT-08**: TUI accessibility (screen reader, high contrast)
- [ ] **XCT-09**: Web accessibility (WCAG 2.1 AA on core flows — verify with axe-core)
- [ ] **XCT-10**: Migration downgrade strategy documented + tested
- [ ] **XCT-11**: Audit logging — who did what when, queryable, with retention policy
- [ ] **XCT-12**: Graceful shutdown — PGlite data integrity, orphaned workspace cleanup, in-flight job handling

### Testing (TST)

- [ ] **TST-01**: Infrastructure tests: migration compat, dev server smoke, SvelteKit export validation, auth mode, default org seeding
- [ ] **TST-02**: tRPC integration tests for all routers
- [ ] **TST-03**: Playwright e2e for 14 user journeys (enumerated in WEB-07)
- [ ] **TST-04**: TUI screen tests for all screens (count verified against actual screen registry)
- [ ] **TST-05**: CLI command tests for all 15 domains
- [ ] **TST-06**: Inference backend contract tests
- [ ] **TST-07**: Symphony conformance tests (§17.1-17.7) — all REQUIRED items
- [ ] **TST-08**: Coverage threshold enforced in CI (specify: 80% line coverage minimum)
- [ ] **TST-09**: Gate review regression tests for all CF/F bugs from audit
- [ ] **TST-10**: TDD woven into every phase — each phase includes RED→GREEN tests for its own requirements (not deferred to Phase 9)

### SaaS Hardening (SAS)

- [ ] **SAS-01**: Multi-org data isolation verified (RLS or org_id scoping) — no cross-org data leakage
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
- **ADV-09**: SSH Worker Extension (Symphony spec Appendix A — OPTIONAL)
- **ADV-10**: Slack + Discord notification channels (gated delivery)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first; responsive PWA in v2 |
| Real-time collab editing | High complexity; Yjs gated but not v1 priority |
| Marketplace hosting | Local skill distribution sufficient for v1 |
| Workflow designer UI | WORKFLOW.md file-based per Symphony spec |
| Video/audio in docs | Storage/bandwidth; text + images only |
| AI model training | Inference only; no fine-tuning |
| SSH Worker Extension | OPTIONAL per Symphony spec; defer to v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01..12 | Phase 1 | Pending |
| SEC-01..04 | Phase 1 | Pending |
| BUG-01..18 | Phase 2 | Complete |
| FND-01..07 | Phase 2 | Complete |
| SND-01..06 | Phase 3 | Pending |
| SYM-01..27 | Phase 3 | Pending |
| INF-01..07 | Phase 4 | Pending |
| RTR-01..08 | Phase 4 | Pending |
| TSK-01..14 | Phase 5 | Pending |
| DOC-01..12 | Phase 6 | Pending |
| MEM-01..09 | Phase 6 | Pending |
| SRC-01..09 | Phase 6 | Pending |
| REP-01..07 | Phase 7 | Pending |
| ART-01..06 | Phase 7 | Pending |
| NTF-01..09 | Phase 7 | Pending |
| CLI-01..07 | Phase 8 | Pending |
| TUI-01..08 | Phase 8 | Pending |
| WEB-01..11 | Phase 8 | Pending |
| API-01..05 | Phase 8 | Pending |
| XCT-01..12 | Phase 9 | Pending |
| TST-01..10 | Each phase (TST-10) + Phase 9 | Pending |
| SAS-01..06 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 213 total
- Mapped to phases: 213
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-04*
*Last corrected: 2026-05-04 after Wave 2 deep-dive audit (12 agents)*
