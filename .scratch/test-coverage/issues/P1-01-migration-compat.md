---
Status: ready-for-agent
Phase: P1
Priority: critical
Test-file: tests/infrastructure/migration-compat.test.ts
Framework: bun-test
Blocked-by: []
---

# Migration Compatibility

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Runs all `src/product-kernel/db/migrations/*.sql` files through PGlite in alphabetical order and verifies zero errors. Catches duplicate table definitions, ALTER TABLE PGlite incompatibilities, and column naming conflicts across migration files.

## Setup

- Fresh PGlite instance (in-memory or tmpdir)
- Import all *.sql files from `src/product-kernel/db/migrations/`

## Steps

1. Read all *.sql files from `src/product-kernel/db/migrations/` in alphabetical order
2. For each file, execute via `db.exec(sql)`
3. After all migrations: query `pg_catalog.pg_tables` for expected tables
4. Scan all migration files for duplicate `CREATE TABLE` statements for the same table name

## Assertions

- [ ] Zero errors during migration execution
- [ ] All expected tables exist: `orgs`, `projects`, `tasks`, `documents`, `events`, `search_documents`, `agent_runs`, `notification_rules`, `notifications`, `saved_searches`, `sprints`, `memories`, `artifacts`, `repos`, `connector_sync_log`, `feature_flags`
- [ ] No duplicate table definitions across migration files
- [ ] No ALTER TABLE on columns that already exist in CREATE TABLE of same file
