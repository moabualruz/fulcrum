# Fulcrum Agent-OS — Master Requirements

## Vision

Fulcrum is a local-first Agent OS with a Jira-plus-Confluence-class product surface where human and AI agent work share identical projects, tasks, repos, docs, memory, and artifacts — no distinction between "AI project" and "human project." Tasks have interactive kanban/scrum boards, burndown charts, and per-project reporting. Memory and context management is per-project by default; global knowledge available across projects when linked, relevant, or ordered. Orchestration handles manual and auto-assignment of tasks to CLI agents by task type or configurable criteria. Skills follow the mattpocock/skills workflow, git-synced daily from upstream. Full multi-user, accounts, collaboration, and SaaS is designed from day one; default install runs entirely local, single auto-created user, no auth prompts, no network calls. Web+APIs primary, full CLI second, fully featured TUI last — all three shipped to feature parity.

---

## Foundational Constraints

- **C1. Online features shipped but disabled by default.** Every online-touching feature (LLM router fallback, embeddings, LLM memory extraction, SaaS collab, OAuth) is designed, broken down, implemented, tested, and shipped behind `FULCRUM_FEATURES=<flag>`. Default is OFF. "MVP," "phase 2," "later" language is banned.
- **C2. Local-only default; SaaS schema-ready from day 1.** Local mode = synthetic org + auto-created `admin@local` user. Schema carries `org_id` + `user_id` everywhere. Composite `(org_id, sort_col)` indexes on every tenant-scoped table. SaaS mode flips `DATABASE_URL`; zero schema rewrites.
- **C3. Research → recommend → plan → grill → break-down → execute, every domain.** Recommendations in `.scratch/agent-os-vision/research/`. Every pillar PRD carries failure gates and 2nd/3rd fallbacks.
- **C4. Three surfaces, all shipped — Web+APIs primary, full CLI, full TUI.** All business logic behind tRPC procedures consumed by: SvelteKit web UI, external REST+OpenAPI (`FULCRUM_FEATURES=public-api`), CLI via tRPC codegen (`--json` everywhere), OpenTUI in-process. No surface owns business logic.

---

## Stack Decisions Summary

