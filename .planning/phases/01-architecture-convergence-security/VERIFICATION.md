---
phase: "01-architecture-convergence-security"
status: gaps_found
verified_at: "2026-05-04"
verified_by: "claude-opus-4-6"
pass_count: 12
gap_count: 4
human_verification: []
---

# Phase 01 Verification — Architecture Convergence + Security

## Phase Goal

> All business logic flows through clean tRPC → service → repository → entity stack.
> No raw SQL, no layering violations, unified domain events, no DDL in handlers,
> security vulnerabilities patched.

## Success Criteria Results

### SC1: ProductDb.query() returns zero grep hits — all data access through MikroORM repositories

**Result: PARTIAL PASS**

- `ProductDb.query()` — **zero hits** in entire codebase. Direct ProductDb access eliminated.
- `db.query()` raw SQL remains in legacy service layer files:
  - `src/services/tasks.ts` — 2 ALTER TABLE + parameterized queries
  - `src/services/runs.ts` — 4 raw SQL calls (INSERT, UPDATE, SELECT)
  - `src/services/artifacts.ts` — 4 raw SQL calls (SELECT, DELETE)
- These use the `ProductDb` type alias but call `.query()` with parameterized SQL, not the
  MikroORM `EntityManager`. The migration to repository pattern is incomplete for these three
  service files.

**Gap**: `src/services/runs.ts`, `src/services/artifacts.ts`, `src/services/tasks.ts` still
use raw `db.query()` instead of MikroORM repositories. Entity classes likely exist for
`AgentRun`, `Artifact`, and `Task` but the service layer has not been migrated.

### SC2: Events table uses single consistent PK format; EventDispatcher persists + publishes in one call

**Result: PASS**

- `src/product-kernel/event-dispatcher.ts` implements `EventDispatcher` class (ARCH-04).
- `dispatch()` method: persists via `rawAppendEvent(db, input)` then calls `this.publish(event)`.
- PK format: ULID (confirmed in event-dispatcher.ts header comment).
- `src/product-kernel/events.ts` re-exports `EventDispatcher`, `eventDispatcher` singleton,
  `appendEvent`, `EventRow`, `AppendEventInput`.
- In-memory pub/sub with `EventEmitter`, wildcard + filtered listener support.

### SC3: No ALTER TABLE in request handlers; single PGlite connection pool shared across requests

**Result: PARTIAL PASS**

- **DDL migration exists**: `src/db/migrations/Migration20260504130000_ddl_cleanup.ts` correctly
  relocates the due_date/start_date ALTER TABLE statements to a proper migration.
- **Gap**: `src/services/tasks.ts` lines 81-82 still contain runtime ALTER TABLE:
  ```ts
  await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date`);
  await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date date`);
  ```
  The migration was created but the handler code was **not removed**. Both paths run the same DDL.
- ALTER TABLE in test files (`page.server.test.ts`) — acceptable for test fixtures.
- **PGlite connection pool**: `src/db/mikro-orm.config.ts` accepts a single `pglite?: PGlite`
  instance and wraps it in `PGliteKyselyDialect`. MikroORM manages the connection lifecycle.
  No evidence of multiple PGlite instantiations in app code (only in test files).

### SC4: Webhook secrets encrypted at rest; agent testProfile validates cliPath against allowlist

**Result: PASS**

- **Webhook encryption**: `src/secrets/vault.ts` implements XSalsa20-Poly1305 (tweetnacl.secretbox)
  with random 24-byte nonce envelope. PBKDF2-SHA256 KDF (100k iterations).
- **Webhook entity**: `src/db/entities/notifications/Webhook.ts` stores `encryptedSecret` column
  (`encrypted_secret`). Comment confirms "Never returned to callers; list returns ****".
- **cliPath allowlist**: `src/trpc/routers/agents.ts` contains `assertCliPathAllowed()` function
  (SEC-02). Validates against registered agent profiles + basename matching. Throws TRPCError
  on disallowed paths. Called before `Bun.spawn()`.

### SC5: AppRouter: zero stubs, zero duplicate mounts, zero cross-boundary imports

