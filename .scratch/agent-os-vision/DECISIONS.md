# Fulcrum Agent OS — Locked Decisions

Tracks user-confirmed answers from the grill-me wizard. Source of truth for the master PRD + per-pillar PRDs.

---

## Foundational constraints (apply globally)

### C1. Online features SHIPPED but DISABLED by default behind feature flags
- Locked: 2026-05-01 by user. Verbatim: "I want a full product with everything from the start only online features are planned and designed and broken down and taken into consideration but not enabled by default defer using them, you thought i meant defer as we will not plan or design or code them down!! no we will just disable them by default behind feature flags … all shipped no skips for anything nothing is called mvp everything is valuable all to be done in full".
- Interpretation: every online-touching feature (LLM-driven router fallback, embeddings/pgvector retrieval, mem0/Zep extraction, real-time SaaS collab, OAuth providers, etc.) IS designed, planned, broken-down, implemented, tested, and SHIPPED.
- The implementation lives behind a feature flag (single global `FULCRUM_ONLINE=1` or per-feature `FULCRUM_FEATURES=router-llm,embeddings,...`).
- Default state at install is OFF for every online feature. User flips flags individually when they want to test.
- Local-equivalent path is the always-on fallback: Postgres FTS retrieval, deterministic rules-only router, local CI, no external SaaS calls. Both paths must coexist, both must be tested.
- "MVP" / "phase 2" / "later" language is banned in our PRDs. Every pillar ships fully.

### C2. Local-only is the default; SaaS schema-ready from day 1
- Local mode = synthetic default org + auto-created default user, no auth prompts.
- Schema includes `org_id` everywhere, `user_id` where applicable, composite indexes on `(org_id, sort_col)`. SaaS mode flips a flag, no schema rewrites.

### C3. Research → recommend → plan → grill → break-down → execute, every domain
- Tool/dep recommendations live in `.scratch/agent-os-vision/research/*.md`.
- Failure gates + 2nd/3rd fallbacks per recommendation.
- Master PRD enforces: every pillar's PRD has a "if this fails, fall back to X" section.

### C5. "Out of scope" framing is BANNED for any feature ever mentioned
- Locked: 2026-05-01 by user. Verbatim: "You marked a lot of shit out of scope when i said they have to be made but not focused on, and be disabled by default behind feature flags!!".
- Every PRD's `## Out-of-scope` section is RESTRICTED to:
  1. Items genuinely not in user's verbatim ask AND not in any locked decision (e.g. time-tracking, model fine-tuning) — even these must be explicitly named so it's clear we considered them.
  2. Cross-references to features owned by another pillar — must read "Owned by Pillar N (link)" — never "deferred", never "future", never "MVP-only".
- Anything that was mentioned in the verbatim ask, the OPEN-QUESTIONS doc, the research findings, or the DECISIONS doc MUST be either:
  - In `## Always-on features` (lands enabled by default), or
  - In `## Gated features` with a specific `FULCRUM_FEATURES=<flag>` name.
- Examples that were wrongly placed out-of-scope and must be reclassified as gated:
  - Real-time multi-cursor editing (Yjs/Hocuspocus server) → gated `real-time-collab-server`.
  - Sandcastle cloud sandbox providers (Vercel/Daytona/Modal/E2B) → gated per-provider.
  - Linear / Jira / GitHub Issues connectors → gated per-connector.
  - Cross-org skill marketplace → gated `skill-marketplace`.
  - LLM-narrated weekly sprint digest → gated `report-llm-narration`.
- Reviewer rule: a PR that introduces an out-of-scope item without showing it falls in the (1)/(2) carve-out fails review.

### C4. Three surfaces, all shipped — Web+APIs primary, full CLI, full TUI
- Locked: 2026-05-01 by user. Verbatim: "we also need it to be web + apis 1st but also ship full cli direct calls and a fully featured TUI too but last but i want all".
- Build order (priority): **Web + APIs** primary attention → **CLI direct-calls** full parity → **TUI** fully featured, last.
- All three reach feature parity by release. None is "MVP / phase 2 / later".
- Single shared core: every domain operation lives as a tRPC procedure (always-on internal), exposed via:
  1. **SvelteKit web UI** consuming tRPC directly (server-actions + client query).
  2. **External REST + OpenAPI 3.1** (`@hono/zod-openapi` wrapper, gated by `FULCRUM_FEATURES=public-api`).
  3. **CLI** (`fulcrum <domain> <verb> [flags]`) — every tRPC procedure has a CLI binding via codegen / thin wrapper. `--json` output on every command.
  4. **TUI** — interactive terminal UI consuming tRPC directly in-process. Browse projects / tasks / docs / runs, edit, dispatch agents, view burndown, search, cmd-palette in TUI.
- No surface owns business logic. All logic lives behind tRPC. Surfaces are presentation only.

---

## Locked answers (per OPEN-QUESTIONS.md)

### Q1. Tracker autonomy → A
Fulcrum's PGlite tasks = canonical. Symphony adapter targets our own kanban. Linear = optional future connector.

### Q2. Docker prerequisite → A
Recommended not required. Default `noSandbox`; doctor warns; `--enable-docker` opts in to container hardening.

