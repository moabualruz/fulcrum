# Codebase Concerns

**Analysis Date:** 2026-05-04

## Tech Debt

### Dual Data Layer (CRITICAL)

- Issue: Two active, growing data access patterns coexist — product-kernel raw SQL and MikroORM entities/repositories. `TrpcContext` exposes both: `em` (ORM) + `db` (raw SQL).
- Files:
  - `src/product-kernel/store/repositories.ts` (713 lines raw SQL)
  - `src/web/src/lib/server/` (171 raw SQL calls across tasks.ts, documents.ts, skills.ts, audit.ts, memory.ts, etc.)
  - `src/db/entities/` (MikroORM entity definitions)
  - `src/server/trpc/routers/` (ORM-based routers)
- Impact: 171 web raw SQL calls bypass tRPC middleware — no permission checks, no Zod validation, no audit trail. Two divergent schemas for the same domain (e.g., two complete task CRUDs with different column sets).
- Fix approach: Migrate raw SQL calls to MikroORM repositories. Extract a service layer so routers delegate to shared business logic instead of inline SQL.

### No Service Layer

- Issue: Business logic lives inline in tRPC routers — serialization, event emission, repository resolution, bulk patching, search indexing, narration all in one procedure.
- Files:
  - `src/server/trpc/routers/docs.ts` (763 lines)
  - `src/server/trpc/routers/tasks.ts` (508 lines)
  - `src/product-kernel/api/router.ts` (674 lines)
- Impact: Untestable without full tRPC context. Impossible to reuse logic across CLI/TUI/Web surfaces. High cyclomatic complexity.
- Fix approach: Extract domain services (e.g., `src/services/docs.ts`, `src/services/tasks.ts`) that routers, CLI commands, and web server actions all call.

### Three Event Mechanisms

- Issue: Three separate event systems with no unifying abstraction:
  1. Process-singleton `EventBus` — `src/subscriptions/event-bus.ts`
  2. Routing-specific `RoutingEventBus` — `src/router/event-bus.ts`
  3. `events` table via `appendEvent()` — `src/product-kernel/events.ts` → `src/product-kernel/store/repositories.ts`
- Impact: MikroORM writes never publish to EventBus — WebSocket subscriptions permanently dead for ORM-path mutations. Mixed ULID/UUID PK formats in events table.
- Fix approach: Unify into single EventBus that persists to events table AND publishes to subscribers. Standardize on one PK format.

### Layering Violations

- Issue: Backend and CLI import directly from web presentation layer, inverting the dependency rule.
- Files:
  - `src/product-kernel/search.test.ts` → imports from `src/web/src/lib/components/command-palette/score.ts`
  - `src/cli/artifact.ts` → imports from `src/web/src/lib/server/artifacts.ts`
  - `src/cli/agent.ts` → imports from `src/web/src/lib/server/runs.ts`
- Impact: Web becomes an implicit dependency of CLI/backend. Cannot build or test surfaces independently.
- Fix approach: Extract shared logic into `src/services/` or `src/shared/`; reverse the dependency direction.

### Stub Routers in AppRouter

- Issue: ~15 inline CRUD stubs in the tRPC AppRouter return empty arrays alongside real implementations. Duplicate mounts exist: `skills`/`fulcrum_skills`, `memory`/`memories`, `runs`/`agent_runs`.
- Files: `src/trpc/router.ts`
- Impact: Consumers cannot tell which endpoints work. Duplicates cause routing ambiguity.
- Fix approach: Remove stubs or mark as explicitly unimplemented with proper error codes. Consolidate duplicate mounts.

### Process-Singleton EventBus

- Issue: `getEventBus()` returns a module-level singleton — won't scale to multi-instance deployment.
- Files: `src/subscriptions/event-bus.ts`
- Impact: Blocks SaaS multi-instance scaling. No cross-process event delivery.
- Fix approach: Replace with injectable EventBus; add Redis/pg_notify transport for multi-instance.

### Two Hono API Implementations

- Issue: Two separate Hono API servers both claiming `/api/v1`.
- Files: `src/product-kernel/api/router.ts`, `src/server/` (tRPC + Hono)
- Impact: Conflicting route registration. Unclear which serves production traffic.
- Fix approach: Consolidate into single API surface.

---

## Known Bugs

### Compiled Binary ENOENT for PGlite (CRITICAL)

- Symptoms: PGlite crashes with ENOENT when running from `bun build --compile` binary.
- Files: `src/product-kernel/db/pglite.ts`
- Trigger: Run any product-kernel command from compiled binary.
- Workaround: Run from source via `bun run src/index.ts`.

### Web Type-Check Fails

- Symptoms: TypeScript compilation errors due to missing `bun:test` types in web context.
- Files: `src/web/`
- Trigger: Run `tsc --noEmit` in web package.
- Workaround: None documented.

### Root CI Excludes Web Checks

- Symptoms: Web type errors and build failures not caught in CI.
- Files: Root CI config
- Trigger: Any PR — web checks silently skipped.
- Workaround: None — bugs reach main branch.

