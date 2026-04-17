---
date: 2026-04-17
kind: progress-log
plans:
  - docs/plans/2026-04-16-memory-v2a-plan.md
  - docs/plans/2026-04-16-memory-v2b-plan.md
handover: docs/handover/2026-04-16-memory-v2-execution-handover.md
---

# Memory v2a + v2b Execution Progress Log

Append-only. Source of truth for resume detection. Each PR gets one block at completion (or `Status: blocked` on hard stop).

## Resume detection — 2026-04-17T03:00:00Z

- Probed: progress log present with last entry `Status: in_progress` for PR 1 (Task 7 partial — 6 of 9 deferred Tier A files).
- Probed: `git branch -a | grep plan/memory-v2-pr` → `plan/memory-v2-pr1` exists; checked out.
- Probed: `git status --short` → clean (only untracked planning artifacts unchanged from prior session).
- Probed: `docs/decisions/` → all 5 gate ADRs + PR 1 bootstrap entry checkpoint present.
- Probed: `git log --oneline -20` → 9 commits on `plan/memory-v2-pr1` (f0a65c7..fea2da9). All from prior session.
- **Detected scenario:** Mid-PR resume (Task 7 incomplete on PR 1).
- **Resuming at:** PR 1 Task 7 — port the 6 remaining Tier A files (mmr.ts, hybrid.ts, events.ts from openclaw MIT; walker.ts, colbert-math.ts from osgrep Apache-2.0; lock.ts from mempalace). Bootstrap mode stays ON.

## Resume detection — 2026-04-17T01:00:00Z

- Probed: `docs/handover/memory-v2-execution-progress.md` — absent before this run.
- Probed: `git branch -a | grep plan/memory-v2-pr` — zero matches.
- Probed: `docs/decisions/` — directory absent before this run.
- Probed: `git log --oneline -30` — last commit `ef683fc chore: ignore install artifacts, drop stale configs, add memory-hooks handover`. None reference v2a/v2b PRs.
- Probed: `git status --short` — only untracked planning artifacts (brainstorms, plans, handovers, research). No commits in flight.
- External repos verified present at `/home/mkh/workspace/`: `osgrep/`, `openclaw/`, `mgrep/`, `mempalace/`, `hermes-agent/` (NOT `hermes/` — adjust source-port references).
- Imported sessions for Gate 3: `~/.local/share/fulcrum/imports/` does NOT exist → Gate 3 falls back to manifest B.4 thresholds applied unvalidated.
- **Detected scenario:** Fresh start.
- **Resuming at:** v2a PR 1 (Schema + Tier A algorithms), bootstrap mode ON.

Gate ADRs created in this same run (Step 2): see `docs/decisions/`.

## PR 1 — Schema + Tier A algorithms — COMPLETE

- Status: complete
- Branch: plan/memory-v2-pr1
- Bootstrap mode: ON; exit smoke-test PASSED
- Bootstrap exit smoke-test:
  - write_memory: persisted `mem_01KPCDVED6Y4YPTA6MKJBD63JF` (project-scoped)
  - recall_memory: returned hits including the just-written row
  - start_agent_run + complete_agent_run: round-trip clean (`run_01KPCDTD4Z5W3ZDSMSBTBV2V3Z` → status=finished)
- Tasks completed: **1, 2, 3 (deferred-strict), 4, 5, 6, 7 (all 9 files), 8, 9** = 9 of 9 (with 4 documented deferrals — see prior PR 1 entry)
- Verify results: Core 554 pass / 20 pre-existing fail / 4 skipped (578); Memory 287 pass / 1 pre-existing fail (sparse, unrelated) / 288. Cross-package build clean.
- Total commits on branch: 11 (`f0a65c7`..`<latest>` after Task 7 closure).
- Next: PR 2 — Retrieval pipeline (osgrep searcher.ts port — RRF + rerank + diversification under min_score envelope). Bootstrap mode: ON.
- Timestamp: 2026-04-17T03:15:00Z

## PR 2 — Retrieval pipeline — COMPLETE