### Q3. Symphony conformance gating → A
Both: test suite (`symphony-conformance.test.ts` per REQUIRED item) + trace doc (`docs/symphony-conformance.md`). CI fails on either.

### Q4. Auto-assign router layer → A (re-clarified per C1 update)
Pre-dispatch: `src/router/auto-assign.ts` runs BEFORE Symphony. Three-tier resolution, all shipped:
1. Explicit `--agent` override always wins.
2. json-rules-engine — declarative rules per project, evaluated synchronously, deterministic.
3. LLM fallback (Haiku-class) — **shipped + designed + tested**, **gated behind `FULCRUM_FEATURES=router-llm`**, OFF by default. When OFF and rules-engine returns no match → Fulcrum prompts user once with a "no rule matched, pick an agent or write a rule" interactive choice and stores the answer as a learned rule.

### Q5. Mastra → SKIP. Vercel AI SDK → SKIP. Build a sidecar inference sub-project instead.
Locked: 2026-05-01 by user. Verbatim: "skip mastra and vercel api handroll it with python or rust sub project with small embeded models that do whatever we need, no vercel sdk or apis, we can add support for url based models too for ollama or openai api or vercel or anthopic whatever recomended set of backends but we ship with simple embeded in a project wrapper and allow local ollama or lm studio and any online backed with url and apikey".

- New sub-project under `inference/` (separate package, single binary). **Rust** preferred over Python for single-binary distribution, faster startup, fewer end-user deps. Final language pinned in inference-pillar PRD after a tiny POC — but Rust is the default plan.
- Bundled Rust crates target: `fastembed-rs` (embeddings) + one of `llm` / `candle` / `mistral.rs` (text generation via llama.cpp bindings). All MIT/Apache.
- Ships with small embedded models, downloaded on first use:
  - Embeddings: bge-small-en or all-MiniLM-L6-v2 (~25–100 MB).
  - Generation: Llama-3.2-1B / Qwen2.5-0.5B / Phi-3.5-mini (~0.6–2 GB).
- Backend abstraction (TS wrapper picks per-feature):
  1. `embedded` (default, ships in box)
  2. `ollama` (localhost Ollama)
  3. `lm-studio` (localhost LM Studio)
  4. `openai-compatible` (URL + API key — covers OpenAI / Anthropic / Together / Groq / Vercel / DeepSeek / etc.)
- Communication: local Unix socket / stdio JSON-RPC between TS and the Rust sidecar. Auto-spawn-and-supervise via existing job-queue / lifecycle plumbing.
- Per-feature flag picks backend AND opts feature in/out (e.g. `FULCRUM_FEATURES=router-llm:embedded,embeddings:ollama`).

### Q5b. In-process LLM agents → Re-derived from verbatim ask
Locked: 2026-05-01 by user. User pushed back: "Who named these inline agents who picked this workflow?".

Earlier I (Claude) speculatively listed memory-extractor, doc-summarizer, daily-digest, and auto-tagger. **None of those were user-requested.** Removed.

Surviving in-process LLM needs, all derived from the verbatim ask:
- **Router LLM fallback** (Q4) — explicit user request: "auto assign default task to cli agents based on task type or other criteria". Used only when json-rules-engine returns no match. Single small generation call against the inference sidecar. Gated by `FULCRUM_FEATURES=router-llm`.
- **Semantic memory extraction** (optional) — implicit in "preserves and provide memory and context management". Heuristic extraction (regex / heading parsing / file-touched extraction) is the always-on default; LLM-driven extraction is shipped + gated by `FULCRUM_FEATURES=memory-llm-extract` for users who want richer fact extraction.
- **Reporting / burndown / per-project digest** — explicit ("burndown charts and reporting per project"). All deterministic SQL via the Q8 cached + on-demand path. **No LLM required** for the core reports. (Optional: an LLM-narrated weekly summary as a feature flag — postponed unless user adds it.)

Everything else (doc-summarizer, daily-digest, auto-tagger) is OUT until user explicitly asks for them.

### Q17. Memory retrieval → FTS always-on, embeddings shipped + gated (re-clarified per C1 update)
- Postgres FTS (`tsvector` + `tsquery`) + keyword-based ranking is the always-on path. Local, deterministic.
- pgvector + embeddings + hybrid (FTS + cosine) retrieval is **shipped + designed + tested**, **gated behind `FULCRUM_FEATURES=embeddings`**, OFF by default. Schema includes the embedding columns; pipeline writes embeddings only when flag is on.
- Local-embedding model (e.g. via `transformers.js` or a `llama.cpp` sidecar) is the preferred online path so users can flip the flag without an API key. External provider (Anthropic/OpenAI/Voyage) wired as a secondary path, also gated.

### Q6. Symphony submodule sync → Daily auto via local CI
No GitHub Actions / remote runners. A local cron / git hook / `fulcrum symphony sync --daily` job runs daily, does `git submodule update --remote vendor/openai-symphony`, diffs SPEC.md, runs `bun test src/orchestration/__tests__/symphony-conformance.test.ts`, surfaces drift in a local report and (optionally) opens a local branch for review.

