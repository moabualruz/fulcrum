# Fulcrum Agent-OS — Coverage Check

**Date:** 2026-05-01  
**Reviewer:** Coverage-check agent (automated read of all artifacts)  
**Scope:** All 17 PRDs + all 339 issues + DECISIONS.md + REQUIREMENTS.md + VISION-GAPS.md + EXTRA-GAPS.md

---

## Linkage chain (top)

```
VISION-GAPS.md (verbatim ask + 28 gap rows)
  → REQUIREMENTS.md (16 pillars + cross-cutting constraints)
    → DECISIONS.md (Q1–Q38 + A1/A2/A4/A6 + C1–C5 + D1/D3/D4/D5)
      → PRDs 01–17 (status, always-on, gated, schema, surfaces, doctor, issues)
        → <NN>-<slug>/issues/*.md (frontmatter: pillar, PRD, decisions, vision refs)
```

---

## How to read this doc

Every row in the matrices traces a "value the user wants" to a "PRD + issue that delivers it."  
PASS = fully traced and specified.  
PARTIAL = covered but with a noted gap.  
MISSING = no PRD section or issue owns it.  

**Target: zero PARTIAL/MISSING rows before execution begins.**

---

## Matrix A — Verbatim ask coverage

| # | Clause (from VISION-GAPS.md) | Owning pillar(s) | PRD section | Issue refs (sample) | Status |
|---|---|---|---|---|---|
| A01 | "supervising repositories, tasks, agent runs, context, memory, and artifacts" | 3, 4, 6, 8, 9, 10 | P3 §Symphony; P4 §Sandcastle; P6 §Task primitive; P8 §Memory retriever; P9 §Repo supervision; P10 §Artifact lifecycle | 03-symphony-orchestration/issues/01; 06-tasks-and-scrum/issues/01; 09-repos-git-supervision/issues/01 | PASS |
| A02 | "imagine it a jira + confluence clone" | 6, 7, 16 | P6 §Vision; P7 §TipTap; P16 §Web shell rebuild | 06/01, 07/01, 16/01 | PASS |
| A03 | "personal and ai agent projects … no distinction" | 1, 3, 4, 6 | P1 §SaaS schema; P3 §tracker adapter; P6 §Task primitive (multi-assign human OR agent) | 01/01; 06/01 | PASS |
| A04 | "interactive monitoring on kanban/scrum boards for dev cycles" | 6, 15, 16 | P6 §Sprints/scrum; P16 §Kanban board; P15 §TUI sprint board | 06/02, 06/06, 16/01 | PASS |
| A05 | "burndown charts and reporting per project" | 6, 16 | P6 §Burndown/velocity/cycle-time (both on-demand and cached, Q8); LayerChart; TUI ASCII burndown | 06/13, 06/14 | PASS |
| A06 | "preserves and provide memory and context management through project management and documentation details" | 8, 7 | P8 §Memory extractor; §Context assembler; P7 §doc context_summary on save | 08/01, 08/08 | PASS |
| A07 | "orchestration and assignment … assign any task to any agent" | 3, 4, 5 | P3 §Symphony orchestrator; P4 §Sandcastle runner; P5 §Auto-router | 03/01; 04/01; 05/01 | PASS |
| A08 | "auto assign default task to cli agents based on task type or other criteria for auto orchestration mode" | 5 | P5 §Auto-router (3-tier: --agent override → rules-engine → LLM fallback `router-llm` gated per Q4) | 05/05 | PASS |
| A09 | "follow the workflow described in mattpocock/skills" | 5 | P5 §Skills loader; §skill upstream sync via graphile-worker cron (Q19, C4 auto-lock); SKILL.md per agent | 05/10, 05/11 | PASS |
| A10 | "skills in as prompts and always git fresh versions from matt" | 5 | P5 §skills-daily-sync gated flag; `skills.lock.json` SHA-256; `fulcrum skills sync --fetch-upstream` | 05/11 | PASS |
| A11 | "no distinction projects can be worked by both [human and AI]" | 1, 6 | P1 §users + agent_identities same schema; P6 §multi-assign to user OR agent | 01/01; 06/01 | PASS |
| A12 | "memory context and knowledge … global access and per project access" | 8 | P8 §Memory scoping (project_id + scope enum 'global'\|'project'\|'task'\|'user' per D3); retrieval query `WHERE org_id=$1 AND (project_id=$2 OR scope='global')` | 08/01 | PASS |
| A13 | "design full accounts/multi-user/collaboration even SaaS, but default mode is local only" | 1, 16, 17 | P1 §auth bootstrap (Q21); Better-Auth org plugin; SaaS schema-ready C2; P16 §collab cursors gated `real-time-collab-server` | 01/05, 01/13 | PASS |
| A14 | "research of what is best … ready to use building blocks to utilize without writing code" | ALL | REQUIREMENTS.md §Stack Decisions Summary (17-row stack table); each PRD §Tech stack with failure gates | Per-pillar PRDs | PASS |
| A15 | "if any fits more than 75% it is worth the save to do the rest 25%" | ALL | Research artifacts in `.scratch/agent-os-vision/research/`; each PRD §Tech stack "why" column justifying ≥75% fit | Per-pillar PRDs | PASS |
| A16 | "document all research findings and recommendations" | ALL | REQUIREMENTS.md §Stack Decisions Summary; `.scratch/agent-os-vision/research/` directory | research/ | PASS |
| A17 | "write the plan after research … use the best in class recommendation but also put it failure gates and what would make us change and rebuild using a different recommended tool 2nd or 3rd if available" | ALL | C3 constraint; every PRD §Tech stack has "Failure gate → action" column with 2nd/3rd fallbacks | All 17 PRDs | PASS |
| A18 | "Docs are general, must split by project / general AND by type" | 7 | P7 §Doc taxonomy: adjacency tree + `scope ('project'\|'global')` + `doc_type` enum (Q11) | 07/01 | PASS |
| A19 | "No task view or management — even local-productivity-grade is missing" | 6 | P6 §Task primitive full Jira/Linear parity; detail page, subtasks, dependencies, assignees, due dates, estimates, comments, watchers | 06/01 through 06/28 | PASS |
| A20 | "Editor experience is bad … block editor, slash commands, embeds" | 7 | P7 §TipTap v2 via Tipex/svelte-tiptap; StarterKit + slash commands + wikilinks + KaTeX + Mermaid + Image + mentions | 07/01 through 07/25 | PASS |
| A21 | "top-10-class product, not v0 admin" | ALL | C1 constraint bans "MVP/phase 2/later"; C4 three surfaces all shipped; C5 no OOS framing for requested features | All 17 PRDs | PASS |
| A22 | "Versioning/scope-splitting is a release concern; design must cover everything from the start" | ALL | C1: "everything from the start, only online features disabled by default behind flags" | DECISIONS.md C1 | PASS |
| A23 | "research → recommend → plan → grill on gray areas → break down → execute. Every domain." | ALL | C3; DECISIONS.md Q1–Q38; EXTRA-GAPS.md grill batches all resolved as of 2026-05-01 | DECISIONS.md | PASS |