| Layer | Pick | Why | Failure gate / 2nd choice |
|---|---|---|---|
| Runtime | Bun + TypeScript | 3/5 agent CLIs; single-binary compile | Node.js on Bun compat break |
| DB local | PGlite file-backed via `mikro-orm-pglite` driver | In-process WASM Postgres; pgvector bundled; zero service | sql.js on WASM/OPFS limits; TypeORM if MikroORM PGlite spike fails |
| DB server | PostgreSQL via `@mikro-orm/postgresql` | Same entity classes; swap `DATABASE_URL` to flip driver | Neon serverless |
| ORM | MikroORM v7 (MIT) — ES decorators (Stage-3) — C7 | Class-driven entities, repositories, migrations; needle-di compatible; ESM-native; PR #7622 official PGlite driver in flight | Kysely + custom decorator wrapper (loses NestJS aesthetic); TypeORM (loses FTS) |
| DI / decorators | needle-di v1.x (MIT) — Stage-3 — C8 | 7 KB; `@Injectable()` + `inject(Dep)` constructor injection; `Symbol.metadata` native on Bun ≥ 1.3.10 | inversify v8.1 (legacy decorators, 79 KB); `@nestjs/core` standalone (435 KB) |
| Auth | Better Auth v1 (MIT) — wrapped via MikroORM `BetterAuthAdapter` (custom ~150 LOC) | Better Auth's adapter contract is ORM-agnostic; org+teams+roles plugin; SvelteKit native; 28k stars | Auth.js v5 |
| Permissions | Better Auth org plugin + node-casbin via custom `FulcrumCasbinAdapter` (~200 LOC against MikroORM `EntityRepository`) (`FULCRUM_FEATURES=casbin-policies`) | In-process RBAC; Casbin ABAC when roles too coarse; Fulcrum-owned `casbin_policies` `@Entity` (no library-managed table) | OpenFGA sidecar |
| Web | SvelteKit 2 + Tailwind v4 + shadcn-svelte | Existing stack; Svelte 5 runes; owned components | committed |
| Block editor | TipTap v2 (MIT) | ProseMirror; Svelte 5 wrappers (Tipex/svelte-tiptap 3); May 2026 Pro→MIT; 92% fit | Milkdown → svelte-lexical |
| CRDT/collab | Yjs + Hocuspocus v4 (MIT) | De-facto standard; offline-first; `FULCRUM_FEATURES=real-time-collab-server` | Y-WebRTC P2P → Automerge 3 |
| Kanban DnD | svelte-dnd-action (MIT) | Svelte-native; a11y+touch; current dep | pragmatic-drag-and-drop (Apache-2.0) |
| Charts | LayerChart (MIT) | Svelte-native composable on d3 | Chart.js (MIT, 67k stars) |
| Tables | TanStack Table v8 + Virtual (MIT) | Headless; 27.9k stars; v9 (Svelte 5 native) upgrade path | AG Grid Community |
| Cmd palette | shadcn-svelte Command / Bits UI (MIT) | In stack; Svelte 5 runes-native; cmdk-sv deprecated | ninja-keys |
| Gantt | svelte-gantt (MIT) | Only Svelte-native production Gantt | vis-timeline (Apache-2.0) |
| Orchestration | OpenAI Symphony SPEC.md (Apache-2.0) | 20k-star spec; canonical agentic workflow; CI conformance gate | Custom loop matching same contracts |
| Agent runner | @ai-hero/sandcastle v0.5.6 (MIT) | Docker/noSandbox + worktrees + branch strategy + session capture; ~400 LOC saved | Bun.spawn + simple-git manual impl |
| Inference sidecar | Rust binary `inference/` | Static binary; fastembed-rs + candle/mistral.rs; zero Python deps | Python sidecar if Rust POC fails |
| Memory retrieval | PGlite FTS always-on + pgvector hybrid (`FULCRUM_FEATURES=embeddings`) | Deterministic local; BM25+recency+importance | Orama (Apache-2.0, in-browser) |
| Agent routing | json-rules-engine (ISC) + LLM Haiku (`FULCRUM_FEATURES=router-llm`) | Deterministic rules first; LLM when no match; `--agent` always wins | Round-robin + user pick |
| Job queue | graphile-worker (MIT) | Same Postgres; <5ms latency; in-process | pg-boss → Inngest self-host |
| API internal | tRPC v11 (MIT) | End-to-end typesafe; v11 native Fetch | — |
| API external | Hono + @hono/zod-openapi (`FULCRUM_FEATURES=public-api`) | Thin OpenAPI 3.1 wrapper over tRPC | graphql-yoga + Pothos |
| CLI | Auto-codegen from tRPC schema | Single source of truth; `--json` everywhere | — |
| TUI | OpenTUI (Bun-native TS) | Same toolchain; in-process tRPC | ratatui (Rust, inference workspace) |
| Skills | SKILL.md + MCP registry + daily upstream sync | mattpocock/skills; skills.lock.json SHA-256; per-agent dirs | Embedded static registry |
| Notifications | events table + SMTP/webhook/Slack (gated) | No SaaS dep; in-app feed always-on | Novu self-hosted |
| Search | PGlite FTS `search_documents` + Orama (Apache-2.0) | FTS structured + Orama interactive | Meilisearch sidecar |

---

## Pillars