### Q19. Skills sync from mattpocock/skills → Daily auto via local CI (same as Q6)
`fulcrum skills sync --fetch-upstream --daily`. Diffs each SKILL.md, auto-merges non-conflicting changes, surfaces conflicts in `skills.lock.json[<skill>].upstream_conflict` for manual resolution. Same local-CI pattern as Symphony.

### Q20. Skill storage layout → Per-agent folders (current)
Each agent uses its own dir (`~/.claude/skills/`, `~/.codex/skills/`, `~/.gemini/extensions/<ext>/skills/`, etc). Never `~/.agents/` (global rule from `~/.claude/CLAUDE.md`). Multi-target install handled by the existing `fulcrum component install` package manager. This means N copies per skill across agents — the package manager keeps them in sync.

### Q7. Sprints/cycles → Full implementation, shipped
Schema, sprint planning board (drag from backlog with capacity preview), active-sprint board, burndown per sprint, velocity rollup, retrospective notes — all built. No "phase 2".

### Q8. Burndown / velocity / cycle-time → Both on-demand and cached
- On-demand path queries `events WHERE subject_kind='task' AND verb='status_changed'` for ad-hoc drill-downs.
- Pre-computed `metrics_cache` table written by a graphile-worker rollup job, used for dashboard tiles that load on every page render.
- Both paths shipped, both tested. Cache invalidation: rollup job re-runs whenever events for a (project, sprint) tuple advance past the last-rollup cursor.

### Q9. Custom-fields engine → Full engine shipped, defaults pre-configured
- User-definable fields per project: text / select / multi-select / number / date / user / url / json.
- Schema: `custom_field_defs(id, project_id, name, type, config_json, required, archived)` + `tasks.custom_fields jsonb` for values.
- Ships with our defaults configured: status, priority, assignee, due_date, estimate, parent, tags, repo, sprint.
- UI: project Settings → Fields tab to define; task detail page renders the configured fields in order.

### Q10. Saved views → DB-persisted, shareable
- `saved_views` table: `{id, project_id, scope ('private'|'project'|'org'), name, query_json (filter AST), order_by, created_by, shared_with_users, shared_with_teams, default_for}`.
- URL params for transient views; saved-view CRUD for named/shareable views.
- Query JSON schema locked now as a typed AST so future facets/operators slot in without schema migrations.

### Q-inference-lang. Inference sidecar language → Rust
Single static binary, no Python deps for end users. Crates: `fastembed-rs` (embeddings) + `candle` / `llm` / `mistral.rs` (generation). Final crate selection pinned in the inference-pillar PRD after a tiny POC vs. each candidate.

### Q11. Doc taxonomy → Per-project tree + global tree + per-doc doc_type
- Schema: `docs.parent_id` adjacency tree + `docs.scope ('project'|'global')` + `docs.doc_type ('spec'|'adr'|'wiki'|'runbook'|'meeting'|'postmortem'|'rfc'|'note'|'scratch')` enum.
- Two trees in the UI sidebar: project-scoped (one per project) + global (org-wide).
- Doc-type drives template + required fields per Q13.

### Q13. Frontmatter editing → Form UI + raw YAML toggle
- TipTap custom block renders a Zod-validated form for the doc-type's known fields.
- Toggle reveals raw YAML for power users / non-standard keys.
- Both paths write the same canonical YAML on save (round-trip stable).

### Q14. Document version history → Snapshot + delta hybrid
- Schema: `doc_versions(id, doc_id, version_num, snapshot jsonb NULL, delta jsonb NULL, created_at, author_id)`.
- Full snapshot every N saves or per-day; jsondiffpatch deltas between snapshots.
- Fast diff view, fast restore, balanced storage. Yjs CRDT log used for live collab; doc_versions used for human-readable history surface.

### Q15. Memory scoping → Per-project default + explicit `global` flag
- Schema: `memories.project_id` + `memories.global` boolean.
- Retrieval default: `WHERE org_id=$1 AND (project_id=$2 OR global=true)`.
- Promotion: humans/agents flip `global=true` on a memory row when it should travel cross-project.

### Q16. Memory extraction → Hybrid heuristic-always + LLM-gated
- Heuristic extractor always-on: regex / heading parser / file-touched scanner / decision-line patterns over agent run transcripts and doc save events.
- LLM extractor shipped + gated by `FULCRUM_FEATURES=memory-llm-extract`. Backed by inference sidecar.
- Both write to the same `memories` table; rows carry `source: 'heuristic' | 'llm' | 'manual'`.

### Q17. Retrieval ranking algorithm → BM25 + recency + importance, hybrid w/ embeddings when flag on
- Always-on score: `bm25 + exp(-age_days / 30) + (importance == 'high' ? 1.0 : 0.0)`.
- When `FULCRUM_FEATURES=embeddings` ON: `score = 0.6 * normalized_bm25 + 0.4 * cosine(query_embed, memory_embed)`.
- Project-scoped + global rows queried in one union, deduped on `id`, sorted by score, top-20 returned.

### Q18. Context bundle for an agent run → All four slices
1. Top-N memories (project + global) via Q17 retriever.
2. Linked docs from wikilinks in the task description (one hop, truncated).
3. Recent agent runs on the same task + sibling tasks (last K transcripts / status events).
4. Repo state snapshot (current branch, recent commits, file tree skim) from Symphony `before_run` hook.
5. Skill prompts for the chosen agent + task type (per-agent SKILL.md content).
- Bundle assembled in `src/context/assemble.ts`, capped by token budget (truncate slices proportionally).