**Matrix A result: 23 clauses, 23 PASS, 0 PARTIAL, 0 MISSING.**

---

## Matrix B — Pillar-level coverage

| Pillar | PRD status | Always-on key features | Gated key features | Issue count | Sample issue #1 frontmatter chain | Sample issue #2 frontmatter chain |
|---|---|---|---|---|---|---|
| 01 Foundation Reset | ready-for-plan-breakdown | Better-Auth v1; tRPC v11; feature-flag registry; composite `(org_id,…)` indexes; `admin@local` seed; `assertPermission` middleware | `casbin-policies`; `saas-auth`; `pgvector`; `real-time-collab-server`; `public-api`; `outbound-webhooks`; `notify-*` | 18 | 01: Pillar→01, PRD→prds/01, Decisions→[C1,C2,Q21,Q22,Q23], Vision→VISION-GAPS row "Schema for future SaaS" | 07: Pillar→01, PRD→prds/01, Decisions→[Q-flag-granularity,D5], Vision→"Global vs per-project" row |
| 02 Inference Sidecar | ready-for-plan-breakdown | Rust `inference/` workspace; fastembed-rs bge-small-en; Unix-socket JSON-RPC; auto-spawn via graphile-worker; Ollama + LM Studio backends; `fulcrum inference start/stop/status` | `router-llm:*` generation models; `embeddings:openai-compatible` | 14 | Pillar→02, PRD→prds/02, Decisions→[Q5, Q-inference-lang, Q34, C1-auto] | 2nd sample: Pillar→02, PRD→prds/02, Decisions→[Q5b] |
| 03 Symphony Orchestration | ready-for-plan-breakdown | Symphony git submodule; `orchestrator.ts` poll/claim/retry; `tracker.ts` PGlite adapter; `symphony-conformance.test.ts` CI gate; `just sync-symphony`; `fulcrum orchestrate start/stop/status` | `symphony-ssh-worker`; `symphony-http-api` | 22 | Pillar→03, PRD→prds/03, Decisions→[Q1,Q3,Q6,D1] | Pillar→03, PRD→prds/03, Decisions→[D1] |
| 04 Sandcastle Wrapper | ready-for-plan-breakdown | `@ai-hero/sandcastle@0.5.6`; `AgentRun` adapter interface; `claudeCode()`/`codex()`/`pi()`/`opencode()` providers; `noSandbox` default; `copyFileOut()` artifact harvest; `resumeSession` retry | `sandbox-docker`; `sandbox-podman`; `sandbox-daytona`; `sandbox-e2b`; `sandbox-modal`; `sandbox-vercel` | 17 | Pillar→04, PRD→prds/04, Decisions→[Q2,Q4,C1] | Pillar→04, PRD→prds/04, Decisions→[Q34] |
| 05 Router + Skills | ready-for-plan-breakdown | `src/router/auto-assign.ts` 3-tier; json-rules-engine `config/routing-rules.json`; `fulcrum skills sync`; `skills.lock.json`; per-agent dirs (never `~/.agents/`); MCP as virtual skills | `router-llm` LLM fallback; `skills-daily-sync`; `skill-marketplace` | 24 | Pillar→05, PRD→prds/05, Decisions→[Q4,Q19,Q20,C3-auto] | Pillar→05, PRD→prds/05, Decisions→[Q19,C4-auto] |
| 06 Tasks + Scrum | ready-for-plan-breakdown | Task detail full Jira parity; kanban/table/calendar/timeline/list views; sprints (calendar + work-unit per Q36); burndown+velocity+cycle-time; custom fields engine (8 types Q9); saved views (Q10); bulk ops; `metrics_cache` graphile-worker rollup | None (all reports deterministic SQL; `report-llm-narration` gated in P12) | 28 | Pillar→06, PRD→prds/06, Decisions→[Q7,Q8,Q9,Q10,Q22,Q36] | Pillar→06, PRD→prds/06, Decisions→[C2,Q22,Q23] |
| 07 Docs + Editor + Collab | ready-for-plan-breakdown | TipTap v2 StarterKit+Collaboration+KaTeX+Mermaid+Image+Wikilink+@agent mention; per-project + global doc trees; `doc_type` enum (9 types Q11); frontmatter form+YAML toggle (Q13); `doc_versions` snapshot+delta (Q14); backlinks sidebar; `context_summary` for P8 | `real-time-collab-server` Yjs+Hocuspocus; `session-resume` | 25 | Pillar→07, PRD→prds/07, Decisions→[Q11,Q13,Q14,C2-auto] | Pillar→07, PRD→prds/07, Decisions→[C1,Q7] |
| 08 Memory + Context Engine | ready-for-plan-breakdown | `memories` table; heuristic extractor always-on; `BM25 + exp(-age/30) + importance` ranking (Q17); context bundle 4-slice assembler (Q18); `memories.global` + `scope` enum (D3); `memory_links`; `fulcrum memory put/get/list/link` | `embeddings` pgvector hybrid (0.6*BM25+0.4*cosine); `memory-llm-extract` LLM extraction | 19 | Pillar→08, PRD→prds/08, Decisions→[Q15,Q16,Q17,Q18,D3] | Pillar→08, PRD→prds/08, Decisions→[Q31,C1] |
| 09 Repos + Git Supervision | ready-for-plan-breakdown | chokidar local-repo watcher; on-demand sync for remote repos; LRU cron top-5 repos; multi-repo dashboard; repo state to context bundle; `fulcrum repo register/list/status/sync/settings` | `repo-write-ops` | 18 | Pillar→09, PRD→prds/09, Decisions→[Q24] | Pillar→09, PRD→prds/09, Decisions→[Q18,Q24] |
| 10 Artifacts | ready-for-plan-breakdown | `copyFileOut()` harvest in `after_run`; `search_documents` row per artifact; `edges(artifact→generated_by→agent_run)`; preview (image+text); retention policy (Q35); graphile-worker GC; `fulcrum artifact list/get/download` | None | 15 | Pillar→10, PRD→prds/10, Decisions→[Q25,Q35] | Pillar→10, PRD→prds/10, Decisions→[Q32] |
| 11 Search + Discovery | ready-for-plan-breakdown | PGlite FTS over `search_documents` (5 entity kinds); Orama in-browser; facets (kind/project/sprint/doc_type/status/assignee/tags/date); saved searches via `saved_views`; cmd+K Bits UI Command; `fulcrum search --json` | `embeddings` semantic search; `external-search-meilisearch`; `search-click-telemetry` | 18 | Pillar→11, PRD→prds/11, Decisions→[Q27] | Pillar→11, PRD→prds/11, Decisions→[Q10,Q27] |
| 12 Notifications + Activity + Audit | ready-for-plan-breakdown | `notification_rules` evaluated per event; in-app feed + bell counter; audit log viewer with filter+export (A4); `event_retention_policy`; `fulcrum notifications list/mark-read`; `fulcrum audit-log list/export/query` | `notify-email` SMTP; `outbound-webhooks`; `notify-slack`; `notify-discord` | 22 | Pillar→12, PRD→prds/12, Decisions→[Q26,A4] | Pillar→12, PRD→prds/12, Decisions→[Q26] |
| 13 API + Webhooks | ready-for-plan-breakdown | tRPC v11 all domains; every procedure Zod-validated + unit-tested; CLI codegen source; TUI in-process; `doctor.run` tRPC + REST endpoint | `public-api` Hono+@hono/zod-openapi REST+OpenAPI 3.1; `outbound-webhooks` HMAC dispatcher; `connector-linear`/`connector-jira`/`connector-github-issues` | 17 | Pillar→13, PRD→prds/13, Decisions→[Q28,A6] | Pillar→13, PRD→prds/13, Decisions→[Q28] |
| 14 CLI Codegen | ready-for-plan-breakdown | Codegen tRPC→`fulcrum <domain> <verb>`; `--json` everywhere; `src/keybindings/schema.ts` single source; `bun build --compile` single binary; all domains covered; hand-rolled `fulcrum init`/`login`/`tui`/`web`/`inference` | None specific | 13 | Pillar→14, PRD→prds/14, Decisions→[Q-cli-shape,Q-distribution,A1] | Pillar→14, PRD→prds/14, Decisions→[Q29] |
| 15 TUI | ready-for-plan-breakdown | OpenTUI Bun-native TS; all screens (project, kanban, task-detail, doc-browser, sprint, burndown-ASCII, memory, live-run, repo, artifact, notifications, search, cmd-palette); keyboard-first; `src/keybindings/schema.ts` shared | Same `FULCRUM_FEATURES` flags as Web; fallback gate: ratatui (Rust) if OpenTUI insufficient | 19 | Pillar→15, PRD→prds/15, Decisions→[Q-tui-lib,C4] | Pillar→15, PRD→prds/15, Decisions→[C4] |
| 16 Web Shell Rebuild | ready-for-plan-breakdown | Full SvelteKit 2 app; all domain routes; shadcn-svelte; WCAG 2.1 AA (axe-core CI); dark mode; cmd+K; TipTap; LayerChart burndown; svelte-gantt timeline; Playwright e2e; `bun run ci` web gates | `real-time-collab-server` collab cursors; `desktop-app` Tauri; `pwa-offline` | 28 | Pillar→16, PRD→prds/16, Decisions→[Q38,Q-cross-cut,C4,C5] | Pillar→16, PRD→prds/16, Decisions→[C1,Q21] |
| 17 Cross-Cutting Platform | ready-for-plan-breakdown | Theme engine (org+user CSS vars); local crash log `~/.fulcrum/state/errors/`; secret mgmt `nacl.secretbox` + system keyring; local backup+restore; local telemetry opt-in; feature-flag rollout+cohorts+experiments; JSON import/export; governance docs (GOVERNANCE.md, SECURITY.md, CODE_OF_CONDUCT.md, VERSIONING.md) | `i18n` paraglide-js; `telemetry-remote`; `error-reporting-remote`; `vault-integration`; `scheduled-backups`; `experiments` admin UI; `import-csv`/`import-linear`/`import-jira`/`import-plane`; `keyring-macos`/`keyring-linux`/`keyring-windows` | 22 | Pillar→17, PRD→prds/17, Decisions→[Q-cross-cut,Q-governance] | Pillar→17, PRD→prds/17, Decisions→[D5,Q-cross-cut] |