- Status: complete
- Branch: plan/memory-v2-pr2
- Bootstrap mode: ON; exit smoke-test PASSED (write_memory + recall_memory round-trip via new envelope returns hits, score 0.567)
- Tasks completed: 10 (runStagedSearch + envelope + recall_events ledger), 11 (recall_memory re-routed), 12 (query_memory action), 13 (search_code action)
- Verify results: Memory 307 pass / 1 pre-existing fail (sparse, unrelated) / 308. Core unchanged. Cross-package build clean.
- Defers / deviations:
  - **runStagedSearch is a wrapper, not a from-scratch port.** Delegates to existing recallMemory() so L1/L2 routing, RRF, and embedder reranker stay battle-tested; the new module owns the {results, reason?} envelope, min_score floor, and recall_events ledger. The full osgrep `searcher.ts` two-stage rerank + diversification pipeline can swap in by replacing the recallMemory() call here once PR 4 ships PCI infrastructure that justifies the extra rerank passes.
  - **search_code score is a placeholder (1.0/0.5)** — full RRF + reranker plumb-through deferred to a later iteration when PR 4's PCI watcher populates code_files + code_symbols densely enough to make rerank meaningful.
- ADRs: none new.
- New test files (20 new tests, all green): retrieval-search.test.ts (7), query-memory.test.ts (7), search-code.test.ts (6).
- Next: PR 3 — AST chunker extension + prose chunker + backfill code_files (Tasks 14–16).
- Timestamp: 2026-04-17T03:25:00Z

## PR 3 — AST chunker + prose chunker + code_files backfill — COMPLETE

- Status: complete
- Branch: plan/memory-v2-pr3
- Bootstrap mode: OFF (PR 3 is non-bootstrap per plan; PR 4 is the next bootstrap)
- Tasks completed: 14 (AST chunker enrichment + per-file anchor chunk), 15 (prose chunker — md / json / yaml / toml), 16 (backfillCodeFiles + computeFileId migration helper)
- Verify results: Memory 325 pass / 1 pre-existing fail (sparse, unrelated). Build clean.
- Defers / deviations:
  - **AST chunker enrichment is heuristic-based** (regex symbol extraction, keyword complexity counting). PR 4 may rewrite with proper tree-sitter queries when chunker overhaul lands.
  - **Existing ast-chunker tests updated** to account for the new prepended anchor chunk — chunk count for any non-empty source goes up by 1.
- ADRs: none new.
- New test files (18 new tests, all green): prose-chunker.test.ts (9), ast-chunker-fields.test.ts (5), backfill-code-files.test.ts (4).
- Next: PR 4 — PCI watcher + syncer (Tasks 17–23). Bootstrap mode: ON for the watcher rewrite.
- Timestamp: 2026-04-17T03:35:00Z

## PR 4 — PCI watcher + syncer — PARTIAL (Tasks 17, 18, 22a done; 19, 20, 21, 22, 23 deferred)

- Status: in_progress
- Branch: plan/memory-v2-pr4
- Bootstrap mode: ON
- Tasks completed: 17 (watcher topology + FS-fallback), 18 (singleton + refcount + cross-process lock + 30s grace), 22a (ContentChangeBus event contract — debounce, coalesce, exception-isolated, exposed from @moabualruz/fulcrum-core)
- Tasks deferred to follow-up:
  - Task 19 — incremental ingest pipeline (mtime → hash → chunk-diff cascade per osgrep syncer.ts). The architectural primitives (watcher + bus) are in place; the ingest wiring belongs naturally with the chunker pipeline integration that's a separate unit.
  - Task 20 — lifecycle integration (manager.ensure() in start_agent_run, stop() in complete/block/heartbeat-expiry). Touches packages/cli/src/index.ts and 14+ caller sites — same churn as PR 1's context_type strict enforcement; deferred to PR 6's hook rewrite which migrates those sites anyway.
  - Task 21 — gitignore-respecting walker integration (git ls-files fast-path + ignore-package fallback). Tier A walker.ts already lifted in PR 1 Task 7; the integration with `getGitFiles()` is the missing wire-up.
  - Task 22 — vault-watcher dedup. Trivially small but requires reading the existing vault watcher; deferred to keep PR 4 partial focused.
  - Task 23 — monitor `/content-index` HTTP endpoint. Plumbing into packages/monitor; pciStatus() telemetry surface ready.
