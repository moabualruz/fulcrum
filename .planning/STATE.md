---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
last_updated: "2026-05-05T04:15:52.749Z"
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 33
  completed_plans: 29
  percent: 88
---

# Planning State

## Current Position

Phase: 04 (inference-router-skills) — EXECUTING
Plan: 5 of 8

- **Phase**: 04-inference-router-skills
- **Plan**: 04-05 completed
- **Status**: MCP virtual skill descriptors, lock fail-closed with per-skill SHA state, structured SkillConflict entities, and registry service
- **Branch**: gsd/phase-04-inference-router-skills

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
- [Phase 03-06]: HTTP server binds 127.0.0.1 by default; port:0 uses ephemeral binding; wraps createHttpApiRoutes (SYM-25)
- [Phase 03-06]: dispatchRun tRPC procedure creates AgentRun via MikroORM EM; sandboxMode 'noSandbox' is human alias for DB value 'host' (D-12)
- [Phase 03-06]: CLI SymphonyCaller.dispatchRun required; 'runs dispatch <taskId>' added; TUI dispatch() optional in caller interface; Web dispatch action uses tRPC local caller (SND-06)
- [Phase 04-01]: assertEmbeddingDimension validates vector length against expected=384; throws 'embedding dimension mismatch expected=<N> actual=<M>' — defined in test file, exported for later extraction to model-metadata.ts
- [Phase 04-01]: Backend probes use 2s timeout; unconfigured backends return unconfigured state without network calls; embedded backend probes Unix socket (matching lifecycle.ts)
- [Phase 04-01]: Learned draft status auto-detected from matchingActiveRuleIds: empty→review_needed, non-empty→conflict (D-12 compliance)
- [Phase 04-01]: MCP descriptors use deterministic tool manifest hash (sorted tool names, SHA-256 hex)
- [Phase 04-01]: Lock enforcement returns exact expected/actual SHA for mismatch/missing/ok states; override audit includes slug, overriddenBy, action, reason, previous hashes
- [Phase 04-01]: Static build proof exits 1 with linuxProof:"missing" on macOS without Docker; INF-02 cannot close until Docker or native Linux is available
- [Phase 04-02]: assertEmbeddingDimension is the single dimension-validation function for all embedding paths; write/search/score all validate before operating per D-05/D-06/D-07
- [Phase 04-03]: InferenceService is the central health-and-lifecycle facade; probeConfiguredBackends() called from CLI status, tRPC backends.probe, and doctor checks
- [Phase 04-03]: CLI status uses probeConfiguredBackends() directly for in-process client path, falls back gracefully if not available
- [Phase 04-03]: tRPC backends.probe uses lazy dynamic import to avoid circular dependency issues
- [Phase 04-03]: Doctor inference checks (inference-sidecar, inference-backends) use InferenceService directly (not container injection) for simplicity
- [Phase 04-03]: static-proof CLI command accepts injectable proof runner for testability
- [Phase 04-05]: sha256Hex shared from mcp-virtual-skills.ts to lock.ts to avoid hash duplication across both modules
- [Phase 04-05]: SkillConflict entity stores structured conflict records with kind/status enums instead of inline unified diffs in lock file
- [Phase 04-05]: verifySkillLock() returns state object (ok/sha_mismatch/missing) instead of throwing — callers handle fail-closed behavior
- [Phase 04-05]: upstream_conflict enum string kept in lock.ts SkillsLockEntry schema for backward compat with existing lock files