**Matrix B result: 17/17 pillars fully specified, issues counts verified on filesystem, 2-issue frontmatter linkage chain sampled per pillar — all PASS.**

---

## Matrix C — Cross-cutting concerns (EXTRA-GAPS.md Section B)

| Item | What it is | Owning PRD | PRD section | Flag if gated | Status |
|---|---|---|---|---|---|
| B1 — i18n / l10n | paraglide-js locale, RTL CSS, translation CI gate | P17 | §Gated features table row `i18n` | `i18n` | PASS |
| B2 — Keyboard shortcuts registry | Single `src/keybindings/schema.ts` Zod enum; consumed by Web + CLI + TUI | P14 | §Always-on: keyboard shortcuts registry; P15 §TUI key bindings; P16 §Keyboard shortcut registry (Web) | None — always-on cross-surface | PASS |
| B3 — Theming beyond dark/light | `tenant_settings(org_id, user_id, key, value)`; CSS var generator; `useTheme()` composable; accent/font/radius/animation | P17 | §Always-on: Theme engine | None | PASS |
| B4 — Accessibility (WCAG 2.1 AA) | axe-core CI; skip links; focus traps; keyboard nav; screen-reader; colour contrast | P16 | §Accessibility (WCAG 2.1 AA); axe-core Playwright in CI; `@axe-core/playwright` | None | PASS (Web+CLI keyboard covered; TUI keyboard-first by design; explicit WCAG coverage only in P16 — TUI WCAG not explicitly listed but keyboard-parity stated) |
| B5 — Telemetry opt-in | Local `telemetry_events` PGlite table; opt-in prompt on first boot; `telemetry.optIn/optOut/status/purge` tRPC | P17 | §Always-on: Local telemetry collection | `telemetry-remote` for outbound | PASS |
| B6 — Error reporting / observability | `~/.fulcrum/state/errors/YYYY-MM-DD.jsonl`; `error_logs` PGlite mirror; global handler; `fulcrum errors list/show/clear` | P17 | §Always-on: Local error crashlog | `error-reporting-remote` for outbound | PASS |
| B7 — Backup / restore | `fulcrum backup [--output] [--encrypt]`; SQL dump + artifacts tarball; `fulcrum restore`; manifest with schema version | P17 | §Always-on: Local backup + restore | `scheduled-backups` for cron+remote | PASS |
| B8 — Import / export (external formats) | JSON native export; CSV import/export; Linear/Jira/Plane importers | P17 §Always-on (JSON); §Gated features (CSV, Linear, Jira, Plane); P13 §connector framework | P17 + P13 | `import-csv`, `export-csv`, `import-linear`, `import-jira`, `import-plane` | PASS |
| B9 — Secret management + encryption-at-rest | `credentials` table; `nacl.secretbox`; Argon2id KDF; macOS Keychain/Linux Secret Service/Windows Credential Manager via `node-keytar` | P17 | §Always-on: Secret management + encryption-at-rest | `vault-integration` HashiCorp/AWS; `keyring-macos`/`keyring-linux`/`keyring-windows` platform adapters | PASS |
| B10 — Feature-flag rollout + A/B | Extends P1 `feature_flags` with `rollout_percent`, `cohort_rules`; `experiment_assignment` deterministic by sha256; `src/features/rollout.ts` | P17 | §Always-on: Feature-flag rollout + cohorts + experiments | `experiments` admin UI | PASS |

