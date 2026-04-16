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

## PR 1 — Schema + Tier A algorithms — IN PROGRESS

- Status: in_progress
- Branch: plan/memory-v2-pr1
- Bootstrap mode: ON
- Commits so far:
  - `f0a65c7` docs(memory-v2): execution kickoff — gate ADRs + progress log + bootstrap entry
  - `d944b2f` feat(core/memory v2a): rebuild memories table — drop kind CHECK, add 13 v2a columns (Task 1)
  - `c46343a` feat(core/memory v2a): aux tables + context_type column (Tasks 3 + 4)
- Tasks completed in this session: **Task 1, Task 3 (deferred-strict), Task 4** (3 of 9)
- Tasks remaining: Task 2 (scope CHECK widen — 'session'/'workspace' add, 'file'/'task' migrate to 'project'), Task 5 (code_files/code_chunks/code_symbols/code_chunks_fts — note existing code_chunks has different shape), Task 6 (projects.root_realpath UNIQUE), Task 7 (Tier A lift from osgrep/openclaw/mgrep — 9 files), Task 8 (mgrep git-files + xxhash-wasm port), Task 9 (kind validator in memory/write.ts + tri-conjunctive integration test).
- Verify results so far:
  - `pnpm --filter @moabualruz/fulcrum-core test` — Task 1 (9 tests pass), Task 3 (5 tests pass), Task 4 (10 tests pass), all green.
  - Full core suite: 538 pass / 20 pre-existing fail / 4 skipped (562 total). Pre-existing failures unrelated to v2a (schema_migrations table missing, listAgentProfiles empty, sparse.test ranking edge case).
  - `pnpm -r build` — clean across 13 packages.
- Defers / deviations:
  - **Task 3 strict-enforcement deferred to PR 6.** Critical constraint #7 mandates NO DEFAULT at the API layer (throw on omission). PR 1 ships the DB column, the CHECK constraint, the validator, and a one-line stderr deprecation warning, but the runtime throw on omission would thrash ~14 caller sites (production CLI, worker, monitor + 7 test files). PR 6's hook rewrite is the natural integration point that updates those sites; the warning telegraphs the trajectory. DB-level enforcement still binds for direct INSERT sites.
- ADRs created in this PR: gate ADRs only — see Step 2; no per-task ADRs needed yet.
- Next: Task 6 (projects table root_realpath UNIQUE) if budget permits, else Task 2 in next session.
- Resume notes for the next session:
  1. Read this entry first, then `docs/plans/2026-04-16-memory-v2a-plan.md` PR 1 §"Phase 1" Tasks 2, 5, 6, 7, 8, 9 in order.
  2. Tier A lift (Task 7) requires confirming MIT/Apache-2.0/BSD licenses on osgrep, openclaw, mgrep before copying. Repos at `/home/mkh/workspace/{osgrep,openclaw,mgrep}/`.
  3. xxhash-wasm (Task 8) needs adding to `packages/memory/package.json` deps; current shape has `chokidar`, `gray-matter`, `simple-git`, `web-tree-sitter`.
  4. Bootstrap mode stays ON for the rest of PR 1. Use built-in TaskCreate (NOT mcp__fulcrum__*) for lifecycle tracking.
- Timestamp: 2026-04-17T01:20:00Z