### PGlite Per-Request Connection in Web

- Symptoms: Each SvelteKit server load function calls `openProductDb()` which opens a new PGlite instance AND runs migrations.
- Files:
  - `src/web/src/lib/server/db.ts` (opens PGlite + runs migrations on each call)
  - `src/web/src/routes/runs/[id]/+page.server.ts` (calls `openProductDb()` in load, multiple form actions)
  - `src/web/src/routes/runs/+page.server.ts` (same pattern)
- Trigger: Any page load that uses product-kernel data.
- Workaround: None — causes slow page loads and potential concurrent deadlocks.

### ALTER TABLE in Request Handlers

- Symptoms: Schema DDL runs during normal HTTP request handling.
- Files: Product-kernel actions called from web server handlers
- Trigger: Concurrent requests can deadlock on schema locks.
- Workaround: Move DDL to proper migration files.

### Cookie Advisory in Web Lockfile

- Symptoms: `cookie@0.6.0` has a low-severity advisory.
- Files: `src/web/bun.lockb`
- Trigger: Dependency audit.
- Workaround: Upgrade cookie package.

---

## Security Considerations

### Command Injection via Agent cliPath

- Risk: `Bun.spawn([cliPath, "--version"])` where `cliPath` is read from database-stored agent profile. Any user who can write to `agent_profiles` table can execute arbitrary binaries.
- Files: `src/trpc/router.ts:228`
- Current mitigation: None — no validation on `cliPath` content.
- Recommendations: Allowlist agent binary paths. Validate against known agent names. Never spawn arbitrary paths from DB.

### Webhook Secrets — Dual Path Inconsistency

- Risk: MikroORM webhook path (`src/trpc/routers/webhooks.ts`) encrypts via nacl.secretbox/vault.ts, but product-kernel path (`src/product-kernel/webhook.ts`) accepts `encryptedSecret` as plain string with NO encryption call. Column named `encrypted_secret` but caller must encrypt.
- Files:
  - `src/trpc/routers/webhooks.ts:74-87` (encrypts properly)
  - `src/product-kernel/webhook.ts:108-119` (no encryption)
  - `src/web/src/routes/settings/integrations/linear/+page.server.ts:81` (comment: "In production: encrypt before storing" — NOT encrypted)
- Current mitigation: MikroORM path is encrypted; product-kernel path is not.
- Recommendations: Centralize encryption in a shared function. Never store plaintext in `encrypted_secret` column.

### Semgrep Findings (14)

- Risk: 14 semgrep findings including regexp and IFS issues.
- Files: Various across `src/`
- Current mitigation: None — findings unresolved.
- Recommendations: Run `semgrep --config auto` and triage all 14 findings.

### Gitleaks Historical Findings (18)

- Risk: 18 historical secret leaks detected in git history.
- Files: Git history
- Current mitigation: None documented.
- Recommendations: Rotate affected credentials. Add gitleaks to pre-commit hook.

### Raw SQL Without Permission Middleware

- Risk: 171 raw SQL calls in `src/web/src/lib/server/` bypass tRPC middleware — no permission checks, no Zod validation, no audit trail.
- Files: `src/web/src/lib/server/tasks.ts`, `src/web/src/lib/server/documents.ts`, `src/web/src/lib/server/skills.ts`, and ~15 others.
- Current mitigation: None — direct DB access with org_id passed manually.
- Recommendations: Route all mutations through tRPC or a service layer with permission enforcement.

---

## Performance Bottlenecks

### PGlite Instance Per Request

- Problem: `openProductDb()` opens a new PGlite instance for each server load function call, including running all migrations.
- Files: `src/web/src/lib/server/db.ts`, all `+page.server.ts` files that import it.
- Cause: No connection pooling or singleton pattern for PGlite in web context.
- Improvement path: Create a module-level singleton PGlite instance. Run migrations once at startup.

### Large Router Files

- Problem: Monolithic router files with high cyclomatic complexity (CCN 18-59 per lizard analysis).
- Files:
  - `src/server/trpc/routers/docs.ts` (763 lines)
  - `src/server/trpc/routers/tasks.ts` (508 lines)
  - `src/product-kernel/store/repositories.ts` (713 lines)
  - `src/product-kernel/api/router.ts` (674 lines)
  - `src/tui/index.ts` (1170 lines)
  - `src/cli/doctor.ts` (1181 lines)
- Cause: No service layer extraction. All business logic inline.
- Improvement path: Extract domain services. Split routers by sub-domain.

---

## Fragile Areas

### Product-Kernel ↔ MikroORM Event Divergence

- Files: `src/product-kernel/events.ts`, `src/db/entities/core/Event.ts`, `src/subscriptions/event-bus.ts`
- Why fragile: MikroORM events use UUID PKs, product-kernel uses ULID PKs — same `events` table. Neither path publishes to EventBus. Incompatible column sets.
- Safe modification: Any event-related change must update BOTH paths or the events table becomes inconsistent.
- Test coverage: `src/product-kernel/events.test.ts` exists but only tests product-kernel path.

