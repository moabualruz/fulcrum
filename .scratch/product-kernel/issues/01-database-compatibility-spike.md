# 01 — Database compatibility spike

Status: ready-for-agent
Risk tier: medium
Dependencies: —
File ownership:
- `src/product-kernel/db/types.ts`
- `src/product-kernel/db/pglite.ts`
- `src/product-kernel/db/postgres.ts`
- `src/product-kernel/compat.test.ts`
- `package.json` (add `@electric-sql/pglite`, `pg`, `@types/pg`)

Acceptance criteria:
- `compat.test.ts` defines a `ProductDb` driver contract; the test fails before any driver is implemented (RED) by importing throwing skeletons.
- PGlite driver passes the `assertCoreSql` contract (CREATE TABLE, INSERT with `$N` parameters, SELECT round-trip).
- PostgreSQL driver supports the same contract behind `process.env.DATABASE_URL`; test is `skipIf(!DATABASE_URL)` so CI passes without a server.
- Driver shape matches the spec in `.scratch/product-kernel/PRD.md` Task 1: `engine: "pglite" | "postgres"`, `query<T>`, `exec`, `close`.
- `bun test src/product-kernel/compat.test.ts` is green for PGlite.

Failure gate: if PGlite cannot persist under Bun, stop and trigger a Convex spike (escalate as `ready-for-human`).