### Pillar 1: Foundation Reset
- **Value**: Kernel migrated to SaaS-ready shape — auth, tenancy, feature flags, composite indexes, audit log scoping — before any product pillar builds on top.
- **Always-on**: Better Auth v1 + SQLite adapter; tRPC context carries `orgId`+`userId`; `assertPermission()` on every procedure (lint-enforced); feature-flag registry (`src/features/index.ts`); synthetic local org seed; auto-create `admin@local` on `fulcrum init`; `org_id NOT NULL` backfill on `events`; composite `(org_id,…)` indexes on all tenant-scoped tables.
- **Gated**: node-casbin ABAC (`FULCRUM_FEATURES=casbin-policies`).
- **Schema**: `users`, `sessions`, `org_members`, `roles`, `invitations`, `tenant_settings`; `sprints`; `custom_field_defs`; `saved_views`; `saved_searches`; `doc_versions`; `doc_links`; `metrics_cache`; `notification_rules`; `embedding vector(1536)` cols (null until flag on) on `memories` + `search_documents`; `doc_type`, `scope`, `parent_id`, `tiptap_content jsonb` on `documents`.
- **Surfaces**: CLI (init, doctor), API (tRPC context).
- **Dependencies**: none.
- **Done when**: migrations run clean on PGlite + PostgreSQL; `fulcrum init` creates org+user without prompt; `hasPermission()` lint passes; feature flag registry returns stable booleans; composite indexes verified; all three surfaces reach init/auth parity.

---

### Pillar 2: Inference Sidecar (Rust)
- **Value**: Self-contained Rust binary for local embeddings and text generation — no Python, no API key — with Ollama/LM Studio/OpenAI-compatible backends for users who want external models.
- **Always-on**: `inference/` Rust workspace; fastembed-rs embeddings (bge-small-en, ~25–100 MB on first use); Unix socket/stdio JSON-RPC with TS; auto-spawn via graphile-worker lifecycle; `fulcrum inference start/stop/status`; Ollama + LM Studio backends; `embedded` default.
- **Gated**: generation models (`FULCRUM_FEATURES=router-llm`); `openai-compatible` URL+key (`FULCRUM_FEATURES=router-llm:openai-compatible` or `embeddings:openai-compatible`).
- **Schema**: none.
- **Surfaces**: CLI, doctor.
- **Dependencies**: Pillar 1 (feature flag registry).
- **Done when**: static binary runs on macOS+Linux; embedding round-trip cosine ≥ 0.9 for paraphrase pair; auto-spawn triggered by first flag caller; doctor shows sidecar status; all three backends tested with mock; CLI `--json` validated.

---

### Pillar 3: Symphony Orchestration Loop + Tracker Adapter + Conformance Tests
- **Value**: Spec-conformant orchestration daemon polling Fulcrum's task DB, claiming tasks, dispatching agents, retrying on failure — inheriting Symphony's production-proven behavioral contracts.
- **Always-on**: `vendor/openai-symphony/` git submodule; `src/orchestration/symphony/` — `orchestrator.ts` (poll, claim/release, reconcile, retry `min(10000*2^(n-1), max_ms)`), `workspace.ts` (hooks + timeout), `tracker.ts` (Fulcrum-PGlite adapter for `fetch_candidate_issues`, `fetch_issues_by_states`, `fetch_issue_states_by_ids`), `prompt.ts` (Liquid strict renderer); `symphony-conformance.test.ts` CI gate; `docs/symphony-conformance.md` trace; `just sync-symphony` weekly; `fulcrum orchestrate start/stop/status`.
- **Gated**: none.
- **Schema**: `agent_runs` adds `symphony_workspace_path`, `attempt int`, `stall_detected_at`; `tasks` adds `claimed_by`, `claimed_at`, `orchestration_state`.
- **Surfaces**: CLI, Web (orchestration dashboard), TUI (live run monitor).
- **Dependencies**: Pillar 1, Pillar 4 (Sandcastle used as inner execution).
- **Done when**: conformance tests pass zero-skip on REQUIRED items; tracker adapter drives task from `pending` → `completed` in integration test; retry formula matches spec; `just sync-symphony` diffs when upstream changes; all three surfaces show orchestration state.

