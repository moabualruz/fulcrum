# Fulcrum v1.0 — Execution Guide

> Self-prompt for any session working on Fulcrum. Read this first, every time.

## Context Load (read in order)

1. `.planning/PROJECT.md` — what Fulcrum is, core value, constraints, decisions
2. `.planning/REQUIREMENTS.md` — 213 requirements, 22 categories, traceability
3. `.planning/ROADMAP.md` — 10 phases, dependency order, success criteria per phase
4. `.planning/BRANCHING.md` — phase branches → dev/v1.0 → main
5. `.planning/STATE.md` — current position, what's in progress
6. `.scratch/master-audit/AUDIT-REPORT.md` — Wave 1 baseline (pillar reality matrix)
7. `.scratch/master-audit/WAVE2-CORRECTIONS.md` — Wave 2 corrections (12 agents)

## Canonical Sources

| What | Where | Trust Level |
|------|-------|-------------|
| Vision / spec | `.scratch/agent-os-vision/REQUIREMENTS.md` | Canonical — 16 pillars |
| Symphony spec | `vendor/openai-symphony/SPEC.md` | Canonical — full conformance required |
| Planning reqs | `.planning/REQUIREMENTS.md` | Derived from vision + audit |
| Audit findings | `.scratch/master-audit/` | Ground truth from code inspection |
| HANDOVER.md | root | STALE — do not trust as authority |

## Current Milestone

**v1.0 Complete Product Delivery** — all 16 pillars, no deferrals, no MVP carve-outs.

## Branching

```
main (frozen)
 └─ dev/v1.0 (integration)
     └─ phase/NN-name (per-phase work)
```

No PRs until final `dev/v1.0 → main`. Phase branches reviewed via diff + checks.

## Per-Phase Execution Protocol

### 1. Start Phase

```bash
git checkout dev/v1.0
git checkout -b phase/NN-name
```

Then: `/gsd-plan-phase N` — creates PLAN.md with task breakdown.

### 2. Execute Phase

`/gsd-execute-phase N` — wave-based parallel execution.

**TDD mandatory (TST-10):** Every requirement gets RED→GREEN:
1. Write test targeting correct behavior → must FAIL (RED)
2. Commit: `test(scope): RED — description`
3. Fix source code (not test) → must PASS (GREEN)
4. Commit: `fix(scope): GREEN — description`
5. If test passes immediately → `test(scope): verified — description`

### 3. Verify Phase

`/gsd-verify-work N` — conversational UAT against success criteria from ROADMAP.md.

Check every success criterion YES/NO. If NO → fix before proceeding.

### 4. Review + Simplify

- `ce-simplify-code` or `/simplify` — post-impl cleanup
- `ce-code-review` or `/gsd-code-review` — structured review
- Run project checks: `bun run ci` (or `just test` if justfile has it)

### 5. Merge to dev/v1.0

```bash
git checkout dev/v1.0
git merge phase/NN-name
git branch -d phase/NN-name
```

Update `.planning/STATE.md` and `.planning/ROADMAP.md` progress.

### 6. Next Phase

Repeat from step 1 with N+1.

## Skills to Use Per Phase

| Stage | Skills | Purpose |
|-------|--------|---------|
| Plan | `gsd-plan-phase`, `gsd-discuss-phase` | Task breakdown, context gathering |
| Research | `ce-best-practices-researcher`, `ce-framework-docs-researcher` | External docs, patterns |
| Execute | `gsd-execute-phase`, `tdd` | Implementation with TDD |
| Review | `ce-code-review`, `ce-adversarial-reviewer`, `gsd-code-review` | Find bugs before merge |
| Simplify | `ce-simplify-code`, `ce-code-simplicity-reviewer` | Remove YAGNI, dead code |
| Verify | `gsd-verify-work`, `gsd-audit-uat` | UAT against success criteria |
| Security | `ce-security-sentinel`, `gsd-secure-phase` | Security audit per phase |
| Debug | `ce-debug`, `gsd-debug` | When stuck on a bug |

## Key Decisions (locked)

- **shadcn-svelte**: full adoption per PRD
- **OpenTUI**: rewrite TUI to JSX (ratatui fallback if OpenTUI insufficient)
- **Symphony**: full spec conformance, Fulcrum native tracker as primary
- **Data layer**: MikroORM only — migrate all raw SQL
- **Service layer**: extract from routers → injectable services
- **Events**: single EventDispatcher → events table + EventBus
- **Local-first**: implement local → SaaS last
- **No deferrals**: every pillar to done-criteria

## Phase Order + Dependencies

```
Phase 1: Architecture + Security ──────────────────────┐
Phase 2: Bugs + Foundation ─────────── depends on P1 ──┤
Phase 3: Symphony + Sandcastle ─────── depends on P2 ──┤
Phase 4: Inference + Router/Skills ─── depends on P3 ──┤
Phase 5: Tasks + Metrics ──────────── depends on P2 ──┤ (parallel-capable with P3-4)
Phase 6: Docs + Memory + Search ───── depends on P4 ──┤
Phase 7: Repos + Artifacts + Notifs ── depends on P2,P3 ┤
Phase 8: Surface Delivery ─────────── depends on P5-7 ─┤
Phase 9: Cross-Cutting + Testing ──── depends on P8 ──┤
Phase 10: SaaS Hardening ─────────── depends on P9 ──┘
```

Phases 5-7 can run in parallel after P2 completes (but P6 needs P4 for inference).

## Red Flags — Stop and Ask

- Requirement unclear → ask user before implementing
- Architecture decision not in locked list → propose, don't implement
- Test can't pass due to missing feature → commit RED, mark `blocked-needs-impl`
- Phase success criterion fails → fix before merge, don't skip
- Scope creep → propose first, wait for approval
- Destructive git op → confirm with user

## What "Done" Means

A phase is done when:
1. All requirements for that phase have passing tests (GREEN commits)
2. All success criteria in ROADMAP.md verified YES
3. `bun run ci` passes (or project test command)
4. Phase branch merged to `dev/v1.0`
5. STATE.md + ROADMAP.md progress updated

The milestone is done when:
1. All 10 phases merged to `dev/v1.0`
2. Full CI green on `dev/v1.0`
3. `dev/v1.0` merged to `main`
4. 213/213 requirements checked off

---
*Created: 2026-05-04 after Waves 1+2 audit (12 agents)*
*Update this file when execution protocol changes.*
