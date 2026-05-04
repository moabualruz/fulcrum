# 01-10 Summary: API Consolidation + TrpcContext Cleanup (ARCH-09, ARCH-12)

**Status:** DONE

## What was done

### 1. Shared feature-flag + auth modules (`src/api/`)
- `src/api/feature-flags.ts` — single `isPublicApiEnabled()` + `isFeatureEnabled()` replacing 5 duplicate definitions
- `src/api/auth.ts` — unified Bearer API-key auth middleware (SHA-256 hash lookup)

### 2. Unified Hono API entry point
- `src/api/hono.ts` rewritten as single `createPublicApi(deps?)` factory
- Accepts `{ db: ProductDb }` deps for real routes; omit for stub-only/spec generation
- Mounts both real kernel routes and stub routes under one OpenAPI 3.1 spec

### 3. Real route bridges (`src/api/routes/kernel-*.ts`)
- `kernel-tasks.ts` — CRUD via product-kernel repositories + services
- `kernel-sprints.ts` — list/create/update via product-kernel repositories
- `kernel-reports.ts` — burndown + velocity from product-kernel reports
- `kernel-notifications.ts` — notifications + rules + webhook config
- `kernel-audit.ts` — audit event query

### 4. Deprecation shims
- `product-kernel/api/router.ts` → re-exports from unified API (tests still import old path)
- `trpc/rest-api.ts` → re-exports `isPublicApiEnabled` from shared module
- `web/+server.ts`, `settings/api/+page.server.ts` → re-export from shared module

### 5. TrpcContext.db deprecated (ARCH-12)
- `db?: ProductDb` marked `@deprecated` on `TrpcContext` and `CreateContextInput`
- Only orchestration/symphony procedures still consume `db`
- All other data access uses `em` (EntityManager) since plans 01-05/06

## Files created
- `src/api/feature-flags.ts`
- `src/api/auth.ts`
- `src/api/routes/kernel-tasks.ts`
- `src/api/routes/kernel-sprints.ts`
- `src/api/routes/kernel-reports.ts`
- `src/api/routes/kernel-notifications.ts`
- `src/api/routes/kernel-audit.ts`

## Files modified
- `src/api/hono.ts` — rewritten as unified entry
- `src/product-kernel/api/router.ts` — shim re-export
- `src/trpc/rest-api.ts` — re-export shared flag
- `src/trpc/context.ts` — deprecate db field
- `src/web/src/routes/api/v1/+server.ts` — re-export shared flag
- `src/web/src/routes/settings/api/+page.server.ts` — re-export shared flag

## Architecture decision
- **Auth strategy**: kept existing Bearer API-key (SHA-256 hash) as the unified auth mechanism. Session auth (cookie-based for SvelteKit) remains separate in the web layer, not mixed into the REST API.
- **Stub routes retained**: docs, search, runs, artifacts, repos, memory, saved-views stubs stay alongside real kernel routes for OpenAPI spec completeness. They'll be replaced when those domains get real implementations.
- **db field deprecation not removal**: orchestration router has 7 `requireDb(ctx)` calls consuming ProductDb for symphony functions (createRun, getRun, cancelRun, retryRun, etc.). Full removal requires migrating those to EntityManager, which is a separate plan.

## Pre-existing issues noted
- `router.test.ts` and `notify-audit-api.test.ts` fail because they pass `ProductDb` to `createLocalOrg()` which now requires EntityManager (broken since plan 01-05). Not introduced by this plan.

## Commits
1. `718f9b9c` — extract shared feature-flags and auth middleware
2. `8be2790d` — consolidate to single Hono API entry point
3. `9e84860f` — deprecate duplicate isPublicApiEnabled + router shims
4. `90b99790` — deprecate TrpcContext.db field
5. `e2ec8a6b` — fix Hono ApiEnv type mismatch with stub routes