---

### Pillar 4: Sandcastle Wrapper + Agent-Runner Abstraction
- **Value**: Typed adapter over @ai-hero/sandcastle giving every agent run Docker/noSandbox isolation, git worktrees, branch strategy, and session capture — replacing ~400 LOC of custom work.
- **Always-on**: `@ai-hero/sandcastle@0.5.6` pinned; `src/orchestration/sandbox-runner.ts` adapter → `AgentRun` interface; `claudeCode()`, `codex()`, `pi()`, `opencode()` providers; `noSandbox` default; `onWorktreeReady` injects context bundle; `copyFileOut()` harvests artifacts; `resumeSession` for retry; `fulcrum agent run` CLI.
- **Gated**: Docker (`FULCRUM_FEATURES=sandbox-docker`); Podman (`FULCRUM_FEATURES=sandbox-podman`).
- **Schema**: `agent_runs` adds `sandbox_provider`, `worktree_path`, `branch_strategy`, `session_jsonl_path`.
- **Surfaces**: CLI, Web (run dispatch), TUI (interactive sandbox).
- **Dependencies**: Pillar 1.
- **Done when**: `noSandbox`+`claudeCode()` dispatches task and writes `agent_runs` row; `copyFileOut()` produces artifact; adapter-swap test shows `AgentRun` interface unchanged; doctor warns if Docker absent; session JSONL and `resumeSession` tested; all three surfaces dispatch parity.

---

### Pillar 5: Auto-Router + Skills Loader
- **Value**: Tasks auto-assigned to the right agent via declarative rules; skills loaded per-agent from dedicated folders and synced daily from mattpocock/skills.
- **Always-on**: `src/router/auto-assign.ts` — tier 1: `--agent` override; tier 2: json-rules-engine rules from `config/routing-rules.json`; tier 3: no-match → prompt user once, store as learned rule in `routing_rules` PGlite table; `fulcrum skills sync` distributes SKILL.md to per-agent dirs (never `~/.agents/`); `skills.lock.json` SHA-256 pins; MCP servers as virtual skills; `fulcrum skills list/info/add/remove`.
- **Gated**: LLM Haiku fallback (`FULCRUM_FEATURES=router-llm`); daily upstream pull (`FULCRUM_FEATURES=skills-upstream-sync`).
- **Schema**: `routing_rules(id, org_id, project_id, rule_json, priority, created_by, created_at)`.
- **Surfaces**: CLI, Web (routing rules editor), TUI (router status + skills list).
- **Dependencies**: Pillar 1, Pillar 2 (LLM gate), Pillar 4 (runner).
- **Done when**: rules-engine routes matching task in unit test; no-match path stores learned rule; LLM gate off by default; upstream sync diffs + auto-merges; all three surfaces show routing config.

---

### Pillar 6: Tasks + Scrum/Sprints + Burndown/Velocity + Custom Fields + Saved Views + Reports
- **Value**: Jira-grade task management — sprints, burndown, velocity, cycle time, custom fields, saved views, bulk ops, every view type — covering the full interactive dev-cycle monitoring gap.
- **Always-on**: Task detail (title, description, status, priority, assignee, due date, estimate, parent, labels, repo, sprint, custom fields, comments, watchers, subtasks, blocking/blocked-by); sprint planning board with capacity preview; active sprint board + retrospective notes; burndown (LayerChart line); velocity rollup; custom fields engine (8 types: text/select/multi-select/number/date/user/url/json) via `custom_field_defs` + `tasks.custom_fields jsonb`; saved views (filter AST, scope private/project/org, shareable); list/table/calendar/Gantt/kanban views; bulk operations; `metrics_cache` pre-computed by graphile-worker + on-demand path; `fulcrum task` CLI full CRUD `--json`.
- **Gated**: none for reports — all deterministic SQL.
- **Schema**: `tasks` adds `assignee_id`, `due_date`, `estimate`, `sprint_id`, `labels text[]`, `custom_fields jsonb`, `blocked_by uuid[]`; `task_comments`; `task_watchers`; `sprints`, `custom_field_defs`, `saved_views`, `metrics_cache` (Pillar 1 schema used here).
- **Surfaces**: Web (all views), CLI (full CRUD), TUI (board + list + sprint).
- **Dependencies**: Pillar 1.
- **Done when**: burndown renders from `events` log for test sprint; metrics_cache rollup + invalidation correct; custom field engine all 8 types end-to-end; saved view filter AST round-trips; sprint planning board capacity math correct; bulk ops tested 50-task; all three surfaces at parity.

