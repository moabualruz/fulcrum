---
date: 2026-04-16
kind: handover
purpose: Memory v2a + v2b execution kickoff (post-planning)
preceded_by: docs/handover/2026-04-16-memory-v2-split-handover.md
plans:
  - docs/plans/2026-04-16-memory-v2a-plan.md
  - docs/plans/2026-04-16-memory-v2b-plan.md
reviews:
  - docs/plans/2026-04-16-memory-v2-cross-plan-review.md
  - docs/plans/2026-04-16-memory-v2a-plan-review.md
  - docs/plans/2026-04-16-memory-v2b-plan-review.md
pickup_prompt: docs/handover/2026-04-16-memory-v2-execution-pickup-prompt.md
progress_log: docs/handover/memory-v2-execution-progress.md
---

# Handover — Fulcrum Memory v2 Execution Kickoff

## Where we are

Planning is complete. Both plans + cross-plan review + per-plan headless reviews are on disk and amber-clean. All P0 findings addressed; ~7 P1 findings either resolved or flagged in plan Open Questions sections. All blocker decisions resolved with documented defaults. Bootstrap mode is documented for the 5 PRs that rewrite their own dogfooding tools (v2a PRs 1, 2, 5, 6 + v2b PR 21).

Nothing has been committed. Per user feedback (`~/.claude/projects/-home-mkh-workspace-pi-stack-plan/memory/feedback_no_premature_commit.md`), planning artifacts stay uncommitted until the user explicitly says "commit". The execution prompt does NOT auto-commit either — it commits per-PR but only on a working branch (`plan/memory-v2-prN`), never to `main`.

## Plan summary (1573 lines total across both plans)

| Plan | File | Lines | Tasks | PRs | Effort | Bootstrap PRs |
|---|---|---|---|---|---|---|
| v2a baseline | `docs/plans/2026-04-16-memory-v2a-plan.md` | 732 | 53 | 9 + per-host cluster | ~3 weeks (1 eng) / 1.5 weeks (2 eng) | PRs 1, 2, 5, 6 |
| v2b knowledge graph | `docs/plans/2026-04-16-memory-v2b-plan.md` | 680 | 50 | 12 (PRs 10–21) | ~6–8 weeks after ≥2-week v2a bake | PR 21 |

Source-of-truth: `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` (235 lines) — authoritative v2a/v2b boundary.

## Pre-resolved decisions (all 8 from prior session + 5 from review-fix rounds)

From original 8 blockers (`docs/handover/2026-04-16-memory-v2-split-handover.md` §"Outstanding architectural decisions"):

1. PCI watcher = per-dir non-recursive `fs.watch` (prior-art style) — not chokidar
2. `memories.kind` CHECK widening = drop CHECK + validate in `packages/memory/src/write.ts`
3. `slug NOT NULL UNIQUE` migration = forced 12-step rebuild (rollback best-effort)
4. Hybrid fusion = keep RRF (k=60) at `packages/memory/src/scoring.ts`
5. `min_score` envelope = `{results, reason?}` with `'no_match'` / `'below_floor'`
6. Gitignore = `git ls-files` fast-path inside git repos + `ignore` npm fallback
7. Kuzu DDL v2a = File + CodeChunk + Symbol nodes + edits/about/mentions/imports/calls/defines/contained_in rels (NOT 51-table unification)
8. Session-scope storage = persisted in central SQLite with `expires_at` + sweep job hosted in MCP server lifecycle

From review-fix round 1:
- Dreaming light/REM/deep moved entirely to v2b PR 11 (resolves cross-plan P0-1 source-of-truth contradiction)
- §11.32 (WAL replay), §11.50 (prose docs + graph edges) un-claimed from v2a tasks
- §11.42 (policy registry), §11.43 (`list_activations`) deferred to v2b PR 12
- §11.69 (Pi npm publish) deferred to v2b
- Sweep timer relocated from PCI singleton to MCP server lifecycle (singleton tears down 30s after refcount=0)

