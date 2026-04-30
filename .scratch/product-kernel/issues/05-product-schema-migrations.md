# 05 — Product schema migrations

Status: done
Risk tier: medium
Dependencies: product-kernel/01
File ownership:
- `src/product-kernel/db/migrate.ts`
- `src/product-kernel/db/migrate.test.ts`
- `src/product-kernel/db/migrations/0001_product_kernel.sql`
- `src/product-kernel/db/migrations/0002_search.sql`
- `src/product-kernel/db/migrations/0003_jobs.sql`

Acceptance criteria:
- `runMigrations(db)` is idempotent: running twice leaves the DB in the same state.
- `0001_product_kernel.sql` creates `orgs`, `projects`, `repos`, `documents`, `tasks`, `memories`, `agent_runs`, `artifacts`, `edges`, `events` with `text` ULID PKs and `timestamptz` timestamps.
- `0002_search.sql` creates `search_documents` with the generated `tsvector` `search_vector` column and `search_documents_vector_idx` GIN index, plus the scope index.
- `0003_jobs.sql` creates the `jobs` table with status CHECK constraint and `jobs_claim_idx`.
- RED test asserts these tables exist after migration; fails before SQL exists.
- GREEN: PGlite path passes; PostgreSQL path skips when no `DATABASE_URL` and passes when set.

## Comments
- Shipped in `ec923d0 feat(product-kernel): add product schema migrations`.