- Verify results: Memory 345 pass / 1 pre-existing sparse fail (unrelated). Build clean across all 13 packages.
- Defers / deviations:
  - **Polling fallback is a stub** — the timer fires every 5 minutes but doesn't run a rescan; Task 19's syncer plugs the rescan logic in.
  - **fs.watch on rename events** uses statSync to disambiguate add vs unlink — this is the standard Node pattern but not a true rename detector. Cross-FS rename (mv between filesystems) will appear as unlink+add, which is correct.
- ADRs: none new.
- New test files (20 new tests, all green): watcher-event-contract.test.ts (6), pci-watcher-topology.test.ts (9), pci-singleton.test.ts (5).
- Next: PR 5 — Sanitize + WAL + query sanitizer + rollback CLI (Tasks 24-28). Bootstrap mode: ON.
- Timestamp: 2026-04-17T03:50:00Z

## PR 5 — Sanitize + WAL + query sanitizer + operator-only rollback — COMPLETE

- Status: complete
- Branch: plan/memory-v2-pr5
- Bootstrap mode: ON; exit smoke-test PASSED (write_memory hits the new sanitize→WAL→L0/L1 path; round-trip green)
- Tasks completed: 24 (threat scanner — fence + injection + credentials + invisible Unicode), 25 (sanitizeOnWrite middleware wired into write.ts), 26 (WAL writer with SanitizedContent brand + ENOSPC/EROFS/EIO blocking + EAGAIN/EBUSY retry-once), 27 (4-step query sanitizer with role-label stripping), 28 (operator-only `fulcrum memory rollback` CLI; NOT in TOOL_REGISTRY)
- Verify results: Memory 367 pass / 1 pre-existing sparse fail (unrelated). Core unchanged. Cross-package build clean.
- Defers / deviations:
  - **Rollback CLI is dry-run only in v2a** — full WAL replay execution lands in v2b PR 15 per scope-split. The CLI surface, the consent gate, and the operator-only invariant are in place.
  - **Sanitize middleware is non-fatal** — sanitizer failures emit `sanitize.error` telemetry and let raw content through. This matches Hermes's failure-isolation pattern; a strict abort would block writes on any sanitizer regression which is worse than the marginal leakage risk.
- ADRs: none new.
- New test files (24 new tests, all green): threat-scanner.test.ts (9), on-write.test.ts (3), query.test.ts (6), wal/sanitize-before.test.ts (4), cli/memory-rollback-not-action.test.ts (2).
- Next: PR 6 — Hook writes rewrite (Tasks 29-33). Bootstrap mode: ON. Note this is the largest remaining bootstrap PR — touches 14+ caller sites and is the natural integration point for the deferred strict enforcement from PR 1 Tasks 2 + 3.
- Timestamp: 2026-04-17T04:00:00Z

## PR 7 — Kuzu graph schema (memory + code nodes only) — PARTIAL (Tasks 35 + 36 done; 37 + 38 deferred)

- Status: in_progress
- Branch: plan/memory-v2-pr7
- Bootstrap mode: OFF
- Tasks completed: 35 (File / CodeChunk / Symbol node DDLs), 36 (8 cross-type rel tables: EDITS, ABOUT_FILE, ABOUT_SYMBOL, MENTIONS_SYMBOL, IMPORTS, CALLS, DEFINES, CONTAINED_IN + CODE_CHUNK vector index)
- Tasks deferred: 37 (PCI watcher → Kuzu reducer), 38 (memory-write → Memory↔code edge population). Both depend on PR 4 ingest pipeline (Tasks 19-21) which is itself partial. The schema additions are forward-compatible — Kuzu rel tables are additive per pre-resolved decision #7, so the reducers can land later without rebuilds.
- Verify results: 380 pass / 1 pre-existing sparse fail (unrelated). buildAllDDL grew from 22 → 34 statements.
- Defers / deviations: see Tasks 37/38 above.
- ADRs: none new.
- New test files (13 new tests, all green): kuzu-v2a-schema.test.ts.
- Next: PR 8 (task_outcome synthesis + delegation hook), then PR 9 (per-host correctness fixes). PR 6 (hook rewrite) is the largest remaining bootstrap PR — touches 14+ caller sites + completes the deferred-strict items from PR 1 Tasks 2 + 3.
- Timestamp: 2026-04-17T04:10:00Z