---

### Pillar 7: Docs + Block Editor + Trees + Taxonomy + Frontmatter + Version History
- **Value**: Confluence-grade docs with TipTap block editor, per-project and global trees, doc-type taxonomy, form frontmatter editing, and version history with diff/restore.
- **Always-on**: TipTap v2 via Tipex/svelte-tiptap; StarterKit + Collaboration + Comment (MIT May 2026) + KaTeX + Mermaid + Image + File + Wikilink (~300 LOC) + `@agent` mention (~150 LOC); per-project + global doc trees via adjacency list + recursive CTE; `doc_type` enum (`spec|adr|wiki|runbook|meeting|postmortem|rfc|note|scratch`) drives toolbar + required fields; frontmatter form (Zod-validated TipTap block) + raw YAML toggle, round-trip stable; `doc_versions` snapshot+delta (jsondiffpatch); version timeline UI (~400 LOC); backlinks sidebar from `doc_links`; `docs.context_summary` extracted on save (headings+wikilinks+mentions) for Pillar 8; remark+unified+shiki+DOMPurify for read-only render; drag-drop tree reorder; `fulcrum doc` CLI CRUD `--json`.
- **Gated**: Yjs + Hocuspocus real-time collab (`FULCRUM_FEATURES=real-time-collab-server`); Y-WebRTC auto-fallback.
- **Schema**: `documents` adds `doc_type`, `scope`, `parent_id`, `tiptap_content jsonb`, `context_summary`; `doc_versions`; `doc_links`; `doc_comments`; `attachments`.
- **Surfaces**: Web (editor, tree, version timeline, backlinks), CLI, TUI (browser + plain editor).
- **Dependencies**: Pillar 1.
- **Done when**: editor saves+loads TipTap JSON + YAML without data loss; wikilink writes `doc_links` row; version restore correct from snapshot+delta chain; `doc_type` drives distinct toolbar configs; frontmatter round-trips raw YAML; collab gate tested both states; all three surfaces at parity.

---

### Pillar 8: Memory + Context Engine + Retriever
- **Value**: Persistent per-project and global memory extracted from runs and doc saves, with deterministic FTS retrieval always-on and vector hybrid optionally enabled, feeding assembled context bundles into agent runs.
- **Always-on**: `memories` with `project_id`, `global boolean`, `importance`, `source (heuristic|llm|manual)`; heuristic extractor (regex/heading/file-touched/decision-line patterns); retrieval score: `BM25 + exp(-age_days/30) + (importance=='high'?1.0:0.0)`; default query `WHERE org_id=$1 AND (project_id=$2 OR global=true)` top-20; `src/memory/retriever.ts`; `src/context/assemble.ts` — 4 slices (top-N memories + linked docs + recent transcripts + repo state + skill prompts), token-budget-capped; `memories.global` promotion via UI+CLI; `fulcrum memory put/get/list/link`.
- **Gated**: pgvector HNSW + embeddings via sidecar (`FULCRUM_FEATURES=embeddings`) hybrid `0.6*BM25 + 0.4*cosine`; LLM fact extraction (`FULCRUM_FEATURES=memory-llm-extract`).
- **Schema**: `memories` adds `global boolean`, `importance text`, `embedding vector(1536) NULL`; `memory_links(from_id, to_id, relation, weight)`.
- **Surfaces**: Web (memory browser, context preview), CLI, TUI (memory search).
- **Dependencies**: Pillar 1, Pillar 2 (embeddings + LLM gates), Pillar 3 (`before_run` hook), Pillar 7 (doc-save triggers extraction).
- **Done when**: heuristic extractor produces memory rows from sample transcript; FTS retrieval ranks project+global rows correctly; context bundle assembles 4 slices under token budget; embeddings flag hybrid tested; LLM extraction default-off; promotion round-trips; all three surfaces at parity.

