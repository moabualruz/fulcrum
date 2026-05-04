---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
last_updated: "2026-05-04T13:06:22.262Z"
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 18
  completed_plans: 17
  percent: 94
---

# Planning State

## Current Position

Phase: 02 (bug-fixes-foundation) — EXECUTING
Plan: 8 of 8

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
- [Phase 02-bug-fixes-foundation]: 02-03: Claude plugin cleanup now requires Fulcrum ownership markers before deleting cache or marketplace surfaces.
- [Phase 02-bug-fixes-foundation]: 02-03: Component/package lifecycle status now reports filesystem truth alongside ledger state.
- [Phase 02-bug-fixes-foundation]: 02-03: Loadable package skill mirrors preserve existing non-Fulcrum target skills unless Fulcrum mirror metadata permits replacement.
- [Phase 02-04]: Targeted patchers preserve unowned bytes instead of reserializing whole files.
- [Phase 02-04]: Config mutation requires explicit Fulcrum ownership markers before changing existing JSON/TOML keys.
- [Phase 02-05]: Product CLI parsing fails closed on unknown or valueless flags.
- [Phase 02-05]: Doctor product-kernel DB probe failures are warning-level with subsystem product-kernel-db.
- [Phase 02-05]: Web Cmd+K/Ctrl+K uses existing CommandPalette controlled state with no visible shortcut UI.
- [Phase 02-06]: Tenant settings use a standalone MikroORM entity keyed by orgId and key.
- [Phase 02-06]: Product-kernel tenant indexes keep org_id as the leading column for tenant-scoped access paths.
- [Phase 02-06]: TUI feature flags use the canonical registry and shared env parsing.
- [Phase 02]: Protected tRPC routers use explicit permission metadata as the authorization source of truth; path derivation remains fallback only for migration/test surfaces.
- [Phase 02]: Local development permission bypass is controlled by the registered trpc-permission-local-dev-bypass feature flag and logs each bypass.
- [Phase 02]: Default CI now runs a hard trpc:permissions gate before the broad root test suite.
