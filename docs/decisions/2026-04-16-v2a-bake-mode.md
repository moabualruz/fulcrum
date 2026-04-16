---
date: 2026-04-16
kind: adr
status: accepted
gate: 1
plan: docs/plans/2026-04-16-memory-v2a-plan.md
follow-up: docs/plans/2026-04-16-memory-v2b-plan.md
---

# ADR — Gate 1: v2a Bake Mode

## Context

v2b plan §"Open questions" #2 makes v2a → v2b transition contingent on a ≥2-week real-time soak between v2a merge and v2b PR 10 (`BAKE_MODE=wait`). The execution-handover pickup prompt offers a `BAKE_MODE=skip` for dev-mode runs that proceed straight from v2a to v2b without the soak.

The autonomous executor must pick one before reaching v2b PR 10.

## Decision

**`BAKE_MODE=skip`** for this autonomous execution run.

Rationale:
- The user explicitly invoked an end-to-end run of both plans in one continuous sweep.
- No production deployment is being made from these branches; every PR lands on `plan/memory-v2-prN` for user review before any merge to `main`.
- Bake-time is a calendar-clock prerequisite, not a code prerequisite — a single-session executor cannot satisfy "2 weeks of real usage" by waiting in-process.

## Consequences

- v2b PR 10 begins immediately after v2a PR 9 + per-host cluster lands on its working branch.
- Dreaming threshold tuning (Gate 3) operates on default values from manifest B.4 without empirical validation from the bake period.
- The user reviewing the final report should explicitly assess whether to switch to `BAKE_MODE=wait` before merging any v2b PR to `main` for production rollout.

## Override path

Production deployment requires `BAKE_MODE=wait`. Operator process:
1. Merge v2a PRs to `main` first.
2. Run dogfood + telemetry collection for ≥2 weeks.
3. Re-tune Dreaming thresholds (Gate 3) from real promotion-rate data.
4. Then proceed with v2b PR 10 onward.

To enforce: pre-write a replacement of this ADR before resuming the execution. The executor reads existing ADRs and honors the documented decision verbatim.