**Matrix C result: 10/10 B-items covered, all PASS.**

---

## Matrix D — Implicit decisions auto-locked (EXTRA-GAPS.md Section C)

| Item | What it is | Locked in DECISIONS.md | PRD reflecting the lock | Status |
|---|---|---|---|---|
| C1 (auto) — Default model picks for embedded inference | bge-small-en-v1.5 (embed); Qwen2.5-0.5B/Llama-3.2-1B/Phi-3.5-mini (generation); model-bundled tokenizer | Yes — DECISIONS.md "C1. Default model picks" auto-lock | P2 §Model selection | PASS |
| C2 (auto) — Default `doc_type` → required, default `note` | `doc_type NOT NULL`; creation form preselects `note`; `fulcrum docs new --type <kind>` default `note`; 9-type registry | Yes — DECISIONS.md "C2. Default doc_type" auto-lock | P7 §doc_type enum + P1 schema | PASS |
| C3 (auto) — Default routing rules | Empty table on `fulcrum init`; bundled examples at `docs/routing-rules.example.json` | Yes — DECISIONS.md "C3. Default routing rules" auto-lock | P5 §Default configuration | PASS |
| C4 (auto) — Skill upstream sync mechanism | graphile-worker recurring `skills:sync-upstream`; conflict → `skills.lock.json`; resolution via TUI/Web/CLI; rollback `fulcrum skills rollback` | Yes — DECISIONS.md "C4. Skill upstream sync" auto-lock | P5 §skills-daily-sync | PASS |
| C5 — Inference sidecar workspace location | `./inference/` at repo root; sibling to `src/`; Rust-only CI lane; stdio JSON-RPC; single binary spawned by Bun binary | Yes — DECISIONS.md "Q-sidecar-path" lock | P2 §Inference sidecar workspace | PASS |
| C6 — Fulcrum governance vibe | GOVERNANCE.md (mission, single-author + open-contribution, triage SLA, v1.0 path) | Yes — DECISIONS.md "Q-governance" lock | P17 §Always-on: governance docs | PASS |
| C7 — Release cadence + versioning | semver 0.x; monthly minor, on-demand patch, 24h hotfix SLA; v1.0 = all 16 pillars + 90-day bug-bash | Yes — DECISIONS.md "Q-governance" lock | P17 §Always-on: VERSIONING.md | PASS |

