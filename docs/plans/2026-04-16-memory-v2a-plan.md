# Implementation Plan: Memory v2a — Hooks + PCI + Tier A Algorithms

## Overview

v2a is the baseline that directly closes Fulcrum's stated memory problem: hook-driven, typed, sanitized, deduped writes; a singleton Project Content Index (PCI) watching code + prose; an L0→L1→L2 retrieval pipeline with safety floors and WAL provenance; and per-host correctness fixes that stop the existing five integrations from over-firing or mis-routing. v2a is independently shippable in ~3 weeks (one engineer, 1.5 weeks for two with parallel PRs) and produces the cold-install user-visible outcome: starting a fresh session writes typed memories, indexes the project, and answers `recall_memory` / `query_memory` / `search_code` deterministically — with zero auto-injection, zero project-local data, and zero manual activation. Everything beyond this baseline (full 51-table Kuzu unification, `code_context` / `project_context`, Dreaming, global pointer, LongMemEval, Copilot, plugin marketplace bundles) is deferred to v2b.

## Architecture Decisions

- **PCI watcher topology:** per-directory non-recursive `fs.watch`, proven in prior art. New file `packages/memory/src/pci/watcher.ts` exporting `watchDirectory`, `handleFileEvent`, `closeWatcherSubtree`, `isMissingPathError`, `getPathStats`. Chokidar is rejected for the PCI source watcher because `fs.watch(recursive:true)` pre-allocates inotify watches on every subdir before the callback filter runs, blowing past kernel limits on large repos (prior-art's chokidar dep is declared but never used; prior-art proves the per-dir non-recursive topology). The vault watcher in `packages/memory/src/vault/watcher.ts` keeps chokidar — vault tree is small and bounded.
- **`memories.kind` CHECK widening:** drop the closed CHECK enum via the SQLite 12-step table-rebuild dance in PR 1. Validation moves to `packages/memory/src/write.ts` so v2a can add `file_patch`, `bash_trace`, `pre_compact_extract`, `session_summary`, `task_outcome`, `blocker_resolution`, `delegation_summary`, `decision`, `identity`, `persona`, `summary` without further rebuilds.
- **`slug NOT NULL UNIQUE` + `vault_path NOT NULL`:** also forced via the same 12-step rebuild in PR 1 (CREATE NEW → INSERT SELECT with synthesized slugs → DROP OLD → RENAME). `FULCRUM_MEMORY_V2=0` rollback is documented as **best-effort** — the rebuild is one-way; rollback only flips write paths, it does not unrebuild the table.
- **Hybrid fusion:** keep RRF (k=60) in `packages/memory/src/scoring.ts` (`rrfScore` line 41, `rrfScoreWithSparse` line 65, `rrfFuse` line 103). Do NOT switch to prior art's weighted-sum (`0.6 vec + 0.4 bm25_normalized`); that variant is logged as a v2b ablation in the open-questions surface only.
- **`min_score` envelope:** every recall response is `{results: T[], reason?: 'no_match' | 'below_floor'}`. `'no_match'` distinguishes empty-corpus from filter-suppressed; `'below_floor'` says "candidates existed but all scored below `min_score`." Affects PR 2 (recall) and PR 6 (hooks consume the envelope).
- **Gitignore in PCI watcher:** prefer `git ls-files -z` + `git ls-files --others --exclude-standard -z` inside git repos (prior-art `src/lib/git.ts:NodeGit.getGitFiles`); fall back to the `ignore` npm package using prior-art's hierarchical walker pattern (`src/lib/index/walker.ts`). Both lifted into PR 4.
- **Kuzu DDL set for v2a PR 7:** extend `packages/memory/src/kuzu/schema.ts` with node tables `File`, `CodeChunk`, `Symbol`; rel tables `edits` (Memory→File), `about` (Memory→File or Symbol), `mentions` (Memory→Symbol), `imports` (File→File), `calls` (Symbol→Symbol), `defines` (File→Symbol), `contained_in` (CodeChunk→File). NOT the full 51-table unification — adversarial F1 correction.
- **Session-scope storage:** persisted in central SQLite. `memories` gains `scope='session'|'project'|'workspace'` (extending today's CHECK), plus `session_id TEXT` already exists at line 132 of `schema.ts` and `expires_at INTEGER` is added new. A daily sweep job (`fulcrum memory sweep-expired`, idempotent) is **hosted in the MCP server lifecycle** (not the refcounted PCI singleton — the singleton tears down 30s after refcount→0, which would prevent the sweep from ever firing in normal multi-session use). The sweep also runs opportunistically on every `start_agent_run` (cheap predicate-indexed DELETE) to bound row accumulation between MCP restarts.
- **`scope='global'` writes in v2a:** soft route (per v2a review F-P1-2 + user decision). Writes accept `scope='global'` into the schema; recall actions (`recall_memory` / `query_memory` / `search_code`) filter `scope='global'` rows out and treat them as workspace-scoped at retrieval time; a non-blocking warning is logged once per workspace per day. Rationale: agents that pre-emptively use `scope='global'` for v2b forward-compat don't see write errors; v2b PR 12 lights up the role policy that makes those rows queryable.
- **PCI watcher fallback for unsupported filesystems:** detect at watch init via `statfs.f_type` (Linux) / `statfs.f_basetype` (macOS); fall back to periodic full rescan (e.g., every 5 minutes) on NFS / CIFS / FUSE / Overlay / Windows junctions where `fs.watch` events are silently dropped. Log a startup warning naming the detected FS. **Defaults (5min interval, FS-type list) are tunable pending field calibration** — adjust based on real reports.
- **Watcher event-emission contract** (cross-plan P1-5 mitigation): both vault watcher (chokidar) and PCI watcher (`fs.watch`) debounce file events by 100ms before emitting `content_change` on `fulcrum-core` event stream. Events carry `{kind: 'memory'|'code', path, sha256, change_type: 'add'|'change'|'unlink'|'rename'}` with consistent semantics regardless of underlying library. v2b reducers (git ingestion, REM extraction) consume the unified stream.
- **WAL ordering invariant (verbatim from §5.6):** `sanitizeOnWrite()` runs first; WAL records `sha256(sanitized_content)` only; then L0 vault, L1 INSERT, L2 embedding (durable only), Kuzu reducer. WAL accepts content from the sanitizer's output, not raw caller input.
- **Rollback is operator-only:** `fulcrum memory rollback` is registered in the CLI surface but explicitly omitted from the action registry that `fulcrum action exec` enumerates. A compromised agent with shell access cannot trigger rollback through the action surface.

## Critical Constraints (preserve verbatim — from handover §"Critical constraints")

1. **Global-only data** (HARD). All DB / vault / sessions under `globalDataDir()` from `fulcrum-core`. Never project-local. `.fulcrum/` in project dir is forbidden.
2. **L0 → L1 → L2 write order.** L0 (vault markdown) first; L1 (SQLite) second; L2 (Kuzu + sqlite-vec) third/async. `upsertStateEntry()` before `writeFileSync()` to avoid watcher echo.
3. **Full 64-char sha256.** Never truncate — breaks echo-suppression.
4. **Control-plane features are dormant, not absent.** All code ships; nothing auto-runs beyond baseline (memory writes, PCI watcher, sanitization, context guards, secret scan, recall tools).
5. **CLI-first primary; MCP overlay.** Every capability reachable via `fulcrum action exec <name>`. MCP is selective subset exposed via `fulcrum serve mcp --mode filtered`, added on demand.
6. **Write-side automation; recall stays agent-explicit.** No auto-injection anywhere. Agents call `recall_memory` deliberately.
7. **Context-type NO DEFAULT.** `start_agent_run` requires explicit `context_type` argument; fail-closed.
8. **Sanitize runs BEFORE WAL.** WAL records post-sanitize body hash only.
9. **Monitor binds loopback.** 127.0.0.1 asserted at startup; refuses non-loopback without auth token.
10. **Rollback is operator-only.** `fulcrum memory rollback` NOT exposed via agent-callable `fulcrum action exec`.

## Standard Task Workflow (every task in this plan follows this lifecycle)

Every task — without exception — flows through these nine steps. Skips are auditable defects.

**Exception: bootstrap PRs.** PRs 1, 2, 5, 6 rewrite the very tables and code paths that the `mcp__fulcrum__*` calls below depend on. For those PRs, the workflow drops the `mcp__fulcrum__*` lifecycle calls and uses external substitutes — see §"Bootstrap Mode" below. Skills (`agent-skills:*`, `compound-engineering:*`, `find-docs`) and built-in tools stay in for every PR including bootstrap ones.

| # | Step | Skill / MCP tool | Why |
|---|---|---|---|
| 1 | **Orient** | `mcp__fulcrum__build_cos_context`, `mcp__fulcrum__get_workspace_status`, `mcp__fulcrum__recall_memory query=<task topic>` | Pull world-state + prior decisions before touching code. |
| 2 | **Load context** | `agent-skills:context-engineering` | Right files, right rules, right bounds; refuses guess-work on stale snapshots. |
| 3 | **Source-verify libraries** | `agent-skills:source-driven-development` + `find-docs <library>` (or `mcp__mcpmu__context7--resolve-library-id` then `--query-docs`) | For every framework/SDK API touched (Kuzu, sqlite-vec, chokidar, `fs.watch`, `xxhash-wasm`, ONNX runtimes, MCP SDK). Training data is stale; docs are not. |
| 4 | **Open run** | `mcp__fulcrum__start_agent_run` with `agent_role`, `task_id`, `context_type='primary'` | Lifecycle row created; PCI watcher refcount incremented. |
| 5 | **TDD slice** | `agent-skills:test-driven-development` then `agent-skills:incremental-implementation` | Failing test first, then thinnest implementation that passes. No big-bang implementations. |
| 6 | **Heartbeat** | `mcp__fulcrum__heartbeat_agent_run` every ~30s during long work, with `current_step` + `progress_pct` | Prevents stale-run sweeper from killing the row. |
| 7 | **Build / verify** | `agent-skills:build` (compile + test + typecheck) + the task's explicit `Verify:` command | All `Verify:` commands MUST pass before declaring complete. |
| 8 | **Self-review** | `agent-skills:review` (5-axis: correctness, readability, architecture, security, performance) | Catch the obvious before requesting human review. |
| 9 | **Close run + record decision** | `mcp__fulcrum__complete_agent_run` (with `output_summary` + `artifact_paths`); `mcp__fulcrum__write_memory` with `kind='decision'` for any non-obvious choice | Audit trail; future agents recall the *why*. |

**On block:** `mcp__fulcrum__block_agent_run` with explicit `reason`. Do NOT silently abandon.

**On error:** `agent-skills:debugging-and-error-recovery` (reproduce → localize → fix → guard with regression test). Do NOT guess-fix.

## Bootstrap Mode (PRs that rewrite their own dogfooding tools)

Four v2a PRs (1, 2, 5, 6) touch tables and code paths the Standard Task Workflow's `mcp__fulcrum__*` calls depend on. During those PRs, calling Fulcrum's own tools risks a half-rebuilt schema, a stale return envelope, or a hook firing through the old path on first run and the new path on retry. The engineer cannot trust the tools while building them.

**Rule:** during a bootstrap PR, drop the `mcp__fulcrum__*` lifecycle calls from steps 1, 4, 6, 9 of the Standard Task Workflow. Use the external substitutes below. Skills and built-in tools stay in.

| PR | Why it's bootstrap-risky | Replace `mcp__fulcrum__*` with |
|---|---|---|
| PR 1 — Schema rebuild | `memories` 12-step rebuild + `agent_runs.context_type` migration; any write hits a half-rebuilt schema | git for branching/commits; `Bash` + `Read`/`Edit`/`Write`/`Grep` for code; Claude Code skills (`agent-skills:*`, `compound-engineering:*`, `find-docs`); plain markdown notes in `docs/decisions/` for what `write_memory` would record; Claude Code's built-in `TaskCreate`/`TaskUpdate` for what `mcp__fulcrum__update_task` would track. |
| PR 2 — Retrieval pipeline | `recall_memory` envelope shape changes mid-PR; return shape may be stale until merge | Same external substitutes. Read prior decisions from `docs/decisions/` instead of `recall_memory`. |
| PR 5 — Sanitize + WAL | `write_memory` may bypass new sanitizer if PR is half-merged; risk of writing un-sanitized rows that survive into the merged WAL | Same external substitutes. Engineer notes go to `docs/decisions/` only. |
| PR 6 — Hook rewrite | `runPostHook` is mid-rewrite; lifecycle calls (`start_agent_run`/`complete_agent_run`) may fire through old or new path inconsistently | Same external substitutes. Manual `git log` + branch state for what run lifecycle would track. |

**Bootstrap-mode entry checkpoint** (run BEFORE the PR opens):
- Capture `mcp__fulcrum__get_workspace_status` JSON snapshot to `docs/decisions/2026-04-XX-pr-N-bootstrap-entry.json`
- Capture `mcp__fulcrum__list_tasks status=in_progress` snapshot
- Once captured, you cannot reliably query these mid-PR — they are your last known-good world-state.

**Bootstrap-mode exit checkpoint** (run AFTER merge, BEFORE the next PR resumes Standard Workflow):
- Smoke-test: one `mcp__fulcrum__write_memory` + `mcp__fulcrum__recall_memory query='<exact body>'` round-trip
- Smoke-test: one `mcp__fulcrum__start_agent_run` + `complete_agent_run` round-trip
- Both must return their expected shapes. Failure = release blocker; the rebuild left a regression.

**What stays safe in every PR (use freely, including bootstrap PRs):**
- Built-in tools: `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `TaskCreate`, `TaskUpdate`
- Claude Code skills: `agent-skills:*` (TDD, build, review, security-and-hardening, deprecation-and-migration, etc.), `compound-engineering:*` (ce-review, document-review, git-commit, git-commit-push-pr, ce-pr-description, etc.), `find-docs`
- Git directly (`git` / `gh` CLI)
- Third-party MCP: `mcp__mcpmu__*` (Context7, Exa, Tavily, octocode), `mcp__claude_ai_*` (Gmail, Calendar, Drive)
- Vault writes via the existing chokidar vault watcher (unchanged by these PRs)

**Why not just dogfood-and-fix?** Because dogfooding while the dogfood is mid-rewrite means a tool failure could prevent the engineer from tracking that the tool failed. You cannot `block_agent_run` if `start_agent_run` already errored. Bootstrap mode keeps an external paper trail that survives the rewrite.

## Per-PR Quality Gates

Every PR must satisfy these gates before merging. Conditional gates fire only when triggered.

### Always-on gates (every PR)

- [ ] All tasks for the PR have `mcp__fulcrum__update_task(status='completed')`.
- [ ] All `Verify:` commands pass on a clean checkout (`pnpm install && pnpm -r build && pnpm -r test`).
- [ ] `agent-skills:code-review-and-quality` (multi-axis review) passes — author runs first, then human reviewer confirms.
- [ ] `compound-engineering:ce-review` tiered persona pass on the diff.
- [ ] `compound-engineering:ce-pr-description` produces the PR description (value-first, not log-first).
- [ ] `compound-engineering:git-commit-push-pr` (or `compound-engineering:git-commit` if pushing manually) creates the commit + PR with proper structure.
- [ ] `mcp__fulcrum__write_memory` records the PR's headline decision with `kind='decision'`, tags `['v2a', 'pr-N']`, scope=workspace.
- [ ] No new TypeScript errors; no new lint warnings; no bypass of project hooks (`--no-verify`).

### Conditional gates (fire when the trigger applies)

| Trigger | Required skill / check |
|---|---|
| PR touches sanitize / WAL / rollback / scope / auth / policy / context_type | `agent-skills:security-and-hardening` audit + `security-review` skill on the diff. |
| PR touches DB schema or migration | `agent-skills:deprecation-and-migration` checklist + manual rollback dry-run on a populated test DB. |
| PR touches the monitor / dashboard endpoints (PR 4 Task 23) | `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser` on `http://127.0.0.1:4721/content-index`. |
| PR touches retrieval scoring / RRF / fusion / chunkers (PRs 2, 3) | `agent-skills:performance-optimization` baseline run; `pnpm --filter fulcrum-memory vitest run src/eval/` regression. |
| PR adopts a new external library (`xxhash-wasm`, `ignore`) | `find-docs <library>` source-verify + license-check (must be MIT/Apache-2.0/BSD-equivalent). |
| PR touches CI workflow files (`.github/workflows/*.yml`) | `agent-skills:ci-cd-and-automation` checklist. |
| PR introduces a publicly-callable interface (CLI command, MCP tool, action) | `agent-skills:api-and-interface-design` review (stable contract, versioning, deprecation path documented). |

## Skill + MCP tool index (where in the plan each is used)

| Skill / Tool | Used by |
|---|---|
| `agent-skills:test-driven-development` | Every task (TDD is non-negotiable). |
| `agent-skills:source-driven-development` + `find-docs` / `context7` | Tasks 7, 8, 17 (prior-art / prior-art lifts), Task 19 (`fs.watch` semantics), Task 24 (prior art scanner port), all Kuzu DDL work. |
| `agent-skills:security-and-hardening` + `security-review` | PR 5 entirely (Tasks 24–28); PR 1 Task 3 (context_type NO DEFAULT); PR 6 Task 29–32 (sanitize→WAL ordering on hooks). |
| `agent-skills:deprecation-and-migration` | PR 1 Tasks 1, 2, 3 (the three table rebuilds). |
| `agent-skills:performance-optimization` | PR 2 (retrieval pipeline), PR 3 (chunkers), PR 4 (PCI watcher throughput). |
| `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser` | PR 4 Task 23 (monitor `/content-index`). |
| `agent-skills:ci-cd-and-automation` | `FULCRUM_MEMORY_V2` flag wiring across CI; per-host correctness PR cluster CI updates. |
| `agent-skills:debugging-and-error-recovery` | Any failing test or race-condition investigation (Task 31 partial UNIQUE design, Task 22 watcher dedup). |
| `agent-skills:incremental-implementation` | Every task (no big-bang implementations). |
| `agent-skills:code-review-and-quality` + `compound-engineering:ce-review` | Every PR before merge. |
| `agent-skills:documentation-and-adrs` | Every architectural decision recorded as ADR under `docs/decisions/` + matching `mcp__fulcrum__write_memory` row. |
| `compound-engineering:document-review` (mode:headless) | Run on this plan + any spec doc edits. Already executed; residual P1s logged. |
| `compound-engineering:ce-pr-description` + `git-commit-push-pr` | Every PR's commit + description. |
| `mcp__fulcrum__create_task` | At PR kickoff (one row per task; assigned to `software_engineer` or specialist role). |
| `mcp__fulcrum__start_agent_run` / `heartbeat_agent_run` / `complete_agent_run` / `block_agent_run` | Every task execution (lifecycle). |
| `mcp__fulcrum__write_memory` | After every PR + after every non-obvious decision (kind=`decision`). |
| `mcp__fulcrum__recall_memory` | At task start (recall prior decisions on adjacent code). |
| `mcp__fulcrum__build_cos_context` | At plan kickoff and at the start of each Phase. |
| `mcp__fulcrum__get_workspace_status` | Daily standup-equivalent for engineers running multiple PRs in parallel. |

## Task List

### Phase 1: PR 1 — Schema + Tier A algorithms (effort: 1 week)

Schema rebuild for `memories`; new PCI/projects/wikilinks/tags/recall-events tables; `agent_runs.context_type` NO DEFAULT; Tier A copy-verbatim files dropped into `packages/memory/src/`.

**🛠️ Bootstrap mode: ON.** This PR rebuilds the `memories` and `agent_runs` tables; `mcp__fulcrum__*` calls hit a half-rebuilt schema and may fail or write to the wrong shape. Engineer uses external substitutes per §"Bootstrap Mode" for the duration of this PR. Capture the entry-checkpoint snapshots before opening the PR.

**Mandatory skills:** `agent-skills:deprecation-and-migration` for every schema-rebuild task (Tasks 1, 2, 3); each rebuild requires a manual rollback dry-run on a populated copy of `~/.local/share/fulcrum/db/fulcrum.db` BEFORE the PR opens. `find-docs sqlite-vec` to verify current sqlite-vec virtual-table syntax against the version in `packages/memory/package.json`. `agent-skills:source-driven-development` for SQLite ALTER TABLE limits (12-step rebuild semantics).

- [ ] Task 1: Rebuild `memories` table via SQLite 12-step dance to drop the CHECK enum and add v2a columns
  - Acceptance: schema-init creates `memories_new` with no `kind` CHECK, plus columns `tier TEXT NOT NULL DEFAULT 'short_term'`, `slug TEXT NOT NULL UNIQUE`, `vault_path TEXT NOT NULL`, `provenance TEXT NOT NULL DEFAULT '{}'`, `supersedes TEXT NULL`, `recall_count INTEGER NOT NULL DEFAULT 0`, `unique_query_count INTEGER NOT NULL DEFAULT 0`, `max_recall_score REAL NOT NULL DEFAULT 0.0`, `last_recalled_at INTEGER NULL`, `embedded INTEGER NOT NULL DEFAULT 0`, `schema_version INTEGER NOT NULL DEFAULT 1`, `normalize_version INTEGER NOT NULL DEFAULT 1`, `expires_at INTEGER NULL`. Migration synthesizes `slug = memory_id` and `vault_path = 'legacy/' || memory_id || '.md'` for existing rows. `INSERT INTO memories_new SELECT … FROM memories` followed by `DROP TABLE memories; ALTER TABLE memories_new RENAME TO memories`. Existing indexes recreated.
  - Verify: `pnpm --filter fulcrum-core vitest run src/tests/schema-migration.test.ts`
  - Files: `packages/core/src/db/schema.ts`, `packages/core/src/tests/schema-migration.test.ts`
  - Maps to AC: §11.1, §11.33
  - Cites research: `docs/brainstorms/2026-04-16-memory-architecture-v2/04-data-model.md` §3.2; source inventory §"v2a PR 1"
  - Note: §11.14 (post-Dreaming `embedded=1` invariant) was previously claimed here but is now correctly v2b per scope-split update (Dreaming → v2b PR 11). v2a only ships the `embedded` column; v2b PR 11's deep phase is what flips the invariant.

- [ ] Task 2: Widen `memories.scope` CHECK to include `'session' | 'project' | 'workspace'` and keep `'global'` (for forward-compat with v2b)
  - Acceptance: same 12-step rebuild; existing rows with `scope='file'` and `scope='task'` are mapped to `'project'` during INSERT SELECT (those values become Kuzu-edge metadata in v2b). New CHECK accepts `('session','project','workspace','global')`. Index `idx_memories_session` (already at line 153) preserved.
  - Verify: `pnpm --filter fulcrum-core vitest run src/tests/schema-migration.test.ts`
  - Files: `packages/core/src/db/schema.ts`, `packages/core/src/tests/schema-migration.test.ts`
  - Maps to AC: §11.27, §11.28
  - Cites research: `04-data-model.md` §3.2; pre-resolved decision #8

- [ ] Task 3: Add `agent_runs.context_type` (TEXT NOT NULL, NO DEFAULT) and `parent_run_id` (TEXT NULL) via three-step migration
  - Acceptance: step 1 adds column NULLABLE; step 2 backfills `UPDATE agent_runs SET context_type = 'primary' WHERE context_type IS NULL`; step 3 enforces NOT NULL + CHECK(`context_type IN ('primary','subagent','cron','heartbeat','flush')`). New `start_agent_run` signature requires `context_type`; calls without it surface a `ContextTypeRequiredError`.
  - Verify: `pnpm --filter fulcrum-core vitest run src/tests/agent-runs-context-type.test.ts`
  - Files: `packages/core/src/db/schema.ts`, `packages/core/src/agent-runs.ts`, `packages/core/src/tests/agent-runs-context-type.test.ts`
  - Maps to AC: §11.3, §11.36, §11.37
  - Cites research: `04-data-model.md` §3.1 (security-F6 + adversarial-F6); critical constraint #7

- [ ] Task 4: Create `memory_recall_events`, `memory_wikilinks`, `memory_tags` tables
  - Acceptance: tables created with the exact DDL in §3.3, §3.3a, §3.3b. Indexes `idx_recall_events_memory`, `idx_recall_events_query`, `idx_wikilinks_dst`, `idx_wikilinks_dst_id`, `idx_tags_tag` present.
  - Verify: `pnpm --filter fulcrum-core vitest run src/tests/memory-aux-tables.test.ts`
  - Files: `packages/core/src/db/schema.ts`, `packages/core/src/tests/memory-aux-tables.test.ts`
  - Maps to AC: §11.4, §11.12, §11.13
  - Cites research: `04-data-model.md` §3.3 / §3.3a / §3.3b

- [ ] Task 5: Create `code_files`, `code_chunks`, `code_symbols`, `code_chunks_fts` tables
  - Acceptance: DDL from §3.3c applied. `code_files.UNIQUE (project_id, rel_path)` enforced. `code_chunks_fts USING fts5(content, content='code_chunks', content_rowid='rowid')`. Indexes `idx_code_files_lang`, `idx_code_files_ws`, `idx_code_chunks_file`, `idx_code_chunks_symbol`, `idx_code_symbols_name` present.
  - Verify: `pnpm --filter fulcrum-core vitest run src/tests/pci-tables.test.ts`
  - Files: `packages/core/src/db/schema.ts`, `packages/core/src/tests/pci-tables.test.ts`
  - Maps to AC: §11.19, §11.20, §11.21
  - Cites research: `04-data-model.md` §3.3c
  - Note: §11.50 (prose covers docs + graph-edge surfacing) was previously claimed here; per scope-split it is v2b PR 20 only. v2a's prose chunkers cover §11.20 (md + configs); v2b adds the graph-edge surfacing §11.50 references.

- [ ] Task 6: Create `projects` table (portable pathing) with `root_realpath` UNIQUE
  - Acceptance: DDL from §3.3d applied. `projects.project_id` is the FK target for `code_files.project_id`. `idx_projects_realpath` UNIQUE present.
  - Verify: `pnpm --filter fulcrum-core vitest run src/tests/projects-table.test.ts`
  - Files: `packages/core/src/db/schema.ts`, `packages/core/src/tests/projects-table.test.ts`
  - Maps to AC: §11.24, §11.25, §11.26
  - Cites research: `04-data-model.md` §3.3d

- [ ] Task 7: Lift Tier A pure-algorithm files from prior-art + prior art
  - Acceptance: files copied verbatim with one-line provenance comment `// Ported from: <repo>/<path>@<commit>  License: <MIT|Apache-2.0>`. Files: `temporal-decay.ts`, `mmr.ts`, `hybrid.ts`, `events.ts` (WAL JSONL), `walker.ts`, `lock.ts`, `intent.ts`, `colbert-math.ts`, `ignore-patterns.ts`. Imports rewritten to `fulcrum-core` / standard library. Each file has at least one round-trip vitest.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/tier-a-lift.test.ts`
  - Files: `packages/memory/src/scoring/temporal-decay.ts`, `packages/memory/src/scoring/mmr.ts`, `packages/memory/src/retrieval/hybrid.ts`, `packages/memory/src/wal/events.ts`, `packages/memory/src/pci/walker.ts`, `packages/memory/src/pci/lock.ts`, `packages/memory/src/retrieval/intent.ts`, `packages/memory/src/retrieval/colbert-math.ts`, `packages/memory/src/pci/ignore-patterns.ts`, `packages/memory/src/tests/tier-a-lift.test.ts`
  - Maps to AC: §11.30, §11.34
  - Cites research: source inventory "Tier A — IMPLEMENT DIRECTLY"; `code-search-prior-art-prior-art.md` §"Files Worth Copying"; `memory-prior-art-local.md` §"Top 5 copy-verbatim files"
  - **Skills/Tools:** `agent-skills:source-driven-development` to verify each upstream file's current shape against `/home/mkh/workspace/prior-art/` and `/home/mkh/workspace/prior-art/` (license + last-modified-commit captured in provenance comment). License check: must be MIT / Apache-2.0 / BSD-equivalent before copy.

- [ ] Task 8: Lift prior-art `git-files.ts` and `hash.ts` (xxhash64) into PCI scaffold
  - Acceptance: `getGitFiles(root)` shells `git ls-files -z` + `git ls-files --others --exclude-standard -z`, returns `string[]` of project-root-relative paths. `computeBufferHash(buf)` returns `xxh64:<hex>` string with the `xxh64:` prefix preserved (per prior-art `hashesMatch` forward-compat). `xxhash-wasm` added as a dependency in `packages/memory/package.json`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-git-files.test.ts src/tests/pci-hash.test.ts`
  - Files: `packages/memory/src/pci/git-files.ts`, `packages/memory/src/pci/hash.ts`, `packages/memory/package.json`, `packages/memory/src/tests/pci-git-files.test.ts`, `packages/memory/src/tests/pci-hash.test.ts`
  - Maps to AC: §11.21
  - Cites research: `code-search-prior-art-prior-art.md` §"From prior-art" file list; pre-resolved decision #6
  - **Skills/Tools:** `find-docs xxhash-wasm` to confirm current API + bundle size + tree-shake compatibility; `agent-skills:api-and-interface-design` for the `xxh64:` prefix contract (forward-compat with prior-art); license check on `xxhash-wasm` (must be MIT/Apache-2.0/BSD).
  - Note: §11.22 (cross-process safety) belongs to Task 18 (singleton + lock), not to this lift task.

- [ ] Task 9: Move `kind` validation from CHECK constraint to `packages/memory/src/write.ts` + tri-conjunctive integration test for §11.1
  - Acceptance: `validateKind(kind: string): void` accepts the union from §3.4 + the legacy values from existing schema (`fact`, `summary`, `symbol`, `decision`, `procedure`, `error`, `diff`, `doc`, `code`, `task_goal`, `task_decision`, `task_failure`, `task_outcome`, `tool_trace`, `reasoning_step`, `lesson`). Per-kind char caps from §3.4 enforced at write time; over-cap content truncated with `[…truncated N chars]` marker. **Plus integration test** asserting every hook write path produces a row with all three of `kind`, `tier`, and `provenance` non-NULL (and `provenance` is a non-empty JSON object) — closes the §11.1 tri-conjunctive coverage gap (v2a review F-P1-5).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/write-kind-validation.test.ts && pnpm --filter fulcrum-cli vitest run src/tests/hooks-tri-conjunctive-coverage.test.ts`
  - Files: `packages/memory/src/write.ts`, `packages/memory/src/tests/write-kind-validation.test.ts`, `packages/cli/src/tests/hooks-tri-conjunctive-coverage.test.ts` (new)
  - Maps to AC: §11.1
  - Cites research: `04-data-model.md` §3.4; pre-resolved decision #2; v2a review F-P1-5 mitigation

### Checkpoint: PR 1 complete

- [ ] memories table rebuild succeeds; existing rows mapped (scope `file`/`task` → `project`; synthesized slug/vault_path)
- [ ] `FULCRUM_MEMORY_V2=0` rollback documented as **best-effort** in `docs/guides/memory-rollback.md` (rebuild is one-way)
- [ ] Tier A files lifted with provenance headers
- [ ] `agent_runs.context_type` is NOT NULL with no default; tests assert `start_agent_run` without `context_type` errors

### Phase 2: PR 2 — Retrieval pipeline (effort: 3 days)

**🛠️ Bootstrap mode: ON.** This PR rewrites the `recall_memory` return envelope (`{results, reason?}`) and the RRF/rerank pipeline. Calling `mcp__fulcrum__recall_memory` mid-PR returns a stale shape; downstream code that branches on the new `reason` field gets `undefined`. Engineer uses external substitutes per §"Bootstrap Mode" for the duration of this PR.

Port prior-art `searcher.ts` into `packages/memory/src/retrieval/search.ts`. Same I/O as current `recall.ts`; new internals.

- [ ] Task 10: Port prior-art `searcher.ts` staged retrieval (RRF fusion + two-stage rerank + diversification)
  - Acceptance: new `packages/memory/src/retrieval/search.ts` exports `runStagedSearch({query, scope, limit, min_score})` that (a) runs FTS5 + sqlite-vec + symbol queries in parallel, (b) fuses via RRF (k=60) using existing `scoring.ts`, (c) applies pooled-cosine rerank → 40 candidates, (d) ColBERT MaxSim rerank → 20, (e) per-file diversification (max N=3 per file), (f) score calibration to [0,1] with High/Medium/Low buckets. Behavior is DB-agnostic except for the FTS5/vec calls.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/retrieval-search.test.ts`
  - Files: `packages/memory/src/retrieval/search.ts`, `packages/memory/src/tests/retrieval-search.test.ts`
  - Maps to AC: §11.4, §11.19
  - Cites research: source inventory §B.1 "prior-art's retrieval pipeline (CROWN JEWEL)"; `code-search-prior-art-prior-art.md` §"Files Worth Copying" → `searcher.ts`

- [ ] Task 11: Wire `recall_memory` (existing tool) to call `runStagedSearch` with `min_score` envelope
  - Acceptance: `packages/memory/src/recall.ts` calls `runStagedSearch`; return shape becomes `{results, reason?: 'no_match' | 'below_floor'}`. `'no_match'` returned when zero candidates exist; `'below_floor'` when candidates existed but all scored below `min_score`. Default `min_score = 0.35` for semantic queries, `0` for FTS-only. Every returned entry inserts a row into `memory_recall_events` with `(memory_id, query, score, rank, caller_run_id, caller_role, source='recall_memory', created_at)`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/recall-min-score.test.ts src/tests/recall-events.test.ts`
  - Files: `packages/memory/src/recall.ts`, `packages/memory/src/tests/recall-min-score.test.ts`, `packages/memory/src/tests/recall-events.test.ts`
  - Maps to AC: §11.4, §11.30
  - Cites research: `03-write-and-recall-paths.md` §2.6; pre-resolved decision #5; source inventory §B.6

- [ ] Task 12: Add `query_memory` action (CLI: `fulcrum action exec query_memory`; MCP: filtered overlay)
  - Acceptance: action accepts `{tags?, linked_to?, file_paths?, kind?, frontmatter?, date_range?, text?, scope?}`. Backlinks via `memory_wikilinks` table (`linked_to` = O(log n) via index). FTS5 via existing `memories` virtual table; tags via `memory_tags`. Returns `{results, reason?}` envelope. Recall events inserted with `source='query_memory'`. Touches L1 only — never L2.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/query-memory.test.ts`
  - Files: `packages/memory/src/recall.ts` (or new `packages/memory/src/query-memory.ts`), `packages/cli/src/tool-registry.ts` (action registration), `packages/memory/src/tests/query-memory.test.ts`
  - Maps to AC: §11.12, §11.13
  - Cites research: `03-write-and-recall-paths.md` §2 #2 (`query_memory` definition)

- [ ] Task 13: Add `search_code` action (CLI + MCP filtered overlay)
  - Acceptance: action accepts `{text?, semantic?, symbol?, lang?, path?, hybrid?, scope?, min_score?}`. Calls `runStagedSearch` against `code_chunks` + `code_chunks_fts` + `code_symbols`. Returns `{results: Array<{rel_path, start_line, end_line, symbol_path, content, score, project_id}>, reason?}`. Cheap path for non-semantic queries.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/search-code.test.ts`
  - Files: `packages/memory/src/retrieval/search-code.ts` (new), `packages/cli/src/tool-registry.ts`, `packages/memory/src/tests/search-code.test.ts`
  - Maps to AC: §11.19, §11.27, §11.28
  - Cites research: `03-write-and-recall-paths.md` §2 #4

### Checkpoint: PR 2 complete

- [ ] `runStagedSearch` ports prior-art crown-jewel pipeline; RRF retained at k=60
- [ ] `recall_memory`, `query_memory`, `search_code` all return `{results, reason?}` envelope
- [ ] `min_score` floor enforced uniformly; recall events inserted 1:1 with returned rows

### Phase 3: PR 3 — AST chunker extension + prose chunker (effort: 1 week)

Merge prior-art chunker fields into Fulcrum's existing AST chunker; add prose chunker for markdown + config files.

- [ ] Task 14: Extend `packages/memory/src/chunkers/ast-chunker.ts` with prior-art fields
  - Acceptance: chunker emits `role: 'ORCHESTRATION'|'DEFINITION'|'IMPLEMENTATION'|'DOCS'`, `complexity: number`, `definedSymbols: string[]`, `referencedSymbols: string[]`, `parentSymbol: string | null`, plus a per-file **anchor chunk** (signature: `{kind: 'anchor', content: <imports + exports + top-comments>, anchorPenalty: 0.99}`). Existing public API surface preserved; new fields optional in the Chunk type.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/chunkers/ast-chunker-fields.test.ts`
  - Files: `packages/memory/src/chunkers/ast-chunker.ts`, `packages/memory/src/chunkers/types.ts`, `packages/memory/src/tests/chunkers/ast-chunker-fields.test.ts`
  - Maps to AC: §11.19, §11.20
  - Cites research: source inventory §B.2; `code-search-prior-art-prior-art.md` §"Anchor chunk per file"

- [ ] Task 15: Add prose chunker for markdown + config files (`kind='prose'`)
  - Acceptance: new `packages/memory/src/chunkers/prose-chunker.ts` chunks `*.md`, `*.json`, `*.yaml`, `*.yml`, `*.toml`. Markdown uses heading-aware splitting with ~10% overlap; config files chunk by top-level key. Emits `Chunk[]` with `kind='prose'`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/chunkers/prose-chunker.test.ts`
  - Files: `packages/memory/src/chunkers/prose-chunker.ts`, `packages/memory/src/chunkers/index.ts`, `packages/memory/src/tests/chunkers/prose-chunker.test.ts`
  - Maps to AC: §11.20
  - Cites research: `04-data-model.md` §3.3c (`kind='prose'`); `00-scope-split.md` §"What v2a ships" → "Prose / code / config chunkers"
  - Note: §11.50 is v2b PR 20.

- [ ] Task 16: Backfill `code_files` rows for existing `code_chunks` (synthesize `file_id`)
  - Acceptance: migration helper `backfillCodeFiles()` walks distinct `file_path` values from `code_chunks`, joins to `projects` via `project_id`, computes `file_id = sha256(project_id + ':' + rel_path)`, inserts a `code_files` row with current SHA + mtime. Existing chunks updated with `file_id`. Idempotent.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/backfill-code-files.test.ts`
  - Files: `packages/memory/src/setup/backfill-code-files.ts` (new), `packages/memory/src/tests/backfill-code-files.test.ts`
  - Maps to AC: §11.25, §11.26
  - Cites research: `04-data-model.md` §3.3c (`file_id = sha256(project_id + ':' + rel_path)`)

### Checkpoint: PR 3 complete

- [ ] AST chunker emits role/complexity/symbols/anchor fields
- [ ] Prose chunker covers md/json/yaml/toml
- [ ] Existing `code_chunks` rows have synthesized `file_id` + matching `code_files` rows

### Phase 4: PR 4 — PCI watcher + syncer (effort: 1.5–2 weeks)

Singleton, refcounted, per-dir non-recursive `fs.watch`, cross-process locked, dedup against vault watcher.

- [ ] Task 17: Author `packages/memory/src/pci/watcher.ts` with prior-art per-directory non-recursive `fs.watch` topology + unsupported-FS fallback
  - Acceptance: file exports `watchDirectory(dir, opts)`, `handleFileEvent(dir, event, filename)`, `closeWatcherSubtree(dir)`, `isMissingPathError(err)`, `getPathStats(path)`. One `fs.FSWatcher` per directory. Ignored dirs (per `ignore-patterns.ts` + gitignore) never get an `fs.watch` allocation. Subtree cleanup on `unlink` of a directory. No chokidar import. **Unsupported-FS fallback:** at watch init, `detectFilesystem(rootDir)` runs `statfs` (Linux `f_type` / macOS `f_basetype`); if FS ∈ {NFS, CIFS, FUSE, Overlay, Windows-junction}, watcher mode flips to `mode='polling'` with a 5-minute periodic full rescan instead of `fs.watch` allocation. Startup logs: `[pci] watcher mode=native|polling, fs=<type>, root=<path>`. (Defaults — interval, FS list — tunable pending field calibration; v2a review F-P1-4 mitigation.)
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-watcher-topology.test.ts src/tests/pci-watcher-fs-fallback.test.ts`
  - Files: `packages/memory/src/pci/watcher.ts`, `packages/memory/src/pci/detect-fs.ts` (new), `packages/memory/src/tests/pci-watcher-topology.test.ts`, `packages/memory/src/tests/pci-watcher-fs-fallback.test.ts`
  - Maps to AC: §11.17, §11.18, §11.21
  - Cites research: `code-search-prior-art-prior-art.md` §"prior-art" → "non-recursive per-dir watch topology"; source inventory Tier A row "prior-art `watchDirectory` / `handleFileEvent` / `closeWatcherSubtree`"; pre-resolved decision #1; v2a review F-P1-4 (FS fallback mitigation)

- [ ] Task 18: Author `packages/memory/src/pci/singleton.ts` ProjectContentIndexManager
  - Acceptance: process-singleton with `ensure(projectRoot): Handle`, refcount per `realpathSync(projectRoot)`. `Handle.stop()` decrements; refcount → 0 + 30s grace → tear-down. Cross-process lock at `{globalDataDir()}/project-index-<sha256(realpath)>.lock` carrying `{pid, started_at}`; stale locks (dead PIDs) cleaned on manager start. Second process opening the same project reads the central SQLite but does NOT spawn a watcher.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-singleton.test.ts`
  - Files: `packages/memory/src/pci/singleton.ts`, `packages/memory/src/tests/pci-singleton.test.ts`
  - Maps to AC: §11.17, §11.18, §11.22
  - Cites research: `05-safety-watcher-wal.md` §5.5.1; `code-search-prior-art-prior-art.md` §"server-registry.ts" + `lock.ts`

- [ ] Task 19: Wire ingest pipeline (`packages/memory/src/ingest.ts`) for incremental file events
  - Acceptance: `add` → ingest new file (chunkers + embed + Kuzu nodes/edges); `change` → diff chunks by `chunk_id = hash(file_id + start_line + content)`, only new chunk_ids re-embed, removed chunk_ids evicted from sqlite-vec + Kuzu; `unlink` → DELETE `code_files` (cascade), evict vecs, drop Kuzu File node + edges; `rename` (chokidar-style `unlink+add` within 500ms) detected by body-hash match → preserve unchanged chunk_ids. mtime → hash → chunk-diff cascade per prior-art `syncer.ts`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-incremental-ingest.test.ts`
  - Files: `packages/memory/src/ingest.ts`, `packages/memory/src/pci/syncer.ts` (new), `packages/memory/src/tests/pci-incremental-ingest.test.ts`
  - Maps to AC: §11.21
  - Cites research: source inventory §B.3 "prior-art's incremental syncer"; `code-search-prior-art-prior-art.md` §"MetaCache-as-bloom-filter" + "Flush ordering for crash safety"

- [ ] Task 20: Hook `manager.ensure(projectRoot)` into `start_agent_run` and `manager.handle.stop()` into `complete_agent_run` / `block_agent_run` / heartbeat-expiry
  - Acceptance: every `start_agent_run` call increments PCI refcount; every `complete_agent_run` / `block_agent_run` decrements. Heartbeat-expiry sweep also decrements. MCP server holds a top-level handle while serving. Two concurrent `start_agent_run` calls against the same project root produce ONE `fs.FSWatcher` for the root and ONE init event.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-lifecycle.test.ts`
  - Files: `packages/memory/src/pci/singleton.ts`, `packages/core/src/agent-runs.ts`, `packages/cli/src/mcp-server.ts`, `packages/memory/src/tests/pci-lifecycle.test.ts`
  - Maps to AC: §11.17, §11.18
  - Cites research: `05-safety-watcher-wal.md` §5.5.1 "Refcount holders"

- [ ] Task 21: Implement gitignore-respecting walker with `git ls-files` fast-path + `ignore` package fallback
  - Acceptance: in git repos, `getGitFiles()` (Task 8) is the source-of-truth file list. Outside git repos, hierarchical walker from prior-art `walker.ts` (Task 7) applies `.gitignore` + `.fulcrumignore` + `DEFAULT_IGNORE_PATTERNS`. Hidden files filtered. Files > 1 MB skipped. `node_modules/`, `.fulcrum/`, `dist/`, `build/`, `.turbo/`, `target/`, binary files always excluded.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-walker-integration.test.ts`
  - Files: `packages/memory/src/pci/walker.ts`, `packages/memory/src/pci/git-files.ts`, `packages/memory/src/tests/pci-walker-integration.test.ts`
  - Maps to AC: §11.21
  - Cites research: pre-resolved decision #6; `code-search-prior-art-prior-art.md` §"git ls-files as source-of-truth"
  - Note: §11.50 is v2b PR 20.

- [ ] Task 22: Dedup PCI watcher against existing vault watcher
  - Acceptance: vault watcher (`packages/memory/src/vault/watcher.ts`) keeps chokidar — vault tree is small; no behavior change. PCI watcher refuses to attach to any directory under `globalDataDir()/memory/` (vault is owned by vault watcher). Both watchers emit `content_change` events on `fulcrum-core` event stream with disjoint `kind: 'memory'|'code'` tags.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/pci-vault-dedup.test.ts`
  - Files: `packages/memory/src/pci/singleton.ts`, `packages/memory/src/vault/watcher.ts`, `packages/memory/src/tests/pci-vault-dedup.test.ts`
  - Maps to AC: §11.18, §11.24
  - Cites research: `05-safety-watcher-wal.md` §5.5.5 "Watcher telemetry"

- [ ] Task 22a: Specify watcher event-emission contract (`fulcrum-core` event stream)
  - Acceptance: documented type `ContentChangeEvent = { kind: 'memory' | 'code'; path: string; sha256: string; change_type: 'add' | 'change' | 'unlink' | 'rename' }`. Both watchers (chokidar vault, `fs.watch` PCI) debounce file events by 100ms before emit. Test asserts: same file edited twice within 100ms produces ONE event; events from each watcher carry consistent `change_type` semantics regardless of underlying library; v2b consumers (git reducer, REM extraction) can subscribe to the unified stream without per-watcher branching.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/watcher-event-contract.test.ts`
  - Files: `packages/core/src/events/content-change.ts` (new), `packages/memory/src/vault/watcher.ts`, `packages/memory/src/pci/watcher.ts`, `packages/memory/src/tests/watcher-event-contract.test.ts`
  - Maps to AC: §11.17, §11.24
  - Cites research: cross-plan review P1-5 mitigation (event contract for v2b consumers)

- [ ] Task 23: Expose monitor counters at `http://127.0.0.1:4721/content-index`
  - Acceptance: GET returns `{files_indexed, chunks_indexed, vecs_in_index, last_change_at, watcher_refcount}`. Loopback-only assertion (per critical constraint #9). Hooked into existing monitor router. Live-reload smoke: open the endpoint in headless Chrome via DevTools MCP, assert it returns 200 + valid JSON within 50ms; assert non-loopback bind attempts (e.g., `0.0.0.0`) fail with explicit error.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/serve-mcp-monitor.test.ts`
  - Files: `packages/cli/src/mcp-server.ts`, `packages/memory/src/pci/singleton.ts`, `packages/cli/src/tests/serve-mcp-monitor.test.ts`
  - Maps to AC: §11.17
  - Cites research: `05-safety-watcher-wal.md` §5.5.5; critical constraint #9
  - **Skills/Tools:** `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser` (DevTools MCP) for the live-reload smoke; `agent-skills:security-and-hardening` for the loopback-only assertion (constraint #9 enforcement test).

### Checkpoint: PR 4 complete

- [ ] PCI watcher uses per-dir non-recursive `fs.watch`; survives large repos without exhausting inotify
- [ ] Singleton + refcount + 30s grace + cross-process lock all enforced; second process never spawns a duplicate watcher
- [ ] Vault watcher unchanged; PCI watcher refuses paths under `globalDataDir()/memory/`
- [ ] `http://127.0.0.1:4721/content-index` exposes counters
- [ ] **After PR 4 merges, the code index runs cold-install zero-activation. Typed memory writes (the second half of "zero-activation productive") land in PR 6 — the full "cold-install productive" milestone is the PR 6 checkpoint, not this one.**

### Phase 5: PR 5 — Sanitize + WAL + query sanitizer (effort: 2 days)

prior art threat scanner; prior art WAL with sanitize-before-WAL; prior art query sanitizer; rollback operator-only.

**🛠️ Bootstrap mode: ON.** This PR installs the sanitize-before-WAL invariant on the write path. Calling `mcp__fulcrum__write_memory` mid-PR may bypass the new sanitizer (if the PR is half-merged) and write un-sanitized rows that then survive into the merged WAL. Engineer uses external substitutes per §"Bootstrap Mode" for the duration of this PR.

**Mandatory skills for every task in this PR:** `agent-skills:security-and-hardening` (this is the security PR — every task touches it) + `security-review` skill on the diff before merge. `find-docs` against prior art (`/home/mkh/workspace/prior-art/` if local) and prior art (`/home/mkh/workspace/prior-art/`) for any pattern lifts. Threat-scanner regex patterns require `agent-skills:test-driven-development` red-team tests: every redaction rule needs both a positive (matches) and adversarial-evasion (Unicode bidi, base64, mixed-case, encoding-bypass) negative test before the rule lands.

- [ ] Task 24: Port prior art memory-content threat scanner to TypeScript
  - Acceptance: `packages/memory/src/sanitize/threat-scanner.ts` exports `scanForThreats(content): {events: SanitizeEvent[], redacted: string}`. Patterns: `<fulcrum-recall>` fence markers (strip), prompt-injection signatures (`IGNORE PREVIOUS`, role hijack, system-prompt spoof — redact with `[…redacted: potential injection…]`), AWS keys / GitHub tokens / high-entropy credential strings (redact `[…redacted: credential…]`), invisible-Unicode (BOM, ZWJ, bidi overrides — strip).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/sanitize/threat-scanner.test.ts`
  - Files: `packages/memory/src/sanitize/threat-scanner.ts`, `packages/memory/src/tests/sanitize/threat-scanner.test.ts`
  - Maps to AC: §11.2, §11.10
  - Cites research: source inventory §B.7 "prior art's memory-content threat scanner"; `05-safety-watcher-wal.md` §6

- [ ] Task 25: Compose `sanitizeOnWrite(content, meta) → {content, events[]}` middleware
  - Acceptance: `packages/memory/src/sanitize/index.ts` exports `sanitizeOnWrite`. Composes: (1) strip fence markers, (2) threat-scanner, (3) credential redactor, (4) invisible-Unicode strip. Errors never throw — content written as-is with `sanitize_event=error` telemetry. Wired into `packages/memory/src/write.ts` as the first step of every write path.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/sanitize/on-write.test.ts`
  - Files: `packages/memory/src/sanitize/index.ts`, `packages/memory/src/write.ts`, `packages/memory/src/tests/sanitize/on-write.test.ts`
  - Maps to AC: §11.2
  - Cites research: `05-safety-watcher-wal.md` §6 + prior art failure-isolation invariant

- [ ] Task 26: Implement WAL with sanitize-before-WAL ordering invariant + errno-aware failure handling
  - Acceptance: `packages/memory/src/wal/writer.ts` exports `appendWal(record)`. Records `{ts, op, memory_id, slug, kind, tier, workspace_id, project_id, provenance, content_sha256, sanitize_events}`. WAL accepts content from sanitizer's output ONLY (typed by `SanitizedContent` brand). Daily file rotation at `{globalDataDir()}/db/wal/memory-writes-YYYY-MM-DD.jsonl`. **Failure handling (v2a review F-P1-6):** WAL append failure with sync errno (`ENOSPC`, `EROFS`, `EIO`) **blocks the write** (throws `WalDurabilityError`) — write does NOT proceed without an audit row. Transient failures (e.g., contention, `EAGAIN`) retry once; if retry succeeds, the write proceeds; if retry fails, log + proceed (so a single contention spike doesn't block all writes).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/wal/sanitize-before.test.ts`
  - Files: `packages/memory/src/wal/writer.ts`, `packages/memory/src/wal/types.ts`, `packages/memory/src/write.ts`, `packages/memory/src/tests/wal/sanitize-before.test.ts`
  - Maps to AC: §11.34
  - Cites research: `05-safety-watcher-wal.md` §5.6 "Ordering invariant"; source inventory §B.12 "prior art WAL redaction sentinels"; pre-resolved decision per critical constraint #8
  - Note: §11.32 (`fulcrum memory replay-wal` re-derives lost L1 rows) is v2b PR 15. v2a only ships the WAL **structure** that v2b's replay command will consume — the AC itself requires the command, which is v2b.

- [ ] Task 27: Port prior art query sanitizer (4-step escalation)
  - Acceptance: `packages/memory/src/sanitize/query.ts` exports `sanitizeQuery(q): string`. Steps: (1) passthrough if clean, (2) extract question if assistant-output detected, (3) use tail sentence if still long, (4) truncate tail at hard cap. Applied at every recall entry point (`recall_memory`, `query_memory`, `search_code`).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/sanitize/query.test.ts`
  - Files: `packages/memory/src/sanitize/query.ts`, `packages/memory/src/recall.ts`, `packages/memory/src/tests/sanitize/query.test.ts`
  - Maps to AC: §11.30
  - Cites research: source inventory §B.11 "prior art's query sanitizer"

- [ ] Task 28: Register `fulcrum memory rollback` as operator-only CLI command (NOT in action surface)
  - Acceptance: `packages/cli/src/index.ts` registers `fulcrum memory rollback --since=<TIME>` requiring `--yes-i-really-want-to-undo-N-writes`. Scoped to current workspace by default; `--cross-workspace` requires additional confirmation. Command does NOT appear in `fulcrum action list` output. Test asserts `mcp__fulcrum__*` tool list does not contain `memory_rollback`.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/memory-rollback-not-action.test.ts`
  - Files: `packages/cli/src/index.ts`, `packages/cli/src/tool-registry.ts`, `packages/cli/src/tests/memory-rollback-not-action.test.ts`
  - Maps to AC: §11.44
  - Cites research: `05-safety-watcher-wal.md` §5.6 "Rollback authorization"; critical constraint #10
  - Note: §11.42 (policy rules — `enabled` is the only knob) was incorrectly claimed here; rollback is not a policy-rule registry. §11.42 is v2a per scope-split but currently unowned; deferred to the Open Questions surface for explicit user resolution.

### Checkpoint: PR 5 complete

- [ ] Sanitize-before-WAL invariant enforced via type brand
- [ ] WAL records `content_sha256` only; `grep -r 'password' {globalDataDir()}/db/wal/*.jsonl` returns zero
- [ ] Query sanitizer applied at every recall entry point
- [ ] `fulcrum memory rollback` invocable via CLI; not in action surface; not in MCP

### Phase 6: PR 6 — Hook writes rewrite (effort: 3 days)

Rewrite `runPostHook` to extract real values, dedup per turn, emit typed memories. Delete Gemini `BeforeAgent` config entry. Narrow matchers.

**🛠️ Bootstrap mode: ON.** This PR rewrites `runPostHook` and the run lifecycle. `mcp__fulcrum__start_agent_run` / `complete_agent_run` calls may fire through the old hook path on one invocation and the new path on the next, producing inconsistent telemetry. Engineer uses external substitutes per §"Bootstrap Mode" for the duration of this PR.

- [ ] Task 29: Rewrite `runPostHook` in `packages/cli/src/hooks.ts` for typed `file_patch` writes + Obsidian graph-view smoke
  - Acceptance: on PostToolUse with `tool_name ∈ {Write, Edit, MultiEdit, NotebookEdit}`, extract `file_path` from `tool_input.file_path` (or `path`/`notebook_path`), construct `diff_summary` (≤800 chars from old/new content), write `kind='file_patch'` memory with full provenance `{agent_role, run_id, hook_point: 'PostToolUse', source_kind, parent_memory_id?, context_type, confidence}`. Per-turn dedup keyed by `sha256(tool_name, normalized_args, cwd)`; duplicates bump `recall_count_within_turn` instead of inserting. **Obsidian smoke (§11.11 mitigation per v2a review F-P1-1):** verify step parses a representative vault directory with a Dataview-compatible markdown parser and asserts (a) frontmatter is YAML-valid, (b) `[[wikilinks]]` resolve to existing files, (c) tags are navigable, (d) graph view would have ≥1 edge.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/hooks-file-patch.test.ts && pnpm --filter fulcrum-memory vitest run src/tests/vault-obsidian-smoke.test.ts`
  - Files: `packages/cli/src/hooks.ts`, `packages/cli/src/tests/hooks-file-patch.test.ts`, `packages/memory/src/tests/vault-obsidian-smoke.test.ts` (new)
  - Maps to AC: §11.1, §11.2, §11.3, §11.11
  - Cites research: `03-write-and-recall-paths.md` §1 write paths table; source inventory "PR 6 — Hook writes rewrite"; v2a review F-P1-1 (§11.11 ownership) + cross-plan review P2-2

- [ ] Task 30: Add `bash_trace` write path on `Bash` tool calls (allowlist of mutating verbs, NOT denylist of read-only)
  - Acceptance: PostToolUse with `tool_name='Bash'` writes `kind='bash_trace'` (`command ≤400 chars, exit_status, cwd`) **only** when the command matches the mutating-verb allowlist OR contains output-redirection followed by a mutating verb. Allowlist (v2a review F-P1-9): `rm`, `mv`, `cp`, `mkdir`, `chmod`, `chown`, `npm`, `pnpm`, `yarn`, `bun`, `git commit`, `git push`, `git merge`, `git rebase`, `git checkout`, `git branch -D`, `git reset`, `docker`, `kubectl apply|delete|patch`, `terraform apply|destroy`, `sed -i`, `tee` (without `-a` flag is mutating), `>`, `>>`, `|`, `&&`, `;` followed by any allowlist verb. Everything else (read-only commands like `ls`, `cat`, `grep`, `find`, `stat`, `file`, `tree`, `wc`, `awk`, `sed -n`, `jq`, `du`, `df`, `ps`, `top`, `whoami`, `id`, `uname`) skipped silently. Same dedup key. Rationale: a denylist of read-only commands is unmaintainable (the universe of read-only Unix tools is open); an allowlist of mutating verbs is small and precise.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/hooks-bash-trace.test.ts`
  - Files: `packages/cli/src/hooks.ts`, `packages/cli/src/tests/hooks-bash-trace.test.ts`
  - Maps to AC: §11.1
  - Cites research: `03-write-and-recall-paths.md` §1 write paths table row 2; v2a review F-P1-9 (allowlist invert)

- [ ] Task 31: Add Stop / SessionEnd `session_summary` fallback writer with race-safe partial UNIQUE index
  - Acceptance: on Stop / SessionEnd hook, attempt to INSERT `kind='session_summary'` (≤2200 chars) into `memories` for the current `run_id`. **Concurrency safety (v2a review F-P1-8):** PR 1 also creates a partial UNIQUE index `CREATE UNIQUE INDEX idx_memories_run_outcome ON memories(json_extract(provenance, '$.run_id')) WHERE kind IN ('task_outcome', 'blocker_resolution', 'session_summary')`. The Stop-hook INSERT relies on the UNIQUE constraint to fail-closed: if `update_task(status=completed)` raced ahead and wrote `task_outcome`, the Stop-hook INSERT errors with `SQLITE_CONSTRAINT` and the writer treats that as "outcome already recorded — skip." Eliminates the read-then-write race.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/hooks-session-summary.test.ts src/tests/hooks-stop-race.test.ts`
  - Files: `packages/cli/src/hooks.ts`, `packages/core/src/db/schema.ts` (partial UNIQUE index), `packages/cli/src/tests/hooks-session-summary.test.ts`, `packages/cli/src/tests/hooks-stop-race.test.ts` (new)
  - Maps to AC: §11.7
  - Cites research: `03-write-and-recall-paths.md` §1 write paths table row 7; `06-hooks-dreaming-operations.md` §9 "update_task vs Stop-hook"; v2a review F-P1-8 (Stop-hook race serialization)

- [ ] Task 32: Add PreCompact extractor wiring (Claude PreCompact + synthetic boundaries for Gemini SessionEnd / Codex Stop)
  - Acceptance: PreCompact event triggers an LLM-extractor (default model: Haiku, 5s timeout, fallback chain: configured → session's current model → Haiku → skip per §12.1). Extractor emits a list of `{decision, file_intent, error_resolution, blocker}` items, each ≤400 chars; each becomes one `kind='pre_compact_extract'` memory. Drop the "merge insights into preamble" branch per prior art B.8 correction — fire-and-forget eviction only.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/hooks-pre-compact.test.ts`
  - Files: `packages/cli/src/hooks.ts`, `packages/memory/src/extractors/pre-compact.ts` (new), `packages/cli/src/tests/hooks-pre-compact.test.ts`
  - Maps to AC: §11.6
  - Cites research: source inventory §B.8 prior art `on_pre_compress` correction; `03-write-and-recall-paths.md` §1 write paths table row 4

- [ ] Task 33: Hook output consumes recall envelope and renders fence
  - Acceptance: when hook code receives a recall result `{results, reason}`, output to agent stderr is wrapped via `wrapForRecall(entries)` (per §2.2 verbatim format `<fulcrum-recall trust="untrusted">…</fulcrum-recall>`). When `reason='no_match'` or `reason='below_floor'`, return empty fence with the reason annotated; agents can adjust queries.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/hooks-recall-fence.test.ts`
  - Files: `packages/cli/src/hooks.ts`, `packages/memory/src/sanitize/wrap-for-recall.ts` (new), `packages/cli/src/tests/hooks-recall-fence.test.ts`
  - Maps to AC: §11.10, §11.30
  - Cites research: `03-write-and-recall-paths.md` §2.2; pre-resolved decision #5

- [ ] Task 34: Enforce non-primary write drop (silent + telemetry, no exception)
  - Acceptance: any write from a run with `context_type ≠ 'primary'` and `kind ≠ 'delegation_summary'` is silently dropped with a telemetry event (`hook_event` row, `event_type='non_primary_write_dropped'`). No exception, no block. Guard runs even when `FULCRUM_MEMORY_V2=0`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/non-primary-drop.test.ts`
  - Files: `packages/memory/src/write.ts`, `packages/memory/src/tests/non-primary-drop.test.ts`
  - Maps to AC: §11.3
  - Cites research: `05-safety-watcher-wal.md` §5; critical constraint #7

### Checkpoint: PR 6 complete

- [ ] All hook writes go through `sanitizeOnWrite()` → WAL → L0 → L1 → L2 (durable only) → Kuzu
- [ ] Per-turn dedup observed; duplicate writes bump counter not insert
- [ ] PreCompact extractor produces ≥1 memory per compaction event in a 200-turn session
- [ ] Non-primary writes silently dropped with telemetry

### Phase 7: PR 7 — Kuzu graph (memory + code nodes only) (effort: 1 week)

**Mandatory skills:** `find-docs Kuzu` (or `mcp__mcpmu__context7--query-docs` for `/kuzudb/kuzu`) — Kuzu's DDL syntax + vector-index API + Cypher subset shifts between minor versions; verify against the actual version pinned in `packages/memory/package.json` BEFORE authoring DDL. `agent-skills:source-driven-development` to confirm `CREATE NODE TABLE` / `CREATE REL TABLE` additive-DDL semantics for v2b forward-compat (cross-plan review P1-3 mitigation). Test every DDL with a temp-DB round-trip before claiming the PR done.

Extend `packages/memory/src/kuzu/schema.ts` with File/CodeChunk/Symbol nodes and 7 rel tables. NOT the full 51-table unification.

- [ ] Task 35: Add `File`, `CodeChunk`, `Symbol` node DDLs to `packages/memory/src/kuzu/schema.ts`
  - Acceptance: new exported builders/constants:
    - `buildFileNodeDDL()` → `CREATE NODE TABLE IF NOT EXISTS File (file_id STRING, workspace_id STRING, project_id STRING, rel_path STRING, language STRING, sha256 STRING, mtime_ns INT64, size_bytes INT64, indexed_at TIMESTAMP, PRIMARY KEY (file_id))`.
    - `buildCodeChunkNodeDDL(dims)` → `CREATE NODE TABLE IF NOT EXISTS CodeChunk (chunk_id STRING, file_id STRING, kind STRING, symbol_path STRING, start_line INT64, end_line INT64, embedding FLOAT[${dims}], PRIMARY KEY (chunk_id))`.
    - `buildSymbolNodeDDL()` → `CREATE NODE TABLE IF NOT EXISTS Symbol (symbol_id STRING, file_id STRING, name STRING, kind STRING, line INT64, PRIMARY KEY (symbol_id))`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/kuzu-v2a-schema.test.ts`
  - Files: `packages/memory/src/kuzu/schema.ts`, `packages/memory/src/tests/kuzu-v2a-schema.test.ts`
  - Maps to AC: §11.19, §11.23
  - Cites research: `04-data-model.md` §3.3c; pre-resolved decision #7

- [ ] Task 36: Add 7 rel-table DDLs: `EDITS`, `ABOUT_FILE`/`ABOUT_SYMBOL`, `MENTIONS_SYMBOL`, `IMPORTS`, `CALLS`, `DEFINES`, `CONTAINED_IN`
  - Acceptance: rel tables created. Edge categories from §8.1:
    - `EDITS: Memory→File` (`weight FLOAT, source STRING, created_at TIMESTAMP`).
    - `ABOUT_FILE: Memory→File` and `ABOUT_SYMBOL: Memory→Symbol` (existing `ABOUT_DDL` is `Memory→Entity`; add separate rel tables for the new node types).
    - `MENTIONS_SYMBOL: Memory→Symbol`.
    - `IMPORTS: File→File`.
    - `CALLS: Symbol→Symbol`.
    - `DEFINES: File→Symbol`.
    - `CONTAINED_IN: CodeChunk→File`.
  - All added to `buildAllDDL(dims)`. **No table rebuilds** — Kuzu rel tables are additive. Forward-compatible with v2b PR 10's 20-table expansion.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/kuzu-v2a-rels.test.ts`
  - Files: `packages/memory/src/kuzu/schema.ts`, `packages/memory/src/tests/kuzu-v2a-rels.test.ts`
  - Maps to AC: §11.23
  - Cites research: `06-hooks-dreaming-operations.md` §8.1 edge types table; pre-resolved decision #7

- [ ] Task 37: Populate File/CodeChunk/Symbol nodes from PCI watcher events (synchronous in chunk-write path)
  - Acceptance: `add` event → `File` node + `CodeChunk` nodes + `Symbol` nodes + `CONTAINED_IN` edges + `DEFINES` edges + `CALLS` edges (from `referencedSymbols` × `definedSymbols` resolution within file). `change` → upsert (Kuzu `MERGE`-equivalent). `unlink` → delete File node + cascade. Reducer is in-process, errors logged, never block ingest.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/kuzu-pci-population.test.ts`
  - Files: `packages/memory/src/kuzu/reducers/code.ts` (new), `packages/memory/src/ingest.ts`, `packages/memory/src/tests/kuzu-pci-population.test.ts`
  - Maps to AC: §11.23
  - Cites research: `06-hooks-dreaming-operations.md` §8.1 "Population path" table; failure-isolation invariant

- [ ] Task 38: Populate Memory nodes + cross-type edges (`EDITS`, `ABOUT_FILE`, `MENTIONS_SYMBOL`) from memory writes
  - Acceptance: `kind='file_patch'` → `EDITS` edge from Memory to each `file_paths[i]`'s File node. `kind='decision'` with body referencing `[[symbol:X]]` or `file:Y` → `ABOUT_FILE` / `ABOUT_SYMBOL` / `MENTIONS_SYMBOL` edges resolved via the wikilinks parser. Async after L1 insert per L0→L1→L2 ordering invariant.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/kuzu-memory-edges.test.ts`
  - Files: `packages/memory/src/kuzu/reducers/memory.ts` (new), `packages/memory/src/write.ts`, `packages/memory/src/tests/kuzu-memory-edges.test.ts`
  - Maps to AC: §11.23
  - Cites research: `06-hooks-dreaming-operations.md` §8.1 "Memory↔code cross-edges (mentions)"; critical constraint #2

### Checkpoint: PR 7 complete

- [ ] Kuzu schema extends with File/CodeChunk/Symbol; existing Memory + Entity tables untouched
- [ ] PCI watcher populates code nodes + intra-code edges
- [ ] Memory writes populate Memory↔code edges
- [ ] Schema is forward-compatible with v2b PR 10's 20-table expansion (no rebuilds)

### Phase 8: PR 8 — task_outcome synthesis + delegation hook (effort: 3 days)

Wire `update_task` → `task_outcome` / `blocker_resolution`. Port prior art `on_delegation` for parent-side subagent memory.

- [ ] Task 39: Wire `update_task(status='completed')` → synthesize `task_outcome` memory
  - Acceptance: `update_task` action handler queries the run's `file_patch` + `bash_trace` rows since `start_agent_run`, synthesizes `summary ≤1500 chars, files_touched, decisions`. Writes `kind='task_outcome'` with `provenance.run_id = current_run_id`. Race-condition guard per §9: Stop hook checks for this row before writing `session_summary`.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/task-outcome-synthesis.test.ts`
  - Files: `packages/core/src/tasks.ts`, `packages/memory/src/extractors/task-outcome.ts` (new), `packages/cli/src/tests/task-outcome-synthesis.test.ts`
  - Maps to AC: §11.7
  - Cites research: `03-write-and-recall-paths.md` §1 write paths table row 5; `06-hooks-dreaming-operations.md` §9

- [ ] Task 40: Wire `update_task(status='blocked')` → synthesize `blocker_resolution` memory
  - Acceptance: same shape as Task 39 but `kind='blocker_resolution'`, `reason ≤1500 chars, attempted_paths`. Stop-hook race-guard treats `blocker_resolution` equivalently to `task_outcome` (skip `session_summary`).
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/blocker-resolution.test.ts`
  - Files: `packages/core/src/tasks.ts`, `packages/memory/src/extractors/task-outcome.ts`, `packages/cli/src/tests/blocker-resolution.test.ts`
  - Maps to AC: §11.7
  - Cites research: `03-write-and-recall-paths.md` §1 write paths table row 6

- [ ] Task 41: Port prior art `on_delegation` pattern for parent-side subagent memory
  - Acceptance: `complete_agent_run` with non-null `parent_run_id` writes `kind='delegation_summary'` (≤800 chars `{task, result, artifacts}`) attributed to the **parent's** memory scope, not the child's. Child runs with `context_type='subagent'` cannot write any other kind (§5 enforcement). Maps to existing `packages/core/src/handoffs.ts`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/on-delegation.test.ts`
  - Files: `packages/memory/src/hooks/on-delegation.ts` (new), `packages/core/src/handoffs.ts`, `packages/core/src/agent-runs.ts`, `packages/memory/src/tests/on-delegation.test.ts`
  - Maps to AC: §11.3
  - Cites research: source inventory §B.8 "prior art's `on_delegation` pattern"; `03-write-and-recall-paths.md` §1 write paths table row 8

- [ ] Task 42: Ship `task-tracking` skill in `agent-integration/skills/task-tracking/SKILL.md`
  - Acceptance: skill is always-present guidance (no install step). Documents when to call `create_task`, `update_task`, what `task_outcome` synthesis produces. Visible to all 5 hosts via the symlinks created in PR-S1.
  - Verify: `ls agent-integration/skills/task-tracking/SKILL.md`
  - Files: `agent-integration/skills/task-tracking/SKILL.md`
  - Maps to AC: §11.41, §11.67
  - Cites research: source inventory "PR 8 — task_outcome synthesis + delegation hook" → "Ship task-tracking.skill.md"

### Checkpoint: PR 8 complete

- [ ] `update_task(status=completed|blocked)` produces exactly one synthesis memory; Stop-hook respects race-guard
- [ ] Subagent completion writes `delegation_summary` to parent
- [ ] `task-tracking` skill visible to all 5 hosts

### Phase 9: PR 9 — `query_memory` + `search_code` action surface finalization (effort: 3 days)

Already partly built in PR 2. PR 9 closes out the action surface for the v2a MCP-filtered overlay.

- [ ] Task 43: Register `recall_memory`, `query_memory`, `search_code` in the canonical action registry
  - Acceptance: each action has a `tool-registry.ts` entry with canonical name, CLI mapping, MCP mapping (filtered overlay), hook coverage (none — agent-explicit), availability rules. `fulcrum action exec recall_memory --query=X` works. MCP exposure controlled by `fulcrum serve mcp --mode filtered`.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/v2a-action-surface.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/tests/v2a-action-surface.test.ts`
  - Maps to AC: §11.38, §11.40, §11.44, §11.45, §11.46
  - Cites research: critical constraint #5; reference plan `docs/plans/2026-04-16-cli-first-action-platform-plan.md` "Action Surface" section

- [ ] Task 44: Document `code_context` and `project_context` as v2b-deferred but shape-stable
  - Acceptance: `fulcrum action list` shows `code_context` and `project_context` with `stability='deferred-v2b'`. Calling them returns `{error: 'v2b feature; v2a degrades to recall_memory + query_memory + search_code'}`. Per AC §11.40, the response **shape** is stable across cold install vs. v2b install — no surprise nulls.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/v2b-deferred-actions.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/tests/v2b-deferred-actions.test.ts`
  - Maps to AC: §11.40
  - Cites research: `00-scope-split.md` §"Excluded from v2a: `code_context` (graph-traversal cross-type), `project_context` (cross-entity bundle)"

- [ ] Task 45: Ship daily session-scope sweep (`fulcrum memory sweep-expired`) — hosted in MCP server lifecycle
  - Acceptance: idempotent CLI command. Deletes `memories WHERE expires_at IS NOT NULL AND expires_at < unixepoch()`. Runs on a 24h timer **inside the MCP server process** (which holds a top-level handle while `fulcrum serve mcp` is running) — NOT the PCI singleton (which tears down 30s after refcount→0 and would never fire the sweep in normal multi-session use). Also runs opportunistically on every `start_agent_run` (cheap predicate-indexed DELETE) to bound row accumulation between MCP restarts. Cron install optional via `fulcrum memory sweep-expired --install` (operator-only).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/sweep-expired.test.ts`
  - Files: `packages/memory/src/sweep.ts` (new), `packages/cli/src/index.ts`, `packages/cli/src/mcp-server.ts`, `packages/core/src/agent-runs.ts`, `packages/memory/src/tests/sweep-expired.test.ts`
  - Maps to AC: §11.27, §11.28
  - Cites research: pre-resolved decision #8; v2a review F-P0-8 mitigation (sweep timer placement)
  - Note: §11.36 (cold install works) and §11.37 (no auto-activation) are emergent integration ACs — moved to the per-host cluster checkpoint where they belong.

### Checkpoint: PR 9 complete

- [ ] `recall_memory` / `query_memory` / `search_code` registered as canonical actions; reachable via CLI + filtered MCP
- [ ] `code_context` / `project_context` are v2b-deferred but shape-stable
- [ ] Session-scope expiration sweep runs

### Phase 10 (parallel): Per-Host Correctness PR Cluster (~4h 22m total — Part 08 v2a rows)

Parallelizable with PRs 4–9. One PR per host where possible; collapses into a single PR if convenient.

- [ ] Task 46: §S1 — Create `agent-integration/skills/` canonical tree + symlinks for the 5 existing hosts
  - Acceptance: `agent-integration/skills/<name>/SKILL.md` is the source-of-truth tree. Move existing Gemini and Codex skills (6 + 6) into it (deduplicate by name). Symlinks: `agent-integration/claude/.agents/skills → ../../../skills`, `gemini/.agents/skills → ../../../skills`, `codex/.agents/skills → ../../../skills`, `opencode/.agents/skills → ../../../skills`, `pi/cockpit/skills → ../../skills`. macOS/Linux symlinks; CI uses real symlinks.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/skills-symlinks.test.ts`
  - Files: `agent-integration/skills/`, `agent-integration/claude/.agents/skills`, `agent-integration/gemini/.agents/skills`, `agent-integration/codex/.agents/skills`, `agent-integration/opencode/.agents/skills`, `agent-integration/pi/cockpit/skills`
  - Maps to AC: §11.67
  - Cites research: `08-per-host-plugin-integration.md` §S1; source inventory table row 5 (`[v2a]`)

- [ ] Task 47: §S2 — Narrow hook matchers to `Bash|Write|Edit|MultiEdit|Task|NotebookEdit` across the 5 hosts
  - Acceptance: Claude `settings-hooks-snippet.json` `matcher` regex narrowed; Gemini `hooks/hooks.json` `tools` array limited; Codex `config.toml` `allowed_tools` restricted; OpenCode `plugins/fulcrum.ts` adds in-plugin allowlist before shelling `fulcrum hook auto`; Pi `cockpit/index.ts` filters in pre/post handler. AC §11.68 satisfied.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/hook-matcher-narrowness.test.ts`
  - Files: `agent-integration/claude/settings-hooks-snippet.json`, `agent-integration/gemini/hooks/hooks.json`, `agent-integration/codex/config.toml`, `agent-integration/opencode/plugins/fulcrum.ts`, `agent-integration/pi/cockpit/index.ts`
  - Maps to AC: §11.68
  - Cites research: `08-per-host-plugin-integration.md` §S2; source inventory table row 12 (`[v2a]`)

- [ ] Task 48: §S3 — Wire run-lifecycle signals on Claude, Gemini, Codex, OpenCode
  - Acceptance: Claude adds `SessionEnd`, `SubagentStart`, `SubagentStop` hook entries (§H1 partial — skip the marketplace bundle). Gemini adds `AfterAgent` for `session_summary`. Codex migrates from `[[hooks]]` (feature-flagged) to `notify` (stable) for run-end. OpenCode subscribes `event: session.idle` + `session.compacted` (NOT `todo.updated` — that's v2b).
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/lifecycle-signals.test.ts`
  - Files: `agent-integration/claude/settings-hooks-snippet.json`, `agent-integration/gemini/hooks/hooks.json`, `agent-integration/codex/config.toml`, `agent-integration/opencode/plugins/fulcrum.ts`
  - Maps to AC: §11.7, §11.64
  - Cites research: `08-per-host-plugin-integration.md` §S3; source inventory table rows 7, 8-v2a, 9-v2a, 11

- [ ] Task 49: §H3 — Fix Codex `marketplace.json` `PLACEHOLDER_PLUGIN_PATH`
  - Acceptance: `agent-integration/codex/marketplace.json` has `path: "./plugin"` (or correct relative path). `codex plugin install <marketplace_url>` validates locally.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/codex-marketplace.test.ts`
  - Files: `agent-integration/codex/marketplace.json`
  - Maps to AC: §11.62
  - Cites research: `08-per-host-plugin-integration.md` §H3 upgrade #1; source inventory table row 2 (`[v2a]`)

- [ ] Task 50: §H4 — OpenCode in-plugin tool allowlist
  - Acceptance: `agent-integration/opencode/plugins/fulcrum.ts` has an explicit allowlist of `['Bash','Write','Edit','MultiEdit','NotebookEdit']` checked in `tool.execute.before` / `tool.execute.after` BEFORE shelling `fulcrum hook auto`. Read/Glob/Grep never produce a hook shell-out.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/opencode-allowlist.test.ts`
  - Files: `agent-integration/opencode/plugins/fulcrum.ts`
  - Maps to AC: §11.64, §11.68
  - Cites research: `08-per-host-plugin-integration.md` §H4 upgrade #2

- [ ] Task 51: §H6 — Pi cockpit `start|stop|status` CLI + delete dead `fulcrum.extension.json` + Pi-dispatched `file_patch` integration test
  - Acceptance: `fulcrum pi cockpit start` spawns the cockpit process and binds hooks. `stop` cleanly unbinds. `status` reports `{running, pid, started_at, last_event_at}`. `agent-integration/pi/fulcrum.extension.json` deleted. AC §11.39 satisfied (Pi command-only). Integration test asserts a Write performed via `fulcrum pi cockpit` produces a `kind='file_patch'` memory recallable via `recall_memory` (§11.9). NPM publish (row 13) is **v2b**, not v2a.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/pi-cockpit-cli.test.ts src/tests/pi-cockpit-file-patch-integration.test.ts`
  - Files: `packages/cli/src/index.ts`, `agent-integration/pi/cockpit/index.ts`, `agent-integration/pi/cockpit/start.ts` (new), `packages/cli/src/tests/pi-cockpit-file-patch-integration.test.ts` (new)
  - Maps to AC: §11.9, §11.39, §11.70
  - Cites research: `08-per-host-plugin-integration.md` §H6 upgrades #1, #3; source inventory table rows 1 (`[v2a]`), 14 (`[v2a]`); cross-plan review P1-1 (§11.9 ownership)

- [ ] Task 52: Delete Gemini `BeforeAgent` stub config entry (cleanup; no semantic change)
  - Acceptance: `agent-integration/gemini/hooks/hooks.json` no longer contains the `BeforeAgent` stub. AC §11.8, §11.70 satisfied.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/gemini-no-before-agent.test.ts`
  - Files: `agent-integration/gemini/hooks/hooks.json`
  - Maps to AC: §11.8, §11.70
  - Cites research: `08-per-host-plugin-integration.md` §H2; safe-fix #2 per §00-scope-split

### Checkpoint: Per-host correctness cluster complete

- [ ] Shared skills tree exists; 5 symlinks valid
- [ ] Hook matchers narrowed across 5 hosts; Read/Glob/Grep produce zero memory writes in typical sessions
- [ ] Lifecycle signals wired on Claude/Gemini/Codex/OpenCode
- [ ] Codex marketplace path fixed
- [ ] OpenCode allowlist in place
- [ ] Pi cockpit CLI shipped; dead JSON deleted; Pi-dispatched `file_patch` integration test green (§11.9)
- [ ] Gemini `BeforeAgent` stub removed
- [ ] **Cold-install integration: starting `fulcrum serve mcp` on a fresh machine produces typed memory writes + indexed code on first agent activity, with no manual activation step (§11.36, §11.37)**

## Per-PR Acceptance Gates

| PR | Title | Maps to §11 ACs |
|----|-------|----------------|
| 1 | Schema + Tier A algorithms | §11.1, §11.3, §11.24, §11.25, §11.26, §11.27, §11.28, §11.30, §11.33, §11.34 |
| 2 | Retrieval pipeline (RRF + min_score envelope) | §11.4, §11.12, §11.13, §11.19, §11.27, §11.28, §11.30 |
| 3 | AST chunker extension + prose chunker | §11.19, §11.20, §11.25, §11.26 |
| 4 | PCI watcher + syncer + singleton | §11.17, §11.18, §11.21, §11.22, §11.24 |
| 5 | Sanitize + WAL + query-sanitizer + rollback gate | §11.2, §11.10, §11.30, §11.34, §11.44 |
| 6 | Hook writes rewrite | §11.1, §11.2, §11.3, §11.6, §11.7, §11.10, §11.30 |
| 7 | Kuzu graph (memory + code only) | §11.19, §11.23 |
| 8 | task_outcome synthesis + delegation hook + skill | §11.3, §11.7, §11.41, §11.67 |
| 9 | Action surface + sweep | §11.27, §11.28, §11.38, §11.40, §11.44, §11.45, §11.46 |
| Per-host cluster | Correctness fixes + cold-install integration (S1+S2+S3+H3+H4+H6+Gemini cleanup) | §11.7, §11.8, §11.9, §11.36, §11.37, §11.39, §11.62, §11.64, §11.67, §11.68, §11.70 |

## Rollback Strategy

`FULCRUM_MEMORY_V2=0` is best-effort; the schema rebuild in PR 1 is one-way.

| PR | Rollback behavior under `FULCRUM_MEMORY_V2=0` |
|----|------------------------------------------------|
| 1 | Schema additions persist (rebuild is one-way). New columns ignored by old code paths. `slug`/`vault_path` columns inert if unused. **Acknowledged best-effort.** |
| 2 | Recall reverts to current `recall.ts` shape (no envelope, RRF without staged rerank). New tests skipped under flag-off. |
| 3 | New chunk fields populated but unread; existing chunker behavior preserved. |
| 4 | PCI watcher does not start; vault watcher unchanged. Existing ingest paths still work. |
| 5 | Sanitizer + WAL still run (defense-in-depth — sanitization is always-on per §10). Query sanitizer skipped. Rollback CLI present but inert. |
| 6 | `runPostHook` reverts to current parameter-key writes. PreCompact extractor disabled. Non-primary drop guard still runs (defense-in-depth). |
| 7 | Kuzu DDLs persist; new node tables empty. Existing Memory/Entity DDLs unaffected. |
| 8 | `update_task` synthesis disabled; `delegation_summary` not written. Existing handoff behavior preserved. |
| 9 | Action surface preserves entries; behavior reverts to v1 implementations. |
| Per-host cluster | Hook matcher narrowing + lifecycle signals + Codex fix + OpenCode allowlist + Pi CLI + Gemini cleanup are correctness fixes that **stay enabled** under flag-off (they are not v2-gated). |

Operator-only `fulcrum memory rollback --since=<TIME>` is the granular per-write undo path; it replays WAL backwards. Not exposed via `fulcrum action exec`.

## Open Questions Surface

All planning blockers resolved by the eight pre-resolved decisions in the handover plus the post-review batch fixes (Dreaming → v2b in scope-split; AC re-mappings; sweep timer relocation; PR 4 milestone wording). The following are **non-blocking** items deferred to v2b plan or planning conversation:

- §12.15 RRF vs prior art weighted-sum fusion: v2a keeps RRF; v2b ablation candidate.
- §12.7 Code embedding cost guardrails: v2a uses synchronous embed under rate limit (existing `setup/wizard.ts` flow); cold-start progress UX is v2b polish.
- §12.10 Watcher scope in monorepos: default = one watcher at repo root (matches `FULCRUM_WORKSPACE` convention).
- §12.11 Rename detection: accept the 500ms unlink-then-add heuristic for v2a (originally from chokidar; reimplemented inside `pci/syncer.ts`); periodic git-rename sweep is v2b.

**Resolved by user decision (round 2):** §11.42 (policy rules registry CLI) and §11.43 (`list_activations` MCP tool) are **deferred to v2b PR 12** alongside role-policy work. v2a has no consumer for either surface; cold-install operators can inspect activation state via existing monitor counters (`http://127.0.0.1:4721/content-index`) until v2b lights up the dedicated CLIs. Scope-split.md updated to move both ACs to the deferred-v2b list.

## Cross-plan handoff notes (forward to v2b)

### Handoff procedure (executed by the engineer closing v2a, BEFORE v2b PR 10 starts)

This is not optional. Each step has a skill + tool that verifies completion.

1. **v2a-final review.** Run `compound-engineering:document-review` (mode:headless) on this plan one last time. All P0/P1 review findings on the actual implementation (not just the plan text) must be either resolved or migrated to v2b's risk register with explicit mitigation.
2. **v2a-bake gate evidence.** Capture `mcp__fulcrum__get_workspace_status` output + monitor `/content-index` snapshot at v2a-merge-day + bake-day-7 + bake-day-14. Without these three snapshots, Gate 1 (v2a bake ≥2 weeks) cannot be cleared.
3. **Persist the handoff in memory.** For each numbered item in the list below, run `mcp__fulcrum__write_memory` with `kind='decision'`, `tags=['v2a-v2b-handoff', 'pr-N']`, `scope='workspace'`. v2b agents call `mcp__fulcrum__recall_memory query='v2a v2b handoff <topic>'` at the start of their PR.
4. **Spawn v2b task rows.** `mcp__fulcrum__create_task` for each v2b PR (12 PRs total: PRs 10–21). Set `assigned_to='software_engineer'` (or specialist role); set `done_criteria` to the per-PR acceptance gate row from the v2b plan. Set the appropriate prerequisite gate as a `blockers` note.
5. **Identity decision (Gate 2).** Recorded as ADR under `docs/decisions/`. v2b PR 10 cannot start until the ADR exists. Use `agent-skills:documentation-and-adrs` for the ADR.
6. **249-session sweep (Gate 3).** Engineer running the sweep produces the report; tags Mo for sign-off. 1-week SLA per the Gate 3 escalation clause. `mcp__fulcrum__write_memory` with `kind='decision'`, `tags=['v2b-gate-3']` records the threshold tuning outcome.
7. **Fulcrum-specific eval (Gate 4).** Design checked into `packages/memory/src/eval/fulcrum-recall/` BEFORE PR 14 begins. Use `agent-skills:test-driven-development` — eval is itself a test suite.
8. **Pre-flight check skills before v2b.** Before v2b PR 10 starts: `agent-skills:context-engineering` to load the v2b context bundle; `agent-skills:source-driven-development` + `find-docs Kuzu` to re-verify Kuzu DDL semantics against the version then-pinned in `packages/memory/package.json` (the version may have moved during v2a's bake window).

### Items v2a leaves that v2b must consume:

1. **Kuzu schema additions in PR 7 are forward-compatible**. v2b PR 10 adds ~20 control-plane node tables + cross-type edges (`task`, `agent_run`, `team_instance`, `workflow_run`, `handoff`, `artifact`, `review`, `worktree`, `epic`, `issue`, `prd`, `plan`, `git_*`, `external_ref`, `agent_adapter`, `artifact_contract`, `notification_event`, `policy_event`). No table rebuilds required.
2. **PCI watcher topology** (per-dir non-recursive `fs.watch`) is the basis for v2b's additional indexing paths (external sync writes, git ingestion, A2A card derivation). v2b reuses the same singleton manager.
3. **`min_score` envelope** is consumed by v2b's `code_context` and `project_context` — both should return `{results, reason?}` for shape consistency.
4. **`memories` schema** has `scope='global'` retained in the CHECK; v2b PR 12 enables the role policy + global pointer collection; v2a never returns `'global'` results.
5. **WAL records all v2a writes**. v2b PR 14's Fulcrum-specific recall eval can replay the WAL for regression baselines.
6. **Action surface** (`recall_memory`, `query_memory`, `search_code`) registered in v2a. v2b PR 13 adds `code_context` + `project_context` using the same `runStagedSearch` foundation.
7. **`agent-integration/skills/` canonical tree** is established. v2b PR 17 + PR 18 (Copilot integration, Claude marketplace bundle) layer onto it.
8. **Best-effort rollback** is documented in `docs/guides/memory-rollback.md`. v2b PR 21 removes the `FULCRUM_MEMORY_V2` flag; the doc reframes rollback semantics post-flag.
9. **249-session sweep prerequisite for v2b PR 11** (Dreaming): v2a's WAL + memory_recall_events provide the corpus needed to validate prior art thresholds before v2b enables Dreaming cron.
10. **Identity decision (AGENTS.md vs spec title)**: still a v2b prerequisite. v2a does not resolve this; it ships baseline-correctness work that is consistent with both framings.
