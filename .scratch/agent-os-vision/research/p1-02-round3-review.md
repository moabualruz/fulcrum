# P1#02 Round-3 Review — commit 456e384

## Verdict
- SPEC: FAIL
- QUALITY: CHANGES_REQUIRED

## Verification Table
| Check | Result | Evidence |
|-------|--------|----------|
| Single ORM instance through Phase 1-4 | PASS | `git grep -nE '\bormA\b|\bormB\b' 456e384 -- tests/db/migrations/events-backfill.test.ts` returned no lines. `git grep -nE 'let orm\|const pglite\|MikroORM\.init\|await orm\.migrator\.up\|if \(orm\)'` returned `let orm` at line 109, one `PGlite` at line 115, one `MikroORM.init` at line 116, `orm.migrator.up` at lines 119 and 171, close at line 177. |
| Phase 2 inserts null-org row before events migration runs | PASS | Grep shows auth-only migration at lines 118-120, Phase 2 raw setup at lines 123-153, precondition `count({ org: null })` at lines 157-163, then events backfill `orm.migrator.up` at lines 167-172. |
| Phase 4 asserts live row backfilled to `WELL_KNOWN_ORG_ID` | PASS | Grep shows Phase 4 assertions: `count({ org: null })` at lines 291-296, lookup by `test.event.preexisting` at line 304, and `expect(event!.org.id).toBe(WELL_KNOWN_ORG_ID)` at line 308. |
| Phase 2 has four sanctioned DDL/INSERT raw calls | PASS | `git grep -c 'await conn.execute' 456e384 -- tests/db/migrations/events-backfill.test.ts` returned `4`. Raw SQL grep shows exactly four Phase 2 DDL/INSERT strings at lines 134, 139, 145, 153. |
| Each raw Phase 2 call individually cites C6 + reason | FAIL | Block-level C6 comment exists at lines 124-127 and header lines 40-42. Per-call context from `git grep -nC 6 'await conn.execute'` shows call comments at lines 130-143 do not individually cite `C6`; only insert comment at line 148 says `C6 sanctioned raw INSERT`. |
| No raw SQL outside Phase 2 setup block | FAIL | Raw SQL grep shows Phase 2 DDL/INSERT at lines 134, 139, 145, 153, plus Phase C raw SQL outside Phase 2: `.execute(\`explain ${sql}\`, ...)` at line 437. Observable: no extra DDL/INSERT outside Phase 2; raw `explain` still exists outside Phase 2. |
| `IF NOT EXISTS` added to migration `CREATE TABLE` | PASS | `git grep -n 'create table if not exists' 456e384 -- src/db/migrations/Migration20260501120537_events_org_id_backfill.ts` returned `orgs` at line 25 and `events` at line 35. |
| `transactional: false` scoped to test config only | PASS | Combined grep over test + prod config returned only `tests/db/migrations/events-backfill.test.ts` lines 46, 80-81, 94, 97-98. Explicit grep over `src/db/mikro-orm.config.ts` returned no lines. |
| `explain-probe-test.test.ts` absent | PASS | `git ls-files | rg 'explain-probe'` returned no lines. `git ls-tree -r --name-only 456e384 | rg 'explain-probe'` returned no lines. |
| Touched-file scope | PASS | `git diff-tree --no-commit-id --name-only -r 456e384` returned only `.scratch/agent-os-vision/01-foundation-reset/issues/02-events-org-id-backfill.md`, `src/db/migrations/Migration20260501120537_events_org_id_backfill.ts`, and `tests/db/migrations/events-backfill.test.ts`. |

## IF NOT EXISTS Stance
Reject.

Visible pro: it enables this test architecture. The test comments state Phase 2 pre-creates `events`, and line 143 says the migration uses `CREATE TABLE IF NOT EXISTS` so the table is preserved; the migration grep confirms `IF NOT EXISTS` on `orgs` and `events` at lines 25 and 35.

Visible con: production migration DDL no longer fails at the `CREATE TABLE` step when `orgs` or `events` already exists. That changes failure semantics in production migration code to satisfy a test harness. Whether later statements catch every possible pre-existing schema mismatch is not verifiable from the diff. Prefer fail-loud migration DDL and adjust the test harness instead of weakening production create-table checks.

## Summary
Blocker 1 is fixed in the observable diff: `ormA`/`ormB` are gone, one ORM instance runs auth first, Phase 2 inserts the null-org row before the backfill migration, and Phase 4 asserts both zero null-org rows and the original row's org id. Overall verdict remains fail because the review spec asked for no raw SQL outside Phase 2, but Phase C still executes raw `explain ${sql}` at line 437; Phase 2 comments also do not cite C6 per raw call; and the `IF NOT EXISTS` production migration change should be rejected because it changes fail-loud DDL semantics for test setup.

## Detailed Findings

### Blocker 1 — Migrator Backfill Path
PASS. Grep found no `ormA` or `ormB` symbols in `tests/db/migrations/events-backfill.test.ts`. Grep found one shared `orm` declaration and one `MikroORM.init` (`let orm` line 109, `MikroORM.init` line 116). Flow ordering is observable: auth-only migration at lines 118-120, Phase 2 setup and null insert at lines 123-153, precondition count at lines 157-163, events migration at lines 167-172, Phase 4 assertions at lines 291-308.

### Raw SQL Carve-Out
FAIL as written. Phase 2 contains exactly four `await conn.execute` setup calls, and the block has C6 documentation at lines 124-127. But the per-call comments at lines 130-143 do not each cite C6, while line 148 does. Also, raw `explain` runs outside Phase 2 at line 437. Observable limit: grep shows no extra lower-case DDL/INSERT strings outside Phase 2, only the raw EXPLAIN probe.

### Migration DDL
CHANGES_REQUIRED. `IF NOT EXISTS` was added to both production `CREATE TABLE` statements (`orgs` line 25, `events` line 35). This supports the Phase 2 pre-creation test path, but it also makes existing tables a no-op at those create statements. Reject this migration change; keep production DDL fail-loud and move test-specific setup elsewhere.

### Scope Guards
PASS. `transactional: false` and `allOrNothing: false` grep only to the test file, not `src/db/mikro-orm.config.ts`. The suspected `explain-probe-test.test.ts` is absent from tracked files and absent from commit tree. Touched files match the allowed list.