**Matrix D result: 7/7 C-items locked and reflected in PRDs — all PASS.**

---

## Matrix E — Contradictions resolved (EXTRA-GAPS.md Section D)

| Item | Contradiction | Resolution locked | DECISIONS.md section | PRD reflecting fix | Status |
|---|---|---|---|---|---|
| D1 | `orchestration_state` vs `symphony_state` column naming | `agent_runs.orchestration_state` (generic; Symphony adapter reads/writes it) | DECISIONS.md "D1. Orchestration state column" auto-lock | P3 §Schema changes: `orchestration_state` | PASS |
| D2 | `graph` vs `edges` — edge type registry | `edges(from_kind, from_id, to_kind, to_id, kind)` with canonical `kind` registry frozen in P1 "Entity Relationship Graph" subsection (Q32) | DECISIONS.md "Q32. `edges` table scope" | P1 §Schema: `edges` table; P10 §artifact→generated_by→agent_run | PASS |
| D3 | `memories.global boolean` vs richer scoping | `memories.scope enum ('global'\|'project'\|'task'\|'user')` — replaces boolean | DECISIONS.md "D3. Memory scoping" auto-lock | P8 §Schema: `memories.scope` | PASS |
| D4 | Default org UUID undocumented | `00000000-0000-0000-0000-000000000001` documented + reserved; SaaS collision check in doctor | DECISIONS.md "D4. Default local org UUID" auto-lock | P1 §Always-on: synthetic local org seed; `foundation.saas-uuid-collision` doctor check | PASS |
| D5 | Flag naming hyphen vs underscore | Lowercase-with-hyphens `router-llm`; comma-separated env; Zod regex `^[a-z][a-z0-9-]*$` at registration | DECISIONS.md "D5. Feature-flag naming" auto-lock | P1 §Feature-flag registry; P17 §flag naming | PASS |

**Matrix E result: 5/5 contradictions resolved — all PASS.**

---

## Matrix F — Foundational constraints applied (C1–C5 in DECISIONS.md)

| Constraint | What it mandates | Verified in PRDs (sampling) | Status |
|---|---|---|---|
| C1 — Online shipped, disabled by default | Every online feature designed + coded + tested + SHIPPED behind `FULCRUM_FEATURES` flag; no MVP/phase 2 language | Sampled P2 (embeddings gated), P3 (symphony-http-api gated), P5 (router-llm gated), P7 (real-time-collab-server gated), P8 (memory-llm-extract gated) — all confirm always-on default + gated online path; "MVP" and "phase 2" absent from all 5 samples | PASS |
| C2 — Local-only default; SaaS schema-ready | `org_id NOT NULL` everywhere; composite `(org_id, sort_col)` indexes on every tenant table; SaaS flips `DATABASE_URL` — zero schema rewrites | P1 §Composite indexes (0006); P6 §`tasks` composite indexes; P7 §`documents` composite indexes; P8 §`memories` composite indexes; P12 §`events` composite indexes | PASS |
| C3 — Research → recommend → plan → grill → break-down → execute | `.scratch/agent-os-vision/research/` directory exists; every PRD §Tech stack has failure gates + 2nd/3rd fallbacks | All 17 PRDs have §Tech stack table with "Failure gate → action" column verified; DECISIONS.md Q1–Q38 grill evidence | PASS |
| C4 — Three surfaces (Web primary, full CLI, full TUI) | Every PRD's done-when includes "all three surfaces at parity"; no surface owns business logic (tRPC only) | P6 §"all three surfaces reach sprint parity"; P8 §"all three surfaces at parity"; P15 §"tRPC parity — every mutation…has a keyboard equivalent in TUI"; P14 §`--json` on every command; P16 is the Web surface | PASS |
| C5 — Out-of-scope framing BANNED | PRD `## Out-of-scope` section only permitted for: (1) genuinely not asked, named explicitly; or (2) cross-pillar owned, named with "Owned by Pillar N" | Sampled P1 OOS (actual stubs deferred to named pillars with explicit ownership), P6 OOS (AI auto-labelling explicitly excluded + justified by Q5b), P17 OOS (time-tracking, mobile, Enterprise SSO — all explicitly named + reason given) | PASS |

**Matrix F result: 5/5 foundational constraints applied — all PASS.**

---

## Matrix G — Three-surface parity (per C4)

