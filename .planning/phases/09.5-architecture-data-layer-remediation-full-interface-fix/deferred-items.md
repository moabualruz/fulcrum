# Deferred Items

## 2026-05-06 - Plan 09.5-09 Verification

- `bun run ci --tier=unit --domain=application` and `bun run ci --tier=integration --domain=api` both failed during shared typecheck on `src/application/search/queries.ts` with `Record<string, unknown>` not assignable to the typed search query shape. This file is outside 09.5-09 ownership and had concurrent uncommitted edits, so it was not changed in this plan.