From review-fix round 2:
- `scope='global'` v2a behavior = soft route (accept, filter at recall, log warning)
- WAL errno taxonomy = ENOSPC/EROFS/EIO block, transient errors retry-once
- Stop-hook race = partial UNIQUE index `(run_id, kind IN (...))` (fail-closed via SQLITE_CONSTRAINT)
- Bash = allowlist of mutating verbs (NOT denylist of read-only)
- FS-watch fallback = `statfs` detection + 5min polling on NFS/CIFS/FUSE/Overlay/junctions
- §11.11 Obsidian/Dataview smoke added to v2a Task 29
- Watcher event-emission contract added as v2a Task 22a

## Outstanding gates (5 — defaults documented; pickup prompt applies them)

| Gate | Blocks | Default per pickup prompt | User override path |
|---|---|---|---|
| Gate 1 — v2a bake ≥2 weeks | All v2b PRs | **Skip in dev mode** (default); document deferral in progress log; user can change to `BAKE_MODE=wait` for production runs | Edit pickup prompt's `BAKE_MODE` flag before paste |
| Gate 2 — Identity decision (memory-first vs control-plane-first) | v2b PR 10 | **title-wins-authority** (current plan ordering); ADR auto-written to `docs/decisions/2026-04-16-identity-decision.md` | Pre-write a different ADR before resume; pickup prompt detects the existing ADR and uses its decision |
| Gate 3 — 249-session offline Dreaming sweep | v2b PR 11 | Auto-run sweep on imported sessions; document threshold tuning recommendations; do NOT block (manifest B.4 thresholds noted as initial defaults; user can re-tune post-implementation) | Pre-write `docs/decisions/2026-04-16-dreaming-thresholds.md` with chosen values |
| Gate 4 — Fulcrum-specific recall eval design | v2b PR 14 | Auto-design eval per spec; check into `packages/memory/src/eval/fulcrum-recall/` | N/A — eval design is mechanical from spec |
| Gate 5 — Copilot user request | v2b PR 18 | **SKIP PR 18 entirely** (no user request captured); document deferral in progress log | Pre-write `docs/decisions/2026-04-16-copilot-request.md` capturing a real user request to unlock PR 18 |

## Bootstrap mode (must-know)

Five PRs touch the very `mcp__fulcrum__*` machinery the Standard Task Workflow depends on. During those PRs, the engineer (and pickup prompt) drops `mcp__fulcrum__*` lifecycle calls and uses external substitutes only. Skills and built-in tools stay on.

| PR | Why | Substitute |
|---|---|---|
| v2a PR 1 | `memories` 12-step rebuild + `agent_runs.context_type` migration | git, `Bash`, `Read`/`Edit`/`Write`/`Grep`, Claude Code skills, built-in `TaskCreate`/`TaskUpdate`, `docs/decisions/` markdown for what `write_memory` would record |
| v2a PR 2 | `recall_memory` envelope shape changes mid-PR | Same |
| v2a PR 5 | Sanitize-before-WAL invariant install | Same |
| v2a PR 6 | `runPostHook` rewrite | Same |
| v2b PR 21 | `FULCRUM_MEMORY_V2` flag removal | Same |

Entry checkpoints (BEFORE bootstrap PR opens) and exit smoke-tests (AFTER merge) are detailed in plan §"Bootstrap Mode" sections of both plans.

## Strict execution rules (carried from original handover + new ones)

1. **DO NOT commit planning artifacts** — wait for explicit user "commit" instruction. Per-PR commits to `plan/memory-v2-prN` working branches are fine; never push to `main`.
2. **DO NOT re-open scope.** v2a/v2b boundary is set in `00-scope-split.md`. New scope surfaced only as a blocker note in progress log, never absorbed.
3. **DO NOT use `mcp__fulcrum__*` during bootstrap PRs.** Use the external substitutes table.
4. **DO NOT skip `Verify:` commands.** Each task's `Verify:` line must run on a clean checkout and pass before the task is marked complete.
5. **DO follow the Standard Task Workflow** (9 steps) for non-bootstrap tasks; the bootstrap-mode workflow (8 steps minus `mcp__fulcrum__*` calls) for bootstrap tasks.
6. **DO write to the progress log** after every PR completion. The progress log is the resume mechanism.
7. **DO honor the 10 critical constraints** (global-only data, L0→L1→L2 order, full sha256, dormancy, CLI-first, write-side automation, context_type no-default, sanitize-before-WAL, monitor loopback, rollback operator-only).
8. **DO use the right skills/tools per PR** as documented in plan §"Skill + MCP tool index" and §"Per-PR Quality Gates".