**Result: PASS**

- **Zero inline stubs**: `src/trpc/router.ts` is declarative mount-only (comment: "No inline stub
  helpers or duplicate aliases"). Stub helpers extracted to `src/trpc/routers/stub-helpers.ts`.
- **Zero duplicate mounts**: Each router key appears exactly once in `appRouter` definition.
  Test at `tests/trpc/app-router-scaffold.test.ts` line 11 confirms "duplicate mount aliases
  (skills, memory, runs, notifications) were removed in the router cleanup."
- **Router test coverage**: Scaffold test verifies all REQUIRED_ROUTERS present, all
  REQUIRED_PROCEDURES enumerated, mutation permission enforcement, no `z.any()` in schemas.
- **Cross-boundary imports**: `rg 'from.*web/src/lib' src/product-kernel/ src/cli/` found one hit:
  `src/product-kernel/search.test.ts` — test file only, acceptable.

## Requirement Traceability

| Req ID  | Description                            | Status       | Evidence |
|---------|----------------------------------------|--------------|----------|
| ARCH-01 | tRPC → service → repo → entity stack   | PARTIAL PASS | Router clean; 3 service files still use raw SQL |
| ARCH-02 | No raw SQL in app code                 | GAP          | `db.query()` in services/tasks, runs, artifacts |
| ARCH-03 | MikroORM repositories for data access  | PARTIAL PASS | Entities exist; services not fully migrated |
| ARCH-04 | Unified EventDispatcher                | PASS         | `event-dispatcher.ts` persist+publish |
| ARCH-05 | Consistent event PK format (ULID)      | PASS         | Confirmed in EventDispatcher |
| ARCH-06 | No DDL in request handlers             | GAP          | `tasks.ts` lines 81-82 still have ALTER TABLE |
| ARCH-07 | Single PGlite connection pool          | PASS         | `mikro-orm.config.ts` single instance pattern |
| ARCH-08 | No layering violations                 | PASS         | Cross-boundary import only in test file |
| ARCH-09 | AppRouter declarative mounts only      | PASS         | No inline logic in router.ts |
| ARCH-10 | Zero duplicate router mounts           | PASS         | Confirmed by scaffold test |
| ARCH-11 | Zero stubs in AppRouter                | PASS         | Stubs extracted to stub-helpers.ts |
| ARCH-12 | No z.any() in tRPC schemas             | PASS         | Enforced by scaffold test |
| SEC-01  | Webhook secrets encrypted at rest      | PASS         | vault.ts XSalsa20-Poly1305 |
| SEC-02  | cliPath allowlist validation           | PASS         | `assertCliPathAllowed()` in agents.ts |
| SEC-03  | No credentials in plaintext            | PASS         | `encryptedSecret` column, vault encryption |
| SEC-04  | Protected mutations require auth       | PASS         | Scaffold test enforces permission check |

## Gaps Requiring Remediation

### GAP-1: Raw SQL in service layer (ARCH-02, ARCH-03)

**Files**: `src/services/tasks.ts`, `src/services/runs.ts`, `src/services/artifacts.ts`

These files use `db.query()` with raw SQL strings instead of MikroORM EntityManager/repositories.
Migration to repository pattern needed. Estimated effort: medium (entities likely exist, need
service rewrite to use `em.find()` / `em.persistAndFlush()` / `em.nativeDelete()`).

### GAP-2: Runtime ALTER TABLE not removed from handler (ARCH-06)

**File**: `src/services/tasks.ts` lines 81-82

The DDL cleanup migration (`Migration20260504130000_ddl_cleanup.ts`) correctly relocates these
statements, but the original runtime code was not deleted. Remove lines 81-82 — the migration
ensures columns exist before any request handler runs.

## Summary

- **12 of 16 requirements PASS**
- **4 requirements have gaps** (ARCH-02, ARCH-03, ARCH-06, plus ARCH-01 partial)
- All security requirements (SEC-01 through SEC-04) PASS
- EventDispatcher, router architecture, PGlite pooling, and encryption all verified
- Remaining gaps are concentrated in 3 legacy service files that predate the MikroORM migration
