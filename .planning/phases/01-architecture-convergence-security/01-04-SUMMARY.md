# 01-04 SUMMARY: PGlite Connection Pool Singleton (ARCH-10)

## Status: COMPLETE

## What was done

1. **Singleton pattern in `src/web/src/lib/server/db.ts`**:
   - Added `initProductDb()` — opens PGlite once, runs migrations once, caches instance
   - Added `getProductDb()` — synchronous getter, throws if not initialised
   - Added `closeProductDb()` — for graceful shutdown / test teardown
   - Added `__resetProductDbForTest()` — test helper to reset singleton state
   - Deprecated `openProductDb()` — now delegates to singleton, returns proxy with no-op `close()` to protect shared connection from legacy `finally { db.close() }` blocks

2. **Startup init in `src/web/src/hooks.server.ts`**:
   - Top-level `await initProductDb()` at module load — runs before any request
   - Imported `getProductDb` and injected singleton into tRPC context (`db` field)

3. **Backward compatibility preserved**:
   - 64+ page.server.ts files still call `openProductDb()` — they now get the singleton with a safe no-op close
   - No runtime behaviour change for callers except eliminating ~500ms per-request overhead
   - Incremental migration: callers can switch to `getProductDb()` over time

## Files modified

- `src/web/src/lib/server/db.ts` — singleton implementation
- `src/web/src/hooks.server.ts` — startup init + tRPC db injection

## Verification

- `tsc --noEmit` passes for modified files (pre-existing unrelated errors in other files)
- No breaking changes to existing callers (proxy pattern preserves interface)

## Migration path for callers

Existing callers can be incrementally updated from:
```ts
const db = await openProductDb();
try { ... } finally { await db.close(); }
```
To:
```ts
const db = getProductDb();
// ... use db, no close() needed
```
