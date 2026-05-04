---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
last_updated: "2026-05-04T11:22:57.914Z"
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 18
  completed_plans: 12
  percent: 67
---

# Planning State

## Current Position

Phase: 02 (bug-fixes-foundation) — EXECUTING
Plan: 2 of 8

- **Phase**: 02-bug-fixes-foundation
- **Plan**: 8 plans created
- **Status**: Ready to execute
- **Branch**: dev/v1.0

## Decisions

- ARCH-09: Single Hono API at src/api/hono.ts; product-kernel/api/router.ts is deprecated shim
- ARCH-12: TrpcContext.db deprecated; em (EntityManager) is canonical data access
- Auth: Bearer API-key (SHA-256 hash) is unified REST API auth; session auth stays in web layer
- 5 duplicate isPublicApiEnabled collapsed to src/api/feature-flags.ts
- Phase 2 planning complete: 8 plans cover BUG-01..BUG-18 and FND-01..FND-07; BUG-17 remains deferred outside product/runtime execution per D-04.
- [Phase 02-bug-fixes-foundation]: 02-02: Database backend precedence is CLI flag, persisted config, DATABASE_URL, then PGlite default.
- [Phase 02-bug-fixes-foundation]: 02-02: Product init requires explicit fulcrum db migrate instead of auto-running migrations.
- [Phase 02-bug-fixes-foundation]: 02-02: PGlite default data lives under FULCRUM_HOME and is created recursively before opening.