### Q21. Local-mode auth bootstrap → Auto-create default user, passkey-first, password fallback
- First `fulcrum init` creates `admin@local` user, persists session in SQLite, no prompt.
- Optional WebAuthn passkey enrollment via Better-Auth.
- Email + password fallback when passkey unavailable.
- Multi-user path = "invite collaborator" → email link or local share token.

### Q22. Composite `(org_id, ...)` indexes → Add NOW on every tenant-scoped table
Mandatory at table-creation time. `CREATE INDEX … (org_id, …)` on tasks / docs / memories / agent_runs / events / artifacts / repos / sprints / saved_views / search_documents / doc_versions / custom_field_defs / saved_searches / etc.

### Q23. `events` table `org_id` backfill → Migration with NOT NULL + default-org backfill
Single migration:
1. `ALTER TABLE events ADD COLUMN org_id uuid REFERENCES orgs(id)`.
2. Backfill: `UPDATE events SET org_id = '00000000-0000-0000-0000-000000000001'` (well-known local org).
3. `ALTER TABLE events ALTER COLUMN org_id SET NOT NULL`.

### Q-permissions. Permission engine → Better-Auth org plugin + node-casbin (gated)
- v1 baseline: Better-Auth's `organization` plugin enums (owner/admin/member/guest) + `hasPermission` checks called from server actions. Always on.
- Richer ABAC policies via `node-casbin` in-process, gated by `FULCRUM_FEATURES=casbin-policies`. Uses the same Postgres for policy storage. No sidecar.
- OpenFGA / Permify deferred unless we need cross-resource Zanzibar-style relationships.

### Q-flag-granularity. Online-feature flag granularity → Per-feature flags
`FULCRUM_FEATURES=router-llm,embeddings,memory-llm-extract,saas-auth,real-time-collab-server,external-llm-provider,...` — each feature flips independently. No `FULCRUM_ONLINE` master switch, no tiered presets.

### Q24. Repo supervision sync cadence → Local: filesystem watch | Remote: on-demand + LRU
- **Local repos** (cloned to disk): chokidar-based filesystem watcher; sync state on file changes. Reactive, no polling.
- **Remote-only repos**: on-demand sync triggered by Symphony `before_run` hook for the task's repo. Background `graphile-worker` keeps the top-5 most-recently-touched remote repos warm via daily cron. `fulcrum repo list --with-branches` for a one-shot full sync.

---

### Q25. Artifact lifecycle → Harvest in Symphony `after_run` + index for search
- Sandcastle `copyFileOut()` extracts artifacts from sandbox → stored in `artifacts(id, org_id, run_id, task_id, filename, mime, size, path, metadata_json, created_at)`.
- Each artifact gets a `search_documents` row (filename + content preview).
- `edges(from_kind, from_id, to_kind, to_id, kind)` row links `artifact → generated_by → agent_run`.
- Retention policy table per project (default: keep forever for projects, 90 days for scratch).

### Q26. Notifications → Per-user rules + filtered events + in-app feed; SMTP/webhook gated
- `notification_rules(user_id, event_pattern, channels[])` table, evaluated against every emitted event.
- In-app activity feed + bell-icon counter — always-on.
- Email (SMTP), webhook, Slack/Discord channels — shipped + gated per-channel by `FULCRUM_FEATURES=notify-email,notify-webhook,notify-slack,…`.
- No Novu / SaaS notification platform.

### Q27. Search → Free-text + facets + saved searches + cmd+K palette, all shipped
- PGlite FTS over a unified `search_documents` view that ingests rows from docs, tasks, memories, agent_runs, artifacts.
- Faceted filters: kind, project, sprint, doc_type, status, assignee, tags, date range.
- Saved searches reuse the `saved_views` table from Q10 (filter AST + facets + text query).
- cmd+K palette searches across all kinds + dispatches commands.

### Q28. API surface → tRPC internal (always-on) + OpenAPI external (gated)
- Internal: tRPC router shared between SvelteKit server-actions and any in-process Rust/Bun callers. Always-on.
- External REST + OpenAPI 3.1 spec via `@hono/zod-openapi` wrapper around the same procedures. Shipped + gated by `FULCRUM_FEATURES=public-api`.
- Outbound webhooks: dispatcher table + per-rule retry budget + signing secret. Shipped + gated by `FULCRUM_FEATURES=outbound-webhooks`.

---

### Q-tui-lib. TUI framework → OpenTUI (Bun-native, TS)
JSX-style components in TS, runs on Bun, same toolchain as the rest of Fulcrum. Failure gate: if OpenTUI's component library is too immature when we get to the TUI pillar, fall back to ratatui (Rust) sharing the inference-sidecar workspace.

### Q-cli-shape. CLI binding strategy → Auto-generated from tRPC schema
Codegen step reads tRPC procedures + Zod schemas → emits a `fulcrum <domain> <verb>` command tree with auto-help, `--json` output, flag parsing. Single source of truth = tRPC. Hand-rolled exceptions only for interactive flows (e.g. `fulcrum init`, login wizards).

