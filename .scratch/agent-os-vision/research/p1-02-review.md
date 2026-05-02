# P1#02 Review — ae55db7

SPEC: FAIL
QUALITY: CHANGES_REQUIRED

## Summary

Commit adds Org/Event entities, repos, DI bindings, config registration, migration, and 17 passing tests. Entity/repo wiring mostly matches scope. Spec fails on migration shape and acceptance coverage: tests do not run the migration, do not create a pre-migration `Event` without `org`, and do not assert `EXPLAIN` uses `Index Scan`. Migration also implements greenfield table creation with `org_id NOT NULL` from creation, not the specified add-column -> backfill -> NOT NULL flip flow.

## Top Findings

1. **CONFIRMED**: `tests/db/migrations/events-backfill.test.ts` does not test migration runner, pre-migration nullable-org row, or EXPLAIN. It uses `orm.schema.create()` at line 51 and only counts null-org rows at line 214; no `getMigrator`, `getConnection`, `explain`, or QueryBuilder path is visible in diff.
2. **CONFIRMED**: Migration ordering diverges from P1#02. `Migration20260501120537_events_org_id_backfill.ts:32` creates `events.org_id` as NOT NULL immediately, then line 40 runs raw update. No column-add -> backfill -> NOT NULL flip sequence visible.
3. **CONFIRMED**: Event index decorators do not encode `createdAt desc`. `Event.ts:31` and `Event.ts:36` use plain `properties` arrays only; migration SQL has DESC at migration lines 53 and 56, so decorator metadata can pass while losing order semantics.

## Per-File Scope Check

| file | expected | present | verdict |
|---|---|---|---|
| `.scratch/agent-os-vision/01-foundation-reset/issues/02-events-org-id-backfill.md` | status/claim metadata only | `Status: needs-review`, owner/timestamps | PASS |
| `src/db/db.module.ts` | bind OrgRepository/EventRepository subclasses | subclass tokens bound at lines 79 and 105 | PASS |
| `src/db/entities/auth/Org.ts` | Org entity for tenant root | `@Entity`, uuid PK, slug unique, nullable avatar, timestamps | PASS |
| `src/db/entities/auth/index.ts` | export Org | `export { Org }` | PASS |
| `src/db/entities/core/Event.ts` | Event org/user FKs + composite indexes | FK decorators present; DESC order missing from decorators | PARTIAL |
| `src/db/entities/core/index.ts` | export Event | `export { Event }` | PASS |
| `src/db/migrations/Migration20260501120537_events_org_id_backfill.ts` | generated migration plus backfill sequence | creates new `orgs`/`events`; no NOT NULL flip sequence | FAIL |
| `src/db/mikro-orm.config.ts` | register Org/Event | entity list includes both | PASS |
| `src/db/repositories/auth/OrgRepository.ts` | custom subclass | extends `EntityRepository<Org>` at line 16 | PASS |
| `src/db/repositories/auth/index.ts` | export OrgRepository | present | PASS |
| `src/db/repositories/core/EventRepository.ts` | custom subclass | extends `EntityRepository<Event>` at line 15 | PASS |
| `src/db/repositories/core/index.ts` | export EventRepository | present | PASS |
| `tests/db/migrations/events-backfill.test.ts` | 17 tests including migrator + EXPLAIN | 17 tests present; key acceptance paths absent | FAIL |

## Acceptance Criteria Verification

| criterion | evidence | verdict |
|---|---|---|
| `Event.org` non-null ManyToOne + `Event.user` nullable ManyToOne | `Event.ts:48`, `Event.ts:54` | PASS |
| New composite indexes reflected in metadata | names tested at test lines 144 and 152 | PARTIAL |
| Index order `(created_at desc)` | decorators use plain properties at `Event.ts:31` and `Event.ts:36` | FAIL |
| Migration: add column -> backfill -> NOT NULL flip + FK + indexes | `events` created with NOT NULL at migration line 32; backfill at line 40 | FAIL |
| Backfill only rows where org is null | `where "org_id" is null` at migration line 40 | PASS |
| `MikroORM.getMigrator().up(...)` succeeds | no migrator use visible in changed tests | FAIL |
| Web surface N/A | no web files in commit name list | PASS |
| CLI command N/A | no CLI files in commit | PASS |
| TUI screen N/A | no TUI files in commit | PASS |
| Tests include pre-migration Event without org + flush | test always creates Event with `org` at line 169; null-org count only at line 214 | FAIL |
| EXPLAIN Index Scan test | no `EXPLAIN`/`getConnection`/QueryBuilder visible; comment claim only at test line 8 | FAIL |

## C6 Sweep Result

**PASS** outside migration: no raw SQL found in changed non-migration source/test files. Schema setup uses `orm.schema.create()` at test line 51.

**PARTIAL** inside migration: raw SQL is confined to migration lines 21–70, which is the C6 migration carve-out area. However, auto-generated vs hand-written cannot be confirmed from diff. **HYPOTHESIS**: comments and greenfield create-table shape suggest hand-crafted migration rather than generated diff plus one manual backfill insertion. If hand-crafted, this violates the spirit of C6 (decorators should drive the DDL, migration just captures the diff).

## DI Binding Sanity

**PASS**. `OrgRepository` and `EventRepository` are custom subclasses, not base tokens: `OrgRepository.ts:16`, `EventRepository.ts:15`. `db.module.ts` binds both via `em.getRepository(Org)` and `em.getRepository(Event)` at lines 79 and 105.

## P1#04 Web Layout Revert

No `src/web` or `+layout` files are present in `git show ae55db7 --name-only`. Verdict: scoped correctly for P1#02; any P1#04 revert either landed in an earlier commit or was not part of this diff.

## Decision Flags

| flag | verdict | reason |
|---|---|---|
| Greenfield `events` table instead of backfill | push back / promote to DECISIONS addendum | Spec says existing Event + add column; implementation may be pragmatic (branch has no prior Event) but needs explicit issue/decision update to close the terminology gap. |
| Raw `addSql UPDATE` instead of `em.nativeUpdate` | push back | P1#02 text asks for `em.nativeUpdate`; migration line 40 is raw UPDATE. Minor but violates letter of spec. |
| DESC only in migration SQL, not decorator metadata | push back | Decorator-driven clean snapshot requires order semantics in metadata. Current decorators omit DESC. |
| Adding Org in this commit | accept | Commit title/scope includes Org; Event FK requires it. |

## Open Questions

1. Was `Event` intentionally greenfield in this branch? If yes, update P1#02/Q23 wording so reviewers stop expecting a retro-add backfill flow.
2. Should `createdAt desc` be represented with decorator `expression` metadata to keep future snapshots clean?
3. Must the backfill use `this.getEntityManager().nativeUpdate(...)`, or is `addSql(update...)` acceptable under C6?
4. Should tests be rewritten to use real migrator flow, or is schema-generator metadata coverage enough for greenfield P1#02?