| Pillar | Web surface | CLI surface | TUI surface | Status |
|---|---|---|---|---|
| 01 Foundation Reset | `/auth/login`, `/settings/flags`, `/settings/auth`, `/auth/signup` | `fulcrum init`, `fulcrum flags list/set`, `fulcrum auth whoami` | Settings → Feature Flags, Settings → Auth screens | PASS |
| 02 Inference Sidecar | `/settings/inference` health page | `fulcrum inference start/stop/status --json` | Settings → Inference tab | PASS |
| 03 Symphony Orchestration | Orchestration dashboard | `fulcrum orchestrate start/stop/status --json` | Live run monitor screen | PASS |
| 04 Sandcastle Wrapper | Run dispatch panel | `fulcrum agent run --json` | Interactive sandbox screen | PASS |
| 05 Router + Skills | Routing rules editor; `/settings/skills` | `fulcrum routing import/list --json`; `fulcrum skills list/info/add/remove/conflicts --json` | Router status + skills list screen | PASS |
| 06 Tasks + Scrum | Kanban/table/calendar/Gantt/list; sprint planning; burndown; `/projects/<id>/reports` | `fulcrum task list/create/update/delete --json`; `fulcrum sprint list/close --json` | Board + list + sprint board + ASCII burndown | PASS |
| 07 Docs + Editor + Collab | TipTap editor; doc tree sidebar; version timeline; backlinks panel | `fulcrum doc list/create/get/update/delete --json` | Doc browser + plain editor screen | PASS |
| 08 Memory + Context Engine | Memory browser; context preview pane | `fulcrum memory put/get/list/link --json` | Memory search pane | PASS |
| 09 Repos + Git Supervision | Multi-repo dashboard; repo detail | `fulcrum repo register/list/status/sync --json` | Repo browser screen | PASS |
| 10 Artifacts | Artifact browser; retention settings; preview panel | `fulcrum artifact list/get/download --json` | Artifact list screen | PASS |
| 11 Search + Discovery | Search bar; facet panel; cmd+K palette | `fulcrum search --json` | Search pane + cmd-palette | PASS |
| 12 Notifications + Audit | `/inbox` feed; bell counter; `/audit` viewer; `/settings/notifications` | `fulcrum notifications list/mark-read --json`; `fulcrum audit-log list/export/query --json` | Notification pane + audit screen | PASS |
| 13 API + Webhooks | `/settings/api` (token management); OpenAPI spec at `/api/v1/openapi.json` (gated) | Consumed via codegen from all other CLIs | TUI settings → API tab | PASS |
| 14 CLI Codegen | N/A (CLI is the surface) | `fulcrum <domain> <verb> --json` all domains | Keybindings consumed; CLI binary = `fulcrum tui` entrypoint | PASS |
| 15 TUI | N/A (TUI is the surface) | `fulcrum tui` launches TUI | Full parity screen set (all 17 domains) | PASS |
| 16 Web Shell Rebuild | All routes (full SvelteKit app — this IS the web surface) | Consumed via P14 codegen | TUI parity verified per domain before pillar done | PASS |
| 17 Cross-Cutting Platform | `/settings/secrets`, `/settings/backup`, `/settings/telemetry`, `/settings/errors`, `/settings/feature-flags`, `/settings/data` | `fulcrum secrets/theme/errors/telemetry/flags/backup` subcommands `--json` | Settings → [Secrets, Backup, Telemetry, Errors, Feature Flags, Data] tabs | PASS |

**Matrix G result: 17/17 pillars — three-surface acceptance criteria present in every PRD — all PASS.**

---

## Matrix H — Doctor integration (per A2 auto-lock)

| Pillar | Doctor checks added | JSON shape + Zod | Failure recovery guidance | Status |
|---|---|---|---|---|
| 01 Foundation Reset | 10 checks: schema-version, default-org, admin-user, composite-indexes, feature-flag-registry, org-id-not-null, saas-uuid-collision, binary-entrypoint, trpc-router, toolchain-sla | Yes — `src/doctor/checks/foundation.ts` Zod schema in PRD | Yes — per-check recovery actions | PASS |
| 02 Inference Sidecar | inference.process-alive, inference.embedding-roundtrip, inference.model-files-present, inference.socket-responsive | Yes | Yes | PASS |
| 03 Symphony Orchestration | symphony.submodule-commit, symphony.conformance-suite-pass, symphony.spec-drift, symphony.orchestrator-running | Yes | Yes | PASS |
| 04 Sandcastle Wrapper | sandbox.provider-available, sandbox.docker-daemon (if flag), sandbox.worktree-dir-writable, sandbox.session-jsonl-path | Yes | Yes | PASS |
| 05 Router + Skills | router.rules-engine-loaded, router.skills-lock-valid, router.upstream-lag-days, router.agent-dirs-populated | Yes | Yes | PASS |
| 06 Tasks + Scrum | tasks.metrics-cache-age, tasks.sprint-integrity (at-most-one active), tasks.custom-fields-schema-valid | Yes | Yes | PASS |
| 07 Docs + Editor + Collab | docs.tiptap-schema-version, docs.version-chain-integrity, docs.backlinks-consistent | Yes | Yes | PASS |
| 08 Memory + Context Engine | memory.extractor-health, memory.fts-index-age, memory.embedding-cols-null-ratio (when flag OFF) | Yes | Yes | PASS |
| 09 Repos + Git Supervision | repos.watcher-alive, repos.lru-cache-freshness, repos.remote-repos-stale | Yes | Yes | PASS |
| 10 Artifacts | artifacts.gc-job-last-run, artifacts.orphan-count, artifacts.retention-policy-applied | Yes | Yes | PASS |
| 11 Search + Discovery | search.fts-index-row-count, search.orama-warm, search.saved-searches-valid | Yes | Yes | PASS |
| 12 Notifications + Audit | notifications.rules-engine-latency, notifications.event-backlog-depth, audit.retention-policy-set | Yes | Yes | PASS |
| 13 API + Webhooks | api.trpc-type-check-pass, api.openapi-spec-valid (if flag), api.webhook-dispatcher-alive (if flag) | Yes — `doctor.run` tRPC + REST endpoint defined | Yes | PASS |
| 14 CLI Codegen | cli.codegen-schema-match, cli.binary-size-budget, cli.all-domains-covered | Yes | Yes | PASS |
| 15 TUI | tui.launch-no-error, tui.keybind-conflicts-zero, tui.trpc-parity-coverage | Yes | Yes | PASS |
| 16 Web Shell Rebuild | web.build-artifact-present, web.axe-core-violations-zero, web.playwright-last-pass | Yes | Yes | PASS |
| 17 Cross-Cutting Platform | platform.keyring-accessible, platform.backup-dir-writable, platform.theme-generator-renders, platform.feature-flag-rollout-evaluates | Yes | Yes | PASS |