### Q-distribution. Distribution → Single `fulcrum` binary with subcommands
- `fulcrum <domain> <verb> ...` → CLI commands (codegenned).
- `fulcrum tui` → launches the OpenTUI app in-process.
- `fulcrum web` → runs the SvelteKit server (dev or prod build).
- `fulcrum inference` → starts/stops the Rust inference sidecar.
- All shipped in one binary built via `bun build --compile`.

---

### Q29. Pre-built platform binaries → ALL FOUR + source
Ship pre-built binaries for macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64. Source-only path always available via `bun build --compile`. Release pipeline cross-compiles all targets; if any target fails, the release publishes the rest with a warning rather than blocking entirely.

### Q30. `fulcrum login` surface → Web-only
Login UI lives in SvelteKit `/auth/login`. Headless / TUI-only setups get an auto-created `admin@local` user from `fulcrum init` per Q21; if they need different identities they spin up the web app once. No standalone CLI login flow.

### Q31. Context-bundle token budget → Per-agent default + configurable
Each agent profile declares its own preferred budget (e.g. claude-code: 50000, codex: 16000, pi: 8000); fall back to 8000 default. `tenant_settings(org_id, key='context.token_budget.<agent>', value=N)` lets users override. Assembler truncates slices proportionally if exceeded.

### Q32. `edges` table scope → Hybrid (FKs same-domain + edges cross-domain)
- Foreign keys for same-domain hierarchies: task parent/child, doc parent/child, sprint→tasks.
- `edges(from_kind, from_id, to_kind, to_id, kind)` for cross-domain + user-created links: artifact→generated_by→agent_run, doc→references→task, memory→about→doc, doc→wikilink→doc, etc.
- Pillar 1 freezes the registry of edge `kind` values + cardinality + query semantics in a "Entity Relationship Graph" subsection. New `kind` values land via PRD addendum, not free-form.

### Q34. Inference sidecar lifecycle → On-demand spawn via graphile-worker
Sidecar starts when the first job needing it lands, supervised by graphile-worker (respawn-on-crash, heartbeat). ~1-2s first-call latency, zero idle cost. `fulcrum inference start --foreground` for debugging. `fulcrum inference stop` shuts it down explicitly.

### Q35. Artifact retention → Forever for project artifacts, 90d for scratch/test, per-project override
- `artifact_retention_policies(org_id, project_id NULL, kind text NULL, retention_days int NULL)`. NULL retention = forever.
- Daily graphile-worker prune job. Soft-delete first; hard-delete after grace period. Manual confirm required for any single sweep over 100MB or 100 files.
- Audit-log every prune action.

### Q36. Sprint model → Both calendar-based AND work-unit, org chooses per-project
- `projects.sprint_model enum ('calendar'|'work-unit'|'none')`.
- Calendar: `sprints.start_date` + `sprints.end_date`, burndown x-axis = calendar days.
- Work-unit: `sprints.target_points`, sprint ends when N story points complete; burndown x-axis = points-remaining over arbitrary time.
- Both burndown chart variants ship; project-config picks which renders.

### Q38. Web delivery → SvelteKit web-only first, Tauri/PWA gated
SvelteKit baseline web-only. Tauri desktop wrapper designed + implemented + gated `desktop-app`. PWA offline mode designed + implemented + gated `pwa-offline`. Both ship in Pillar 16; both off by default.

### Q-cross-cut. Cross-cutting features all in scope (per user multi-select)
Always-on (default-enabled):
- Theming engine (org + user themes, CSS vars, font/spacing/animation prefs).
- Local error crashlog (`~/.fulcrum/state/errors/YYYY-MM-DD.jsonl`).
- Secret management + encryption-at-rest via nacl.secretbox + system keyring (macOS Keychain / Linux Secret Service / Windows Credential Manager).
- Local backup (`fulcrum backup`/`restore`).
- Local telemetry collection to PGlite.
- Feature-flag rollout (per-user %, cohorts, A/B) via `experiment_assignment` table.
- Import/export of org data in native JSON.

Gated (shipped + designed + flag OFF by default):
- `i18n` — paraglide-js + locale selection UI + translation JSON extraction + RTL CSS flips.
- `telemetry-remote` — outbound aggregation.
- `error-reporting-remote` — outbound crash reports.
- `vault-integration` — remote secret managers (HashiCorp Vault, AWS Secrets Manager, etc).
- `scheduled-backups` — cron + remote-storage backups.
- `experiments` — full A/B experiment tracking + UI.
- `import-csv`, `import-linear`, `import-jira`, `import-plane`, `export-csv` — per-format connectors (Pillar 13 owns connector framework).

### Q-sidecar-path. Inference sidecar workspace location → `./inference/` at repo root
Sibling to `src/`. `inference/Cargo.toml` + `inference/crates/{client,fastembed,generation,protocol}/`. Rust-only CI lane. Build pipeline produces a binary that the single `fulcrum` Bun-compiled binary spawns via stdio JSON-RPC.