---

### Pillar 9: Repos + Git Supervision + Multi-Repo Dashboards
- **Value**: Registered repos get live supervision — local via filesystem watch, remote on-demand with LRU warm cache — surfacing branch state, recent commits, file tree, and per-repo dashboards.
- **Always-on**: chokidar watcher for local repos (reactive); on-demand sync for remote repos triggered by Symphony `before_run`; graphile-worker LRU cron keeps top-5 remote repos warm (daily); multi-repo dashboard (branch status, recent commits, open tasks per repo); repo state snapshot fed to context bundle; `fulcrum repo register/list/status/sync/settings` CLI `--json`.
- **Gated**: none.
- **Schema**: `repos` adds `supervision_mode`, `last_commit_sha`, `branch_count`, `last_synced_at`, `stale_since`.
- **Surfaces**: Web (dashboard, detail), CLI, TUI (repo browser).
- **Dependencies**: Pillar 1, Pillar 3 (`before_run` hook), Pillar 8 (context bundle).
- **Done when**: chokidar update within 2s of local file change; on-demand sync accurate; LRU cron job fires; CLI `--with-branches --json` well-typed; dashboard renders 3+ repos; all three surfaces at parity.

---

### Pillar 10: Artifacts + Lifecycle + Indexing + Retention
- **Value**: Every agent run's output files are harvested, indexed for search, linked to runs and tasks, and governed by retention policies.
- **Always-on**: Sandcastle `copyFileOut()` in `after_run` writes to `artifacts`; `search_documents` row per artifact; `edges` row `artifact→generated_by→agent_run`; preview (inline image/text, download link); retention policy per project (default: forever for projects, 90d for scratch); graphile-worker GC job; `fulcrum artifact list/get/download --json`.
- **Gated**: none.
- **Schema**: `artifacts(id, org_id, run_id, task_id, filename, mime, size, path, metadata_json, created_at)`; `artifact_retention_policies(project_id, kind, retention_days)`.
- **Surfaces**: Web (artifact browser, retention settings), CLI, TUI (artifact list).
- **Dependencies**: Pillar 1, Pillar 4 (copyFileOut), Pillar 11 (search index).
- **Done when**: run→artifact→search_documents pipeline end-to-end; edges row verified; GC deletes with 1-day policy; preview renders PNG+txt; all three surfaces at parity.

---

### Pillar 11: Search + Facets + Saved Searches + Cmd+K Palette
- **Value**: Unified search across all entities with faceted filters, saved searches, and a cmd+K palette dispatching actions.
- **Always-on**: PGlite FTS over unified `search_documents` (tasks, docs, memories, runs, artifacts); Orama in-browser for incremental search; facets: kind/project/sprint/doc_type/status/assignee/tags/date; saved searches via `saved_views` table; cmd+K (Bits UI Command) searches + dispatches commands; `fulcrum search --json`.
- **Gated**: semantic search via pgvector (`FULCRUM_FEATURES=embeddings`).
- **Schema**: `search_documents` adds `embedding vector(1536) NULL`; `saved_searches` (Pillar 1).
- **Surfaces**: Web (search bar, facet panel, cmd+K), CLI, TUI (search pane + palette).
- **Dependencies**: Pillars 1, 6, 7, 8, 10 (entities must be indexed).
- **Done when**: FTS returns ranked results across 5 entity kinds; facet filter correct; saved search round-trips; cmd+K opens on `Cmd+K`, dispatches commands; Orama benchmarks <100ms at 10k items; all three surfaces at parity.

