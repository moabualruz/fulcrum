# Deferred Items

## 2026-05-06 - Plan 09.5-09 Verification

- `bun run ci --tier=unit --domain=application` and `bun run ci --tier=integration --domain=api` both failed during shared typecheck on `src/application/search/queries.ts` with `Record<string, unknown>` not assignable to the typed search query shape. This file is outside 09.5-09 ownership and had concurrent uncommitted edits, so it was not changed in this plan.

## 2026-05-07 - Plan 09.5-23 Verification

- `bun test src/application/automations src/application/workflows src/application/custom-fields src/architecture/boundary.test.ts` passed the Plan 23 application tests and removed Plan 23 routers from the residual direct-access results, but the shared boundary allowlist still failed on unrelated router drift (`backup`, `error-logs`, `flags`, `inference`, `telemetry`, `src/trpc/routers/notifications.ts`) and concurrently removed Plan 21/23 entries.
- `bun test src/server/trpc/routers/__tests__` and `bun run --bun tsc --noEmit` were blocked by unrelated dirty files outside Plan 23 ownership, including `src/application/audit/*`, `src/application/auth/session-context.ts`, and other concurrent Plan 21/22/28 edits. Plan 23 router direct-access grep returned zero matches.