### Q-governance. Project governance + community files → ALL four ship
- `GOVERNANCE.md` — mission, single-author + open-contribution model, triage SLA, decision-making process for feature PRs, path to v1.0.
- `SECURITY.md` — responsible disclosure email, vulnerability reporting flow, embargo timelines.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 template.
- `VERSIONING.md` — semver policy (0.x = breaking changes OK; 1.0 = all 16 pillars shipped + 90 days bug-bash window), release cadence (target: monthly minor, on-demand patch), v1.0 readiness criteria.

---

## Auto-locked items from EXTRA-GAPS.md (no user grill required — applied per recommended answers)

### A1. Toolchain SLA → Pillar 1 owns
Add to Pillar 1 PRD: target platform matrix (per Q29), Bun version pin in package.json `engines`, CI timeout per stage, hotfix SLA = "critical security fixes release within 24h", per-target failure fallback policy.

### A2. `fulcrum doctor` coverage → Each pillar PRD must add a "Doctor integration" subsection
Schema: list of checks added, JSON output shape, Zod schema, failure recovery guidance. Pillar 13 freezes `doctor.run` tRPC procedure + REST endpoint when `public-api` flag on.

### A3. Migration up/down + schema-version tracking → Pillar 1 owns
- Every migration ships paired `up_NNNN_<slug>.sql` + `down_NNNN_<slug>.sql` files. The down file MUST losslessly reverse the up where possible; where lossy (e.g., dropping a column with data), the down file refuses to run unless `--force` is passed and emits a warning into events.
- Schema version is tracked in a `schema_migrations(version int PRIMARY KEY, name text, applied_at timestamptz, checksum text, direction text CHECK in 'up'|'down')` table.
- `fulcrum db migrate --target-version <N>` migrates up or down to reach the target version, validating checksums against on-disk files first.
- Pre-upgrade compat check: doctor verifies `schema_migrations.MAX(version) <= current binary's max known version` and refuses to start if downgrade would be required.
- SaaS: gated `saas-multi-version-migration` flag enables canary-style migrations (run on a single tenant before fan-out).

### A4. Audit log retention + query + export → Pillar 12 owns extended scope
- Default retention: 1 year per org, configurable per org via `event_retention_policy(org_id, days)` table.
- `audit.list` tRPC + `/audit` web view + `fulcrum audit-log [list|export|query --filter --since --until --format json|csv]` CLI.
- Per-event-type Zod payload schemas registered at module-init; `events.payload` validated on write.
- Compliance export: full org events as JSON or CSV.

### A6. tRPC API contract → Pillar 1 freezes domain skeleton + Pillar 13 finalizes signatures
Pillar 1 ships: tRPC router + auth context + tenancy context + base Zod schemas (Org, User, Project, Task, Doc, Memory, AgentRun, Artifact, Repo, Event) + skeleton procedures per domain (`<domain>.list/get/create/update/delete`). Pillar 13 expands to full procedure surface + OpenAPI 3.1 generation via `@hono/zod-openapi` + outbound webhooks + connector framework.

### C1. Default model picks for embedded inference → Locked in Pillar 2
- Embeddings: `bge-small-en-v1.5` (~33 MB, BAAI, MIT) — default. Fallback: `all-MiniLM-L6-v2` (~22 MB, Apache-2.0).
- Generation: ship 3 size tiers user picks via config — `Qwen2.5-0.5B-Instruct` (small/fast, ~600 MB), `Llama-3.2-1B-Instruct` (mid, ~1.3 GB), `Phi-3.5-mini-instruct` (large, ~2.5 GB). Default = Qwen2.5-0.5B; user can `fulcrum inference models pull <name>` and `fulcrum inference models default <name>`.
- Tokenizer: model-bundled (each model ships its own tokenizer.json).

### C2. Default `doc_type` → Required, default `note`
`docs.doc_type` NOT NULL. Creation form preselects `note`. CLI `fulcrum docs new --type <kind>` default `note`. Doc-type registry shipped: `note, spec, adr, wiki, runbook, meeting, postmortem, rfc, scratch`. Each has a default template (Pillar 7).

### C3. Default routing rules → Empty + bundled examples
`fulcrum init` creates an empty `routing_rules` table. Examples shipped at `docs/routing-rules.example.json` (e.g. `refactor → claude-code`, `bug-fix → codex`, `docs → claude-code`, `agent-os → codex`). User imports via `fulcrum routing import docs/routing-rules.example.json`.

### C4. Skill upstream sync mechanism → graphile-worker daily cron + manual UI/CLI conflict resolution
- Scheduler: graphile-worker recurring task `skills:sync-upstream` triggered daily.
- Conflict: writes to `skills.lock.json[<skill>].upstream_conflict`; surfaces in TUI Settings → Skills + Web `/settings/skills` + CLI `fulcrum skills conflicts`.
- Resolution: keep-local / take-upstream / merge-manually (open in editor). Resolution recorded in `events`.
- Rollback: `fulcrum skills rollback <skill> --to <version>` restores from `skills.lock.json` history.

### D1. Orchestration state column → `agent_runs.orchestration_state` (NOT `symphony_state`)
Generic name allows future runners (custom dispatch loops, alternate orchestration libs) without rename migration. Symphony adapter writes/reads via this column.

### D3. Memory scoping → enum `memories.scope ('global'|'project'|'task'|'user')`
Replaces the original boolean. Future-proof. Default = `'project'` on insert when project_id provided; `'global'` when project_id NULL. `'task'` and `'user'` reserved for future scoping (task-context-specific memory, per-user notes).