---

### Pillar 12: Notifications + Activity Feed + Filtered Events
- **Value**: Every state change produces an event; users subscribe via per-user rules to an in-app feed; email, webhooks, Slack available behind flags.
- **Always-on**: `notification_rules` evaluated by graphile-worker against every `events` row; in-app feed (bell icon + feed page); `fulcrum notifications list/mark-read`; `fulcrum events list --filter --json`.
- **Gated**: SMTP (`FULCRUM_FEATURES=notify-email`); webhooks with retry+signing (`FULCRUM_FEATURES=outbound-webhooks`); Slack (`FULCRUM_FEATURES=notify-slack`); Discord (`FULCRUM_FEATURES=notify-discord`).
- **Schema**: `notification_deliveries(id, rule_id, event_id, channel, status, attempts, last_error)`.
- **Surfaces**: Web (feed, settings), CLI, TUI (notification pane).
- **Dependencies**: Pillar 1, domain pillars emitting events (3, 6, 7).
- **Done when**: rules evaluated for every new event; in-app feed renders last 50; SMTP sends with delivery row; webhook signed with retry; bell counter live; all three surfaces at parity.

---

### Pillar 13: API Surface (tRPC + OpenAPI + Outbound Webhooks)
- **Value**: Every operation callable via typesafe tRPC (all surfaces) and optionally via REST+OpenAPI 3.1 and outbound webhooks for external integrations.
- **Always-on**: tRPC v11 covering all domains; SvelteKit server-actions consume tRPC; every procedure Zod-validated with unit test; tRPC used by CLI codegen + TUI in-process.
- **Gated**: Hono + @hono/zod-openapi REST (`FULCRUM_FEATURES=public-api`); outbound webhooks (`FULCRUM_FEATURES=outbound-webhooks`) — `webhook_subscriptions` table, graphile-worker dispatcher, HMAC signing.
- **Schema**: `webhook_subscriptions(id, org_id, url, event_patterns[], signing_secret, active)`; `webhook_deliveries`.
- **Surfaces**: API consumed by all three surfaces.
- **Dependencies**: Pillar 1; all domain pillars (procedures per domain).
- **Done when**: every procedure has passing unit test with Zod; OpenAPI spec `/api/openapi.json` valid; webhook sends signed POST; tRPC consumed by CLI codegen and TUI; `bun run ci` tRPC type-check passes.

---

### Pillar 14: CLI (Auto-Codegen from tRPC, `--json` Everywhere)
- **Value**: Every tRPC procedure has a `fulcrum <domain> <verb>` binding, `--json` on every command, all from a single static binary.
- **Always-on**: Codegen reads tRPC + Zod → emits command tree with auto-help + flag parsing; `--json` flag on all commands; domains: projects, tasks, docs, memory, runs, repos, artifacts, search, notifications, skills, router, symphony, inference, components, doctor; hand-rolled interactive flows: `fulcrum init`, `fulcrum login`, `fulcrum tui`, `fulcrum web`, `fulcrum inference start/stop`; `bun build --compile` single binary.
- **Gated**: none specific — `FULCRUM_FEATURES` env var applies across commands.
- **Schema**: none.
- **Surfaces**: CLI only.
- **Dependencies**: Pillar 13 (tRPC source of truth); all domain pillars.
- **Done when**: codegen produces tree matching all tRPC paths; `fulcrum task list --json` returns typed JSON; `fulcrum doctor --json` covers all subsystems; binary runs on macOS+Linux; every domain has list/get/create/update/delete where applicable.

---

