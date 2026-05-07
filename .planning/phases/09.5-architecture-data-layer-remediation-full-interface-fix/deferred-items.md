# Deferred Items

## 2026-05-06 - Plan 09.5-09 Verification

- `bun run ci --tier=unit --domain=application` and `bun run ci --tier=integration --domain=api` both failed during shared typecheck on `src/application/search/queries.ts` with `Record<string, unknown>` not assignable to the typed search query shape. This file is outside 09.5-09 ownership and had concurrent uncommitted edits, so it was not changed in this plan.

## 2026-05-07 - Plan 09.5-23 Verification

- `bun test src/application/automations src/application/workflows src/application/custom-fields src/architecture/boundary.test.ts` passed the Plan 23 application tests and removed Plan 23 routers from the residual direct-access results, but the shared boundary allowlist still failed on unrelated router drift (`backup`, `error-logs`, `flags`, `inference`, `telemetry`, `apps/server/src/trpc/routers/notifications.ts`) and concurrently removed Plan 21/23 entries.
- `bun test apps/server/src/runtime/trpc/routers/__tests__` and `bun run --bun tsc --noEmit` were blocked by unrelated dirty files outside Plan 23 ownership, including `src/application/audit/*`, `src/application/auth/session-context.ts`, and other concurrent Plan 21/22/28 edits. Plan 23 router direct-access grep returned zero matches.

## 2026-05-07 - Plan 09.5-28 Verification

- `bun test apps/server/src/runtime/trpc/routers/__tests__ tests/trpc/router.test.ts src/architecture/boundary.test.ts` passed router tests but failed the shared boundary allowlist because concurrent Plan 23 files (`apps/server/src/runtime/trpc/routers/automations.ts`, `custom-fields.ts`, `orgs.ts`, `workflows.ts`) were already clean while the committed expected-debt list still contained them. Plan 28-owned routers were absent from the residual direct-access and raw-SQL results, so the unrelated allowlist drift was not fixed here.
