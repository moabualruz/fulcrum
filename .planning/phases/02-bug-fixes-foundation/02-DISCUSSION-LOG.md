# Phase 2: Bug Fixes + Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 2-Bug Fixes + Foundation
**Areas discussed:** Bug Triage Order, TDD Evidence, Foundation Scope Shape, CI/Web Gate Policy, Compiled Binary Strategy, Permission Enforcement

---

## Bug Triage Order

**User's choices:**
- Dependency-first ordering.
- Blockers include build/test blockers, downstream phase blockers, and user-visible shipped-surface blockers.
- Group into dependency clusters.
- Defer BUG-17 repo hygiene outside Phase 2 product/runtime execution.

## TDD Evidence

**User's choices:**
- Strict RED to GREEN per bug.
- Shared foundation infrastructure gets both unit and integration tests where meaningful.
- Failing RED tests should be committed separately before fixes.
- For compiled/toolchain bugs, use all credible evidence in descending strength: automated failing test, repro script plus captured output, manual repro only as support.

## Foundation Scope Shape

**User's choices:**
- Split by infra lanes and order by downstream dependency.
- Lane order: migrations/indexes, feature flags, permissions, worker registry.
- Tenant settings is a standalone small plan.
- Full FND-05 belongs in Phase 2.

## CI/Web Gate Policy

**User's choices:**
- `bun run ci` runs all required gates; each target keeps its own focused recipe.
- General CI runs full stable web suite except full opt-in e2e; focused recipes may run smaller gate sets.
- Default CI gets smoke e2e; full browser suite gets separate named recipe.
- Compression and skills lint move to release gate.

## Compiled Binary Strategy

**User's choices:**
- Compiled binary works fully in dev and shipped mode with both PGlite and external PostgreSQL.
- Shipped default is PGlite; DB backend config can override it.
- Planner researches robust PGlite asset strategy.
- DB config surface is CLI setting plus config plus env override.
- Migration behavior revised to explicit `fulcrum db migrate` for all backends.

## Permission Enforcement

**User's choices:**
- Planner chooses the exact enforcement mechanism based on existing tRPC middleware shape.
- Permission lint hard-fails default CI.
- Hybrid model: explicit resource/action constants, backed by Casbin where enabled, with coarse resource/actions as baseline.
- Local-dev bypass only behind feature flag/env and logged.

## the agent's Discretion

- Exact tRPC permission enforcement mechanism.
- Robust PGlite asset strategy for compiled binary.
- Focused recipe names and exact web gate commands after inspecting current scripts.

## Deferred Ideas

- BUG-17 local main sync/repo hygiene deferred outside Phase 2 product/runtime execution.