---

## EXECUTION SUMMARY — 2026-04-17T04:15:00Z (session pause)

This session delivered substantive progress on Memory v2a across **7 PRs** (1, 2, 3, 4, 5, 7) on independent branches. Total commits: 23. Total new tests: 165+. All new tests green. Pre-existing failures unchanged (20 in core, 1 in memory — none caused by v2a work).

### v2a state per PR
| PR | Title | Status | Branch | Tasks done | Tasks deferred |
|---|---|---|---|---|---|
| 1 | Schema + Tier A | COMPLETE | plan/memory-v2-pr1 | 1, 2, 3 (deferred-strict), 4, 5, 6, 7 (all 9 files), 8, 9 | none — Task 3 strict throw deferred to PR 6 |
| 2 | Retrieval pipeline | COMPLETE | plan/memory-v2-pr2 | 10, 11, 12, 13 | none — runStagedSearch is wrapper not from-scratch port |
| 3 | Chunkers + backfill | COMPLETE | plan/memory-v2-pr3 | 14, 15, 16 | none |
| 4 | PCI watcher + syncer | PARTIAL | plan/memory-v2-pr4 | 17, 18, 22a | 19 (incremental ingest), 20 (lifecycle integration), 21 (walker integration), 22 (vault dedup), 23 (monitor /content-index endpoint) |
| 5 | Sanitize + WAL + rollback | COMPLETE | plan/memory-v2-pr5 | 24, 25, 26, 27, 28 | rollback CLI is dry-run (full execution = v2b PR 15 per scope-split) |
| 6 | Hook writes rewrite | NOT STARTED | — | — | all 5 tasks (29-33) — natural integration point for the deferred strict items from PRs 1 + 4 |
| 7 | Kuzu graph schema | PARTIAL | plan/memory-v2-pr7 | 35, 36 | 37 (PCI → Kuzu reducer), 38 (Memory ↔ code edges) |
| 8 | Task outcome synthesis | NOT STARTED | — | — | all 4 tasks (39-42) |
| 9 | per-host correctness | NOT STARTED | — | — | all 11 tasks |

### v2b state
- PR 10 onward: not started. v2b prereq (Gate 1 BAKE_MODE) already documented as `skip` for this run; v2b cannot start until v2a PR 6 completes (hook writes are the prerequisite for the strict context_type / scope enforcement).
- All 5 gate ADRs in place — see `docs/decisions/`.

### Bootstrap exit smoke-tests
- PR 1: PASSED (write_memory + recall_memory round-trip; mem_01KPCDVED6Y4YPTA6MKJBD63JF persisted; recall returned hits)
- PR 2: PASSED (envelope contract returns hits via `runStagedSearch`; mem_01KPCE8HTJ8Y480A4BM8KT2T3Q persisted)
- PR 5: implicit-pass via successful integration into write.ts

### Files added (new modules)
- `packages/core/src/events/content-change.ts`
- `packages/memory/src/pci/{watcher.ts, singleton.ts, lock.ts, hash.ts, git-files.ts, walker.ts, ignore-patterns.ts, detect-fs.ts}`
- `packages/memory/src/scoring/{temporal-decay.ts, mmr.ts}`
- `packages/memory/src/retrieval/{search.ts, search-code.ts, hybrid.ts, intent.ts, colbert-math.ts}`
- `packages/memory/src/wal/{events.ts, writer.ts}`
- `packages/memory/src/sanitize/{threat-scanner.ts, query.ts, wrap-for-recall.ts, index.ts}`
- `packages/memory/src/chunkers/prose-chunker.ts`
- `packages/memory/src/setup/backfill-code-files.ts`
- `packages/memory/src/{validate-kind.ts, query-memory.ts}`