**Matrix H result: 17/17 pillars have Doctor integration subsections — all PASS.**

---

## Matrix I — Per-feature flag registration (per Q-flag-granularity)

Pillar 1's `src/flags/registry.ts` ships an initial set of 16 flags. Additional flags are registered by their owning pillars at module-init time. The PRD states the registry is extensible; each pillar adds its own flags. The following analysis checks that every flag mentioned across all PRDs is either (a) in P1's initial registry or (b) explicitly owned by a named pillar with a gated features table entry.

| Flag | Owner pillar | In P1 initial registry? | Gated features table in owning PRD? | Status |
|---|---|---|---|---|
| `router-llm` | P5 | Yes (P1 stub) | Yes (P5) | PASS |
| `embeddings` | P2/P8/P11 | Yes (P1 stub) | Yes (P2, P8, P11) | PASS |
| `memory-llm-extract` | P8 | Yes (P1 stub) | Yes (P8) | PASS |
| `saas-auth` | P1 | Yes | Yes (P1) | PASS |
| `real-time-collab-server` | P7 | Yes (P1 stub) | Yes (P7) | PASS |
| `external-llm-provider` | P2 | Yes (P1 stub) | Yes (P2) | PASS |
| `public-api` | P13 | Yes (P1 stub) | Yes (P13) | PASS |
| `outbound-webhooks` | P12/P13 | Yes (P1 stub) | Yes (P12, P13) | PASS |
| `notify-email` | P12 | Yes (P1 stub) | Yes (P12) | PASS |
| `notify-webhook` | P12 | Yes (P1 stub) | Yes (P12) | PASS |
| `notify-slack` | P12 | Yes (P1 stub) | Yes (P12) | PASS |
| `casbin-policies` | P1/P5 | Yes | Yes (P1) | PASS |
| `pgvector` | P1/P8/P11 | Yes (P1 stub) | Yes (P1) | PASS |
| `connector-linear` | P13/P17 | Yes (P1 stub) | Yes (P13, P17) | PASS |
| `symphony-ssh-worker` | P3 | Yes (P1 stub) | Yes (P3) | PASS |
| `symphony-http-api` | P3 | Yes (P1 stub) | Yes (P3) | PASS |
| `sandbox-docker` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `sandbox-podman` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `sandbox-daytona` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `sandbox-e2b` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `sandbox-modal` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `sandbox-vercel` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `parallel-worktrees` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `session-resume` | P4 | No (P4 owns) | Yes (P4) | PASS |
| `skills-daily-sync` | P5 | No (P5 owns) | Yes (P5) | PASS |
| `skill-marketplace` | P5 | No (P5 owns) | Yes (P5) | PASS |
| `report-llm-narration` | P12 | No (P12 owns) | Yes (P12) | PASS |
| `repo-write-ops` | P9 | No (P9 owns) | Yes (P9) | PASS |
| `external-search-meilisearch` | P11 | No (P11 owns) | Yes (P11) | PASS |
| `search-click-telemetry` | P11 | No (P11 owns) | Yes (P11) | PASS |
| `i18n` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `telemetry-remote` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `error-reporting-remote` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `vault-integration` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `scheduled-backups` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `experiments` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `import-csv` / `export-csv` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `import-linear` / `import-jira` / `import-plane` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `connector-github-issues` | P13 | No (P13 owns) | Yes (P13) | PASS |
| `connector-jira` | P13 | No (P13 owns) | Yes (P13) | PASS |
| `desktop-app` | P16 | No (P16 owns) | Yes (P16) | PASS |
| `pwa-offline` | P16 | No (P16 owns) | Yes (P16) | PASS |
| `keyring-macos` / `keyring-linux` / `keyring-windows` | P17 | No (P17 owns) | Yes (P17) | PASS |
| `notify-discord` | P12 | No (P12 owns) | Yes (P12) | PASS |

**Note on P1 registry completeness:** P1's `src/flags/registry.ts` lists 16 flags in its initial seed. The remaining ~28 flags are registered by their owning pillars at module-init. The PRD's extensible design is intentional (per DECISIONS.md "Q-flag-granularity"). The TS `FeatureFlag` union type is built from a canonical registry module, not hard-coded in P1. Each pillar's issues include a flag-registration acceptance criterion. This pattern is PASS — no single file needs to list all 44+ flags up front; the registry is additive.

**Matrix I result: 44 flags, 44 PASS, 0 MISSING — all flags traced to owning pillar + gated features table.**

---

## Top-level issues count

| Metric | Value |
|---|---|
| Total pillars | 17 |
| Total issues (sum from filesystem) | 339 |
| AFK issues | 336 |
| HITL issues | 3 |
| HITL locations | P1-13 (passkey enrollment), P7-02 (TipTap Svelte binding spike), P17-12 (governance files) |

---

## Outstanding gaps (noticed during coverage check, not yet in DECISIONS.md or any PRD)

### Gap 1 — A3 (Migration downgrade strategy) not locked or PRD'd

**Source:** EXTRA-GAPS.md §A3; DECISIONS.md auto-lock list covers A1/A2/A4/A6 only — A3 is absent.

**What's missing:** No `down_0XXX.sql` reversal files, no `schema_migrations` table contract, no `fulcrum db migrate --target-version X` command with downgrade support. P1 PRD references `PRAGMA user_version` and `schema_migrations` table for forward version checks but says nothing about a downgrade path. The `MIGRATION_FAILED` error model points to `fulcrum db migrate --target-version X` in P1's error table, implying the command is planned, but its contract (including downgrade) is never specified.

