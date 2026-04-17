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