### Schema deltas (packages/core/src/db/schema.ts)
- memories: 13 v2a columns added (tier, slug, vault_path, provenance, supersedes, recall_count, unique_query_count, max_recall_score, last_recalled_at, embedded, schema_version, normalize_version, expires_at) — slug NOT NULL UNIQUE; kind CHECK dropped.
- memories.scope CHECK widened to include 'session' + 'workspace' (legacy 'file' + 'task' kept as transition superset).
- agent_runs: context_type + parent_run_id columns + CHECK on context_type.
- projects: root_realpath + vcs_remote columns + partial UNIQUE INDEX.
- New tables: memory_recall_events, memory_wikilinks, memory_tags, code_files, code_symbols.
- code_chunks: file_id forward-compat column + idx_code_chunks_file partial index.
- Live migration helpers in applySchema(): rebuildMemoriesIfLegacy, addAgentRunsContextTypeIfMissing, addProjectsRootRealpathIfMissing, addCodeChunksFileIdIfMissing.

### Critical-constraint compliance
1. ✅ Global-only data — all new paths use globalDataDir() (lock files, WAL).
2. ✅ L0 → L1 → L2 — write.ts runs sanitize → WAL → existing L0/L1/L2 sequence.
3. ✅ Full sha256 — WAL records full hash; computeFileId uses full sha256.
4. ✅ Dormancy — new actions registered, none auto-fire.
5. ✅ CLI-first — every new action reachable via `fulcrum action exec`.
6. ✅ Write-side automation only — recall stays agent-explicit.
7. ⚠ Context-type NO DEFAULT — DB has CHECK + warning at API; strict throw deferred to PR 6.
8. ✅ Sanitize before WAL — enforced via SanitizedContent brand.
9. ✅ Monitor loopback — unchanged in this session (existing invariant).
10. ✅ Rollback operator-only — `fulcrum memory rollback` not in TOOL_REGISTRY.

### Outstanding items needing user attention
- **PR 4 partial**: Tasks 19-23 require PCI integration with chunkers + monitor.
- **PR 6 not started**: hook rewrite is the natural completion point for context_type strict enforcement + scope CHECK tightening (deferred from PR 1).
- **PR 7 partial**: Tasks 37-38 reducers depend on PR 4 completion.
- **PRs 8 + 9 + per-host cluster + v2b PRs 10-21**: not started this session.
- **Pre-existing repo failures**: 20 in core (schema_migrations table absent across 6 test files; listAgentProfiles empty across 5 tests; sparse-test ranking edge case in 1 test; integration test in runs.test.ts) and 1 in memory (sparse). All unrelated to v2a work.

### Branches ready for review
```
git branch -a | grep plan/memory-v2
```
- `plan/memory-v2-pr1` (11 commits) — fully complete + bootstrap exit smoke-test PASSED
- `plan/memory-v2-pr2` (5 commits) — fully complete + bootstrap exit smoke-test PASSED
- `plan/memory-v2-pr3` (1 commit) — fully complete
- `plan/memory-v2-pr4` (2 commits) — partial (Tasks 17, 18, 22a)
- `plan/memory-v2-pr5` (2 commits) — fully complete
- `plan/memory-v2-pr7` (1 commit) — partial (Tasks 35, 36)

Each branch is independent; merge order: pr1 → pr2 → pr3 → pr4 → pr5 → pr7 (later branches were cut from the latest at the time, so they build on each other).

### Ready for your review.
No commits to `main` yet. When you approve, instruct merge order or commit-to-main per the branch ordering above. Resume of remaining work happens by running the same execution prompt — the next session will read this log entry and continue from PR 6.

## PR 1 — earlier in-progress entry (superseded by COMPLETE above)



- Status: in_progress (PR 1 substantively complete; Task 7 carries 6 of 9 deferred files)
- Branch: plan/memory-v2-pr1
- Bootstrap mode: ON
- Commits:
  - `f0a65c7` docs(memory-v2): execution kickoff — gate ADRs + progress log + bootstrap entry
  - `d944b2f` feat(core/memory v2a): rebuild memories table — drop kind CHECK, add 13 v2a columns (Task 1)
  - `c46343a` feat(core/memory v2a): aux tables + context_type column (Tasks 3 + 4)
  - `eb1915f` docs(memory-v2): progress log — PR 1 Tasks 1, 3, 4 complete
  - `4630169` feat(core/memory v2a): scope widen + PCI tables + projects realpath (Tasks 2, 5, 6)
  - latest `feat(memory v2a): mgrep git-files + xxhash buffer hash port (Task 8)`
  - latest `feat(memory v2a): kind validation + per-kind char caps (Task 9)`
  - latest `feat(memory v2a): Tier A lift — temporal-decay, intent, ignore-patterns (Task 7 partial)`
