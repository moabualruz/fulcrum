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