## Pickup prompt (paste into a new session to start or resume)

`docs/handover/2026-04-16-memory-v2-execution-pickup-prompt.md`

The pickup prompt is a single-shot autonomous executor. It:
- Detects resume state from `git log` + `docs/decisions/` + `docs/handover/memory-v2-execution-progress.md`
- Resumes from the first uncompleted PR (not the last completed one)
- Executes every PR end-to-end without intermediate stops
- Self-verifies each step (build, test, security review, browser test where applicable)
- Defers gate decisions to documented defaults; user pre-empts by writing an ADR before resume
- Writes a final report only after BOTH plans complete (v2a PRs 1–9 + per-host cluster + v2b PRs 10–21, minus skipped PRs documented in progress log)

## Resume mechanism (the progress log)

`docs/handover/memory-v2-execution-progress.md` is an append-only log. The pickup prompt writes one entry per PR completion:

```
## PR <N> — <title>
- Status: complete | in_progress | blocked
- Branch: plan/memory-v2-prN
- Commits: <first sha>..<last sha>
- Verify results: PASS / FAIL details
- Bootstrap mode: ON | OFF
- Tasks completed: <list>
- Defers / deviations: <if any>
- Next: PR <N+1> — <title>
- Timestamp: <ISO>
```

A new session reads this log, finds the last `Status: complete` entry, and resumes from `Next:`. If the last entry is `in_progress` or `blocked`, the session investigates that PR's branch state via `git log` + `git status` + the task's `Verify:` commands before resuming or escalating.

## After execution completes

Pickup prompt's final report includes:
- All PRs landed (v2a + v2b) with branch + commit-range citations
- Any deferred PRs (Gate 5 Copilot expected) with reason
- Any plan deviations + rationale
- ADRs created (Gates 2, 3, 4 ADRs at minimum)
- All `Verify:` results table
- Workspace status snapshot
- Outstanding items needing user attention

User then reviews and either:
- Approves the work and instructs commit/merge to main
- Identifies regressions and instructs rework (which becomes a new pickup-prompt cycle)
- Raises new requirements (which becomes a new planning cycle)

## File reference

| Artifact | Path |
|---|---|
| This handover | `docs/handover/2026-04-16-memory-v2-execution-handover.md` |
| Pickup prompt | `docs/handover/2026-04-16-memory-v2-execution-pickup-prompt.md` |
| Progress log (created on first PR completion) | `docs/handover/memory-v2-execution-progress.md` |
| v2a plan | `docs/plans/2026-04-16-memory-v2a-plan.md` |
| v2b plan | `docs/plans/2026-04-16-memory-v2b-plan.md` |
| Cross-plan review | `docs/plans/2026-04-16-memory-v2-cross-plan-review.md` |
| v2a headless review | `docs/plans/2026-04-16-memory-v2a-plan-review.md` |
| v2b headless review | `docs/plans/2026-04-16-memory-v2b-plan-review.md` |
| Scope-split (source of truth) | `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` |
| Section-numbering reference | `docs/brainstorms/2026-04-16-memory-architecture-v2/index.md` |
| Copy-file manifest | `docs/brainstorms/2026-04-16-memory-v2-source-inventory.md` |
| ADR directory (gates land here) | `docs/decisions/` (created by pickup prompt if absent) |

## Prior handovers (history)

- `docs/handover/2026-04-16-memory-v2-split-handover.md` — pre-planning handover (post-document-review v2a/v2b split).
- `docs/handover/2026-04-16-memory-v2-pickup-prompt.md` — original pickup prompt (planning phase only — superseded by this handover's pickup prompt for execution).
- `docs/handover/memory-automation-via-hooks.md` — original v1 handover that seeded this entire arc.