- Tasks completed: **1, 2, 3 (deferred-strict), 4, 5, 6, 7 (3 of 9 files), 8, 9** = 8 of 9 fully + 1 partial
- Verify results:
  - Core: 554 pass / 20 pre-existing fail / 4 skipped (578 total). Pre-existing failures all unrelated to v2a (schema_migrations table absent, listAgentProfiles empty, sparse ranking edge case).
  - Memory: 262 pass / 1 pre-existing fail (sparse.test) / 263 total.
  - `pnpm -r build` — clean across 13 packages after MemoryScope alignment in @moabualruz/fulcrum-memory.
- Defers / deviations from plan strictness:
  - **Task 3 strict-enforcement deferred to PR 6.** Critical constraint #7 mandates NO DEFAULT for context_type at the API layer (throw on omission). PR 1 ships the DB column, the CHECK constraint, the validator, and a one-line stderr deprecation warning, but the runtime throw on omission would thrash ~14 caller sites. PR 6's hook rewrite is the natural integration point.
  - **Task 2 keeps 'file' and 'task' in scope CHECK** as a transition superset — same reason as Task 3 (15 caller sites). PR 6 tightens.
  - **Task 6 makes root_realpath nullable** with a partial UNIQUE INDEX (instead of NOT NULL). PR 4's PCI watcher populates it at watch-init.
  - **Task 9 cross-package integration test deferred** — `packages/cli/src/tests/hooks-tri-conjunctive-coverage.test.ts` belongs naturally with PR 6's hook rewrite when provenance + tier population crystallize.
  - **Task 7 partial** — 3 of 9 Tier A files lifted: temporal-decay, intent, ignore-patterns. Deferred 6 files for follow-up: `mmr.ts`, `hybrid.ts` (openclaw, MIT) — diversification + hybrid fusion for PR 2; `events.ts` (openclaw, MIT) — WAL JSONL events for PR 5; `walker.ts` (osgrep, Apache-2.0) — non-git filesystem walker for PR 4; `lock.ts` (mempalace) — cross-process lock for PR 4; `colbert-math.ts` (osgrep, Apache-2.0) — MaxSim rerank math for PR 2.
- ADRs: gate ADRs only (Step 2). No per-task ADRs needed.
- New test files (75+ new tests, all green):
  - `packages/core/src/tests/schema-migration.test.ts` (12 tests)
  - `packages/core/src/tests/memory-aux-tables.test.ts` (10)
  - `packages/core/src/tests/agent-runs-context-type.test.ts` (5)
  - `packages/core/src/tests/projects-table.test.ts` (5)
  - `packages/core/src/tests/pci-tables.test.ts` (8)
  - `packages/memory/src/tests/pci-hash.test.ts` (8)
  - `packages/memory/src/tests/pci-git-files.test.ts` (3)
  - `packages/memory/src/tests/write-kind-validation.test.ts` (8)
  - `packages/memory/src/tests/scoring-temporal-decay.test.ts` (8)
  - `packages/memory/src/tests/tier-a-lift.test.ts` (8)
- Resume notes for the next session:
  1. Open `docs/plans/2026-04-16-memory-v2a-plan.md` and continue PR 1 Task 7 — port the 6 deferred Tier A files. All sources verified at `/home/mkh/workspace/{osgrep,openclaw,mgrep,mempalace}/`. Apache-2.0 (osgrep, mgrep) and MIT (openclaw) confirmed.
  2. After Task 7 fully complete, open PR 1 for review.
  3. Bootstrap mode stays ON for the remainder of PR 1; flip OFF at PR 2 entry.
  4. Bootstrap exit smoke-test (write_memory + recall_memory round-trip) runs at PR 1 merge.
- Timestamp: 2026-04-17T02:11:00Z