### D4. Default local org UUID → `00000000-0000-0000-0000-000000000001` documented + reserved
- Pillar 1 PRD documents the well-known UUID.
- Migration check: SaaS instances reject this UUID as an org create-time choice.
- `fulcrum doctor` reports if multiple orgs share this UUID (collision detection).

### D5. Feature-flag naming → lowercase-with-hyphens, comma-separated env var
- Flag names: `router-llm`, `embeddings`, `memory-llm-extract`, `real-time-collab-server`, etc.
- Env: `FULCRUM_FEATURES=router-llm,embeddings,real-time-collab-server` (case-insensitive parser; canonicalized to lowercase).
- DB column `feature_flags.name text` UNIQUE per org. Zod regex `^[a-z][a-z0-9-]*$` enforced at registration.

---

## Status: All gray-area questions resolved
2026-05-01: Q1–Q38 (incl. Q29, Q30, Q31, Q32, Q34, Q35, Q36, Q38, Q-cross-cut, Q-sidecar-path, Q-governance) + auto-locks A1/A2/A4/A6 + C1–C4 (auto) + D1/D3/D4/D5 (auto) + foundational constraints C1–C5 all locked.
Ready: technical-design retrofit on PRDs 1–12 + write PRDs 13–16 + remaining /to-issues + MASTER-PLAN + coverage check.

## Pending grill batches (none — all resolved)

- Batch 2: orchestration depth — Q6 (Symphony submodule sync cadence), Q19 (skills upstream sync), Q20 (skill namespacing), Q24 (repo supervision sync cadence).
- Batch 3: tasks/scrum — Q7 (sprints in MVP?), Q8 (burndown realtime vs cached), Q9 (custom fields scope), Q10 (saved views).
- Batch 4: docs/editor — Q11 (taxonomy), Q12 (collab in MVP?), Q13 (frontmatter form), Q14 (version history strategy).
- Batch 5: memory + context — Q15 (per-project vs global scoping), Q16 (fact extraction trigger — needs C1 re-eval), Q18 (retrieval algorithm).
- Batch 6: multi-user + tenancy — Q21 (auth bootstrap), Q22 (composite indexes now? recommended yes), Q23 (events.org_id retro-add).
- Batch 7: artifacts/notifications/search/API — Q25, Q26, Q27, Q28.

---

## C6. No plaintext SQL — class-driven NestJS-style data layer
- Locked: 2026-05-01 by user. Verbatim: "why the fuck we are using old way of plain sql code in queries or migrations everything should be class driven similar to how nestjs does i do not want to see sql queries or code or migration i do not want any plaintext sql in the project".
- Final tier (after research-first synthesis): **Tier C — lenient strict**. Forbidden: hand-written `.sql` files in repo; raw SQL strings in production app code (services, repositories, tRPC procedures, doctor checks, scripts); tagged-template SQL outside ORM-generated migration class files; `db.exec("...")` / `pool.query("...")` patterns. Permitted (sanctioned escape hatch only): `addSql(...)` / `Migration.up()` strings inside ORM-generated TypeScript migration class files at `src/db/migrations/Migration<timestamp>.ts` — these are auto-emitted by MikroORM CLI from entity decorator diffs, never hand-written.
- Reviewer rule: any PR containing `*.sql` files (other than tests/fixtures), `pool.query("...")`, `db.exec("...")`, raw `sql\`...\`` template tags in non-migration files, or `CREATE TABLE` / `INSERT INTO` / `SELECT ... FROM` literals in `.ts` source outside `src/db/migrations/` fails review.