### Pillar 15: TUI (OpenTUI, Full Feature Parity)
- **Value**: Fully featured interactive terminal UI reaching feature parity with Web for every domain.
- **Always-on**: OpenTUI (Bun-native TS, JSX components) consuming tRPC in-process; screens: project list, kanban board, task detail, doc browser, doc editor, sprint board, burndown (ASCII/canvas), memory browser, live run monitor, repo browser, artifact browser, notification feed, search pane, cmd-palette; keyboard nav + shortcut map; `fulcrum tui` from binary.
- **Gated**: same `FULCRUM_FEATURES` flags as web.
- **Schema**: none.
- **Surfaces**: TUI only.
- **Dependencies**: Pillar 13, Pillar 14; all domain pillars complete before parity claimable.
- **Done when**: launches without error on macOS+Linux; task CRUD, sprint board, doc browser functional; live run monitor streams updates; cmd-palette dispatches same commands as Web; keyboard nav tested all screens; OpenTUI immaturity gate: if component library insufficient, fall back to ratatui (Rust) per gate documented in pillar PRD.

---

### Pillar 16: Web Shell Rebuild
- **Value**: Replace v0 admin UI with full Jira+Confluence-class SvelteKit app consuming tRPC, TipTap, svelte-dnd-action, LayerChart, shadcn-svelte.
- **Always-on**: SvelteKit routes for all domains; shadcn-svelte component kit; dark mode (cookie + mode-watcher); Sonic toasts; Vitest unit + Playwright e2e; cmd+K palette; kanban (svelte-dnd-action); TipTap editor (from Pillar 7 in routes); LayerChart burndown/velocity; every mutation → tRPC → SQL → events row; `bun run ci` includes `web:check`, `web:build`, `web:test`.
- **Gated**: Yjs+Hocuspocus collab cursors (`FULCRUM_FEATURES=real-time-collab-server`).
- **Schema**: none — consumes Pillars 1–15.
- **Surfaces**: Web only.
- **Dependencies**: Pillars 1–13 complete.
- **Done when**: all routes render without server errors; `bun run ci` web gates pass; Playwright covers create-project, create-task, kanban-move, create-doc, search; burndown renders from test sprint; TipTap save+reload lossless; dark mode persists; cmd+K dispatches 10+ commands.

---

## Cross-Cutting Requirements

- Every feature: unit + integration tests TDD-first (RED→GREEN→REFACTOR before merge).
- Every PRD: failure gates + 2nd/3rd fallbacks per C3.
- Every pillar's Done criteria includes "all three surfaces reach feature parity before pillar marked done" per C4.
- No `MVP` / `phase 2` / `later` anywhere per C1.
- Online paths gated behind `FULCRUM_FEATURES`, off by default per C1.
- All deps MIT/Apache/BSD. No AGPL/SSPL/BSL embedded. AGPL tools (Plane, Logseq) used for schema reference only.
- `bun run ci`: lint, type-check, unit, integration, Playwright e2e, web build, symphony-conformance, skills-lock validation.
- `fulcrum doctor --json` covers all subsystems; CI fails on non-zero exit.
- No surface owns business logic — all behind tRPC.
- `assertPermission()` on every tRPC procedure; lint rule enforced.
- Conventional commits (`type(scope): subject`); git-cliff CHANGELOG; never skip hooks.
- Skills never installed to `~/.agents/`; per-agent dirs only.

---

## Open Follow-Up Streams

Items the user may want to scope in a future session:
- i18n / l10n — string extraction, RTL, locale-aware formatting.
- Theming — per-user/per-org theme overrides beyond dark/light.
- Enterprise SSO — WorkOS or Authelia proxy; SAML/SCIM provisioning.
- Mobile — React Native or Capacitor shell over same tRPC API.
- Plugin system — registry for user-defined agent types beyond the five shipped CLIs.
- Telemetry opt-in — usage analytics behind explicit consent flag.

---

All gray areas resolved per DECISIONS.md as of 2026-05-01.