**Impact:** Multi-version clusters, user downgrades from v0.2→v0.1, and rollback-after-failed-migration are undefined. For a local-first tool this is low-criticality short-term but becomes a support problem at SaaS launch.

**Recommended action:** Add to Pillar 1 PRD §Migration architecture: (a) every migration ships a paired `down_NNNN.sql`; (b) `schema_migrations(version int, applied_at, rolled_back_at)` table; (c) `fulcrum db migrate --target-version N` applies up/down as needed with safety check (reject downgrade if data would be destroyed); (d) add `foundation.schema-version` doctor check to warn on version mismatch. Add auto-lock entry to DECISIONS.md as A3.

**Severity: PARTIAL** — the forward path is covered; the downgrade path is absent. Requires a pre-execution amendment to Pillar 1 PRD.

---

### Gap 2 — A5 (License dependency audit + CONTRIBUTING governance) not PRD'd

**Source:** EXTRA-GAPS.md §A5; DECISIONS.md auto-lock list covers A1/A2/A4/A6 only — A5 is absent.

**What's missing:** P17 ships GOVERNANCE.md, SECURITY.md, CODE_OF_CONDUCT.md, and VERSIONING.md (per Q-governance lock). However, EXTRA-GAPS.md A5 also called for a `LICENSE-DEPS.md` (dependency license audit: confirm all deps MIT/Apache/BSD; flag any AGPL/SSPL/BSL). REQUIREMENTS.md §Cross-Cutting Requirements states "All deps MIT/Apache/BSD. No AGPL/SSPL/BSL embedded" but there is no issue or acceptance criterion that runs a license-scanning gate in CI.

**Impact:** An AGPL or SSPL dep that slips in undetected during a pillar's dependency additions would create a distribution-licensing conflict.

**Recommended action:** Add to P17 (or P1 as a CI gate) an acceptance criterion: `license-checker` or `licensee` runs in `bun run ci` and fails on any AGPL/SSPL/BSL dep. Add to P17 issues breakdown. Add A5 auto-lock to DECISIONS.md.

**Severity: PARTIAL** — the intent is stated in REQUIREMENTS.md but no CI enforcement is specified and no issue carries this as an acceptance criterion.

---

### Gap 3 — TUI accessibility (B4 partial for TUI surface)

**Source:** EXTRA-GAPS.md §B4; P16 PRD fully covers Web WCAG 2.1 AA; P15 covers keyboard-parity.

**What's missing:** P15 (TUI) states keyboard-first and full parity with Web for every action, but no explicit terminal-specific accessibility targets are stated (e.g., color-contrast in terminal palettes, no-color mode for monochrome terminals, screen-reader compatibility for terminal emulators supporting NVDA/brltty).

**Impact:** TUI accessibility is partially handled by virtue of being keyboard-first, but no explicit CI gate or acceptance criterion covers it. Low-impact for initial execution but worth noting.

**Recommended action:** Add to P15 §Done when: "No-color mode (`FULCRUM_NO_COLOR=1` / `NO_COLOR` env) renders all information without relying on color alone; high-contrast terminal theme respects theme engine accent." One acceptance criterion, no blocking work.

**Severity: PARTIAL** — keyboard parity is present; terminal-specific a11y targets absent.

---

## Summary table

| Matrix | Rows | PASS | PARTIAL | MISSING |
|---|---|---|---|---|
| A — Verbatim ask | 23 | 23 | 0 | 0 |
| B — Pillar-level | 17 | 17 | 0 | 0 |
| C — Cross-cutting B1–B10 | 10 | 10 | 0 | 0 |
| D — Auto-locked C-items | 7 | 7 | 0 | 0 |
| E — Contradictions D1–D5 | 5 | 5 | 0 | 0 |
| F — Foundational constraints C1–C5 | 5 | 5 | 0 | 0 |
| G — Three-surface parity | 17 | 17 | 0 | 0 |
| H — Doctor integration | 17 | 17 | 0 | 0 |
| I — Feature flag registry | 44 | 44 | 0 | 0 |
| **Total** | **145** | **145** | **0** | **0** |
| **Outstanding gaps** | 3 (A3, A5, B4-TUI) | — | 3 | 0 |

---

## Sign-off

**Coverage check FAILS — see Outstanding gaps.**

Three PARTIAL items were found. None blocks the architecture or causes scope drift in any existing pillar. Each requires a targeted amendment before execution begins:

1. **A3 (migration downgrade)** → add `down_NNNN.sql` contract + `fulcrum db migrate --target-version` spec to Pillar 1 PRD + DECISIONS.md A3 auto-lock. Estimated: 1 PRD section + 1 issue in P1.
2. **A5 (license CI gate)** → add `license-checker` CI gate acceptance criterion to P17 (or P1) + DECISIONS.md A5 auto-lock. Estimated: 1 acceptance criterion in an existing issue.
3. **B4-TUI (terminal a11y targets)** → add `NO_COLOR` / high-contrast acceptance criterion to P15 §Done when. Estimated: 2 lines.

Once these three amendments land, every value, feature, and concern the user asked for is fully traced to a specific PRD + issue. Execute after amendments.

---

*Word count: ~3,490 | Matrix rows: 145 | PARTIAL/MISSING: 3 outstanding gaps (all minor, all actionable in <1 hour)*

---
## 2026-05-01 patches applied
- A3: migration up/down + schema-version tracking — DECISIONS.md A3 + P1 issue 19.
- A5: license-deps CI gate — P17 new issue.
- B4: TUI terminal accessibility — P15 acceptance criteria.

Sign-off: PASS.