## C7. ORM stack → MikroORM v7 (with `mikro-orm-pglite` driver)
- Locked: 2026-05-01 by user.
- Primary: `@mikro-orm/core` v7.x + `@mikro-orm/postgresql` (SaaS mode) + `mikro-orm-pglite` (community PGlite driver, local mode).
- Decorator mode: ES (Stage-3) — `@mikro-orm/decorators/es` import path. Pairs with needle-di Stage-3 DI container.
- Migration tooling: `@mikro-orm/migrations` snapshot-based generator. Migrations live at `src/db/migrations/Migration<timestamp>.ts`.
- pgvector: `pgvector/mikro-orm` `VectorType` with explicit `length` per property to dodge schema-diff drift (issue #6008). Gated `embeddings` flag controls extension registration at boot.
- FTS: `@Index({ expression: "gin(to_tsvector('english', ...))" })` — single DDL string per index, decorator-bound (carve-out under C6).
- Casbin: custom `FulcrumCasbinAdapter` (~200 LOC) implementing the 5-method node-casbin adapter interface against MikroORM `EntityRepository`. No `casbin_rule` table managed by Casbin; Fulcrum owns table via `@Entity` class. Gated `casbin-policies` flag.
- Failure gates (C3 mandate):
  - Gate-1 spike: 1-week PGlite + Bun 1.3.x compatibility test of `mikro-orm-pglite` (Date round-trip, FK cascading, transaction rollback, schema-generator on PGlite WASM). If fails → 2nd choice: switch to TypeORM + lose FTS until pgvector-FTS-on-Postgres maturity (FTS punted to gated `Orama in-memory` until then). 3rd choice: drop to Kysely + custom decorator wrapper layer (loses NestJS aesthetic).
  - Gate-2 ongoing: MikroORM PR #7622 (`@mikro-orm/pglite` official driver) merge tracker. When merged, swap community driver for official.

## C8. DI / decorators → needle-di Stage-3 + MikroORM v7 ES decorators
- Locked: 2026-05-01 by user.
- Primary DI: `@needle-di/core` v1.x (7 KB bundled, Stage-3 TC39 decorators, no `reflect-metadata`, tested on Bun 1.3.13).
- Decorator metadata: `Symbol.metadata` (Stage-3) — Bun ≥ 1.3.10 native support.
- Pattern: `@Injectable()` services + constructor injection via `inject(Dep)` default-param syntax.
- Composition:
  - SvelteKit `+server.ts` / `+page.server.ts` / `hooks.server.ts` — single `Container` instantiated at app start, exposed via `event.locals.container`.
  - tRPC procedures — `ctx.container = container` so handlers resolve services lazily.
  - CLI handlers (commander/cliffy) — same container shared across commands.
  - TUI (OpenTUI) — same container resolved at TUI startup.
- Failure gates: if needle-di decorator mode breaks under Bun 1.3.x → 2nd choice: inversify v8.1 (legacy decorators, auto-bundles `reflect-metadata/lite`, 79 KB). 3rd choice: `@nestjs/core` standalone `createApplicationContext` (435 KB, full Module system).
- TypeScript config: tsconfig must duplicate decorator flags in root (Bun issue #6326 workaround for `extends`-chained tsconfigs).

## C9. Schema artifact paths
- Entities: `src/db/entities/<domain>/<EntityName>.ts` (one class per file).
- Repositories: `src/db/repositories/<domain>/<EntityName>Repository.ts` (extends `EntityRepository<T>`).
- Migrations: `src/db/migrations/Migration<timestamp>.ts` (auto-generated by `mikro-orm migration:create`; never hand-edited beyond renaming).
- MikroORM config: `src/db/mikro-orm.config.ts` (single source; reads `DATABASE_URL` env to pick `mikro-orm-pglite` vs `@mikro-orm/postgresql` driver).
- Module composition: `src/db/db.module.ts` (needle-di module wiring `EntityManager` + repositories as injectables).

## C10. Stub-entity ownership rule (Pillar 1 baseline)
- Locked: 2026-05-01 (auto-locked from P1#03 implementation findings; commit d24eb47).
- Pillar 1 lands minimal **stub entity classes** (id + org FK + minimum-columns-for-composite-index) for every tenant-scoped table referenced downstream. Composite `@Index({ properties: ['org', ...] })` decorators ship at baseline; one migration class per stub batch lands in P1.
- Downstream pillars (3, 6, 7, 8, 9, 10, 11, 12) ADD domain-specific columns via their own MikroORM migration classes; they NEVER re-declare the `org` FK or the composite (org, …) index.
- 8 baseline stubs landed in d24eb47: tasks/Task, docs/Document, memory/Memory, orchestration/AgentRun, artifacts/Artifact, repos/Repo, jobs/Job, search/SearchDocument.
- Guarantees C2 ("composite indexes on every tenant-scoped table") at baseline without depending on each pillar's own schema migration to land first.

## C11. CasbinRule carve-out — not tenant-scoped at table level
- Locked: 2026-05-01 (commit d24eb47; citation in src/db/entities/flags/CasbinRule.ts).
- node-casbin's standard adapter contract requires only `id, ptype, v0..v5`. Org scoping is encoded INSIDE `v0` per casbin namespace convention (e.g. `org:<uuid>:role:owner`).
- Adding an `org_id` FK + composite index to `casbin_rule` would conflict with the upstream adapter contract.
- Deliberate exception to C2's "every tenant-scoped table has a composite (org_id, …) index from day 1". The `FulcrumCasbinAdapter` (~200 LOC, gated `casbin-policies`) is responsible for tenant-isolating policy reads/writes via the `v0` namespace.
- All other Pillar-1 stub tables comply with C2 unchanged.

## Doc-rewrite policy (C6 sweep)
- All 17 PRDs + 341 issues + cross-cutting docs (REQUIREMENTS, MASTER-PLAN, COVERAGE, OPEN-QUESTIONS, EXTRA-GAPS, INVENTORY, VISION-GAPS) sweep-rewritten on 2026-05-01.
- "migration NNNN_<slug>.sql" → "migration class `Migration<timestamp>` covering <slug>".
- Raw SQL DDL excerpts → MikroORM entity decorator excerpts (`@Entity`, `@PrimaryKey`, `@Property`, `@Index`).
- Raw SQL DML excerpts → MikroORM repository call excerpts (`em.create(Entity, {...})`, `em.flush()`, `repo.findOne({...})`).
- "drizzle" / "drizzle-kit" / "schema.ts" → MikroORM equivalents (`mikro-orm`, `mikro-orm migration:create`, `src/db/entities/`).
- See `.scratch/agent-os-vision/research/sql-sweep-manifest.md` for the full per-file rewrite map.
