---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 2 fully executed and verified
last_updated: "2026-05-04T20:47:56.000Z"
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 18
  completed_plans: 18
  percent: 100
---

# Planning State

## Current Position

Phase: 02 (bug-fixes-foundation) — COMPLETE
Plan: 8 of 8

- **Phase**: 02-bug-fixes-foundation
- **Plan**: 8 plans created
- **Status**: Phase 2 fully executed and verified
- **Branch**: dev/v1.0

## Decisions

- ARCH-09: Single Hono API at src/api/hono.ts; product-kernel/api/router.ts is deprecated shim
- ARCH-12: TrpcContext.db deprecated; em (EntityManager) is canonical data access
- Auth: Bearer API-key (SHA-256 hash) is unified REST API auth; session auth stays in web layer
- 5 duplicate isPublicApiEnabled collapsed to src/api/feature-flags.ts
- Phase 2 planning complete: 8 plans cover BUG-01..BUG-18 and FND-01..FND-07.
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
- [Phase 02-08]: Worker payload assertions run before task handlers and async handler failures propagate.
- [Phase 02-08]: fulcrum init and auth whoami use the same PGlite resolver path.
- [Phase 02-08]: Local dev auto-session is excluded from /auth/*; /auth/auto-session keeps the explicit seeded-session redirect.
- [Phase 02-08]: BUG-17 completed by fast-forward-safe `git push origin main`; `origin/main...main` is now `0 0`.
- [Phase 02]: Final verifier passed after root `bun run ci` passed on 2026-05-04; completion blockers closed.
