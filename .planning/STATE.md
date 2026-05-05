---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
last_updated: "2026-05-05T00:22:00Z"
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 24
  completed_plans: 23
  percent: 96
---

# Planning State

## Current Position

Phase: 03 (symphony-sandcastle) — EXECUTING
Plan: 6 of 6

- **Phase**: 02-bug-fixes-foundation
- **Plan**: 8 plans created
- **Status**: Phase 2 fully executed and verified
- **Branch**: dev/v1.0

## Decisions

- ARCH-09: Single Hono API at src/api/hono.ts; product-kernel/api/router.ts is deprecated shim
- ARCH-12: TrpcContext.db deprecated; em (EntityManager) is canonical data access
- Auth: Bearer API-key (SHA-256 hash) is unified REST API auth; session auth stays in web layer
- 5 duplicate isPublicApiEnabled collapsed to src/api/feature-flags.ts
- Branch policy: all phase execution commits stay on `dev/v1.0`; `main` is only updated by the final milestone merge after all phases land. Do not push or mutate `main` during phase execution unless explicitly requested in the same turn.
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
- [Phase 02-08]: BUG-17 is repo-hygiene only under the milestone branch policy; phase execution must not push `main`. Treat future main-sync work as final milestone merge hygiene, not per-phase execution.
- [Phase 02]: Final verifier passed after root `bun run ci` passed on 2026-05-04; completion blockers closed.
- [Phase ?]: SymphonyIssueSchema labels normalize lowercase via Zod transform (03-02)
- [Phase ?]: TrackerBlockerResolutionError thrown on any unresolved blocker ID before candidate filtering (03-02)
- [Phase ?]: [Phase 03-02]: External trackers are ingest-only; native Fulcrum tracker is sole Symphony dispatch source (D-04)
- [Phase ?]: [Phase 03-02]: identifier and branch_name use task.id stable stub until Pillar 6 named identifiers land
- [Phase 03-04]: Response ID matching in CodexAppServerClient accepts any response carrying thread.id data (single in-flight request per process)
- [Phase 03-04]: TokenUsageAggregator.updateCumulative() replaces stored total per thread_id — no double-counting (D-22)
- [Phase 03-04]: logSymphonyEvent() catches all sink errors — observability must not crash orchestration (§17.6)
- [Phase 03-05]: resolveAgentRunConfig merges WORKFLOW.md override fields over AgentProfile defaults; UnknownAgentError for unsupported agent names; Codex default (D-10, D-11)
- [Phase 03-05]: session-resume result exposes resumeVia and capability — unsupported profiles cannot silently pretend resume happened (D-21)
- [Phase 03-05]: doctor checkSandcastle() calls sandboxProviderDoctorChecks(); errors name the missing provider flag (e.g. sandbox-docker); runAll exported for test reuse