### Web Server Actions (Raw SQL)

- Files: `src/web/src/lib/server/*.ts` (171 raw SQL calls)
- Why fragile: No schema validation (Zod), no permission middleware, manual org_id threading. Schema changes in MikroORM migrations won't update raw SQL.
- Safe modification: Always check both MikroORM entities AND raw SQL queries when changing a table schema.
- Test coverage: Test files exist (e.g., `agents.test.ts`, `documents.test.ts`) but coverage is incomplete.

### Generated CLI Commands

- Files: `src/cli/generated/` (49 files)
- Why fragile: All 49 generated command files throw "Generated tRPC invocation for X is not wired yet." Any attempt to use these commands fails immediately.
- Safe modification: Wire each to actual tRPC client calls. 12 hand-written CLI commands in `src/cli/commands/` work correctly and serve as pattern.
- Test coverage: None for generated commands.

---

## Scaling Limits

### Process-Singleton EventBus

- Current capacity: Single process only.
- Limit: Cannot deliver events across multiple server instances.
- Scaling path: Replace with Redis pub/sub or PostgreSQL LISTEN/NOTIFY.

### PGlite (Embedded Postgres)

- Current capacity: Single-user, single-process local development.
- Limit: No concurrent multi-user access. No connection pooling.
- Scaling path: Replace with external PostgreSQL for production/SaaS.

---

## Dependencies at Risk

### cookie@0.6.0

- Risk: Low-severity advisory in web lockfile.
- Impact: Potential cookie parsing vulnerability.
- Migration plan: Upgrade to latest cookie version.

### PGlite Compiled Binary Incompatibility

- Risk: PGlite WASM assets cannot be extracted from bun-compiled binary.
- Impact: Product-kernel features unavailable in distributed binary.
- Migration plan: Ship PGlite assets alongside binary, or use SQLite for compiled mode.

---

## Missing Critical Features

### Zero Test Coverage Enforcement

- Problem: 108 test scenarios planned, none enforced in CI. No coverage thresholds.
- Blocks: Confidence in refactoring. Any of the above fixes risk regressions without tests.

### Symphony Conformance Gaps

- Problem: Symphony orchestration scores 3 PASS / 10 PARTIAL / 1 FAIL / 6 MISSING against spec.
- Details:
  - FAIL: Continuation retry completely absent (core spec feature)
  - MISSING: Dynamic config reload, per-state concurrency, token accounting, codex.command, startup cleanup, `$VAR` resolution
  - PARTIAL: Issue model stripped (5/12 fields missing), stall detection incomplete, workspace safety only on destroy
- Files: `src/symphony/` (orchestrator), `src/server/trpc/routers/` (symphony routes)
- Blocks: Reliable multi-step agent orchestration.

### Missing Libraries Per PRD

- Problem: Several PRD-required libraries not installed or not wired:
  - LayerChart — not installed (burndown/velocity charts impossible)
  - Orama — not installed (in-browser search impossible)
  - Cmd+K — component exists but keyboard shortcut NOT bound
- Files: `src/web/src/lib/components/command-palette/` (exists, not wired to keyboard)

### Three-Surface Parity Failure

- Problem: Every pillar fails Web + CLI + TUI parity. Web is furthest along; CLI has 49 dead generated commands; TUI data wiring to tRPC unclear.
- Blocks: Consistent user experience across surfaces.

---

## Test Coverage Gaps

### Web Server Actions

- What's not tested: Permission enforcement, org-scoping, concurrent access patterns for 171 raw SQL calls.
- Files: `src/web/src/lib/server/*.ts`
- Risk: Authorization bypass, data leaks across orgs.
- Priority: High

### Symphony Orchestration

- What's not tested: Continuation retry, stall detection edge cases, concurrent state transitions.
- Files: `src/symphony/`
- Risk: Stuck orchestrations, lost work, silent failures.
- Priority: High

### Generated CLI Commands

- What's not tested: All 49 generated commands in `src/cli/generated/` — every one throws.
- Files: `src/cli/generated/*.ts`
- Risk: Dead code accumulation. Users encounter errors on any generated command.
- Priority: Medium

### Event System Integration

- What's not tested: Cross-path event consistency (MikroORM vs product-kernel), EventBus subscription delivery.
- Files: `src/subscriptions/event-bus.ts`, `src/product-kernel/events.ts`, `src/db/entities/core/Event.ts`
- Risk: Events silently lost. WebSocket subscriptions permanently dead.
- Priority: High

---

## Cross-Reference

- Full audit: `.scratch/master-audit/AUDIT-REPORT.md` (19 confirmed bugs, 17 cross-cutting gaps, 11 recommendations)
- Wave 2 corrections: `.scratch/master-audit/WAVE2-CORRECTIONS.md` (12 Wave-1 errors corrected, new P0/P1 findings)
- Requirements spec: `.scratch/agent-os-vision/REQUIREMENTS.md` (213 requirements across 16 pillars)

---

*Concerns audit: 2026-05-04*
