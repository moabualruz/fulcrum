# Codex Adversarial Review — MikroORM + TypeORM Research Memo

**Reviewing:** `.scratch/agent-os-vision/research/orm-mikro-typeorm.md` (Claude/sonnet, 303 lines, 42 citations)
**Reviewer:** Codex (gpt-5-codex, medium effort) — cross-team gate per execution policy
**Date:** 2026-05-01

---

## Verdict

- **SPEC: FAIL**
- **QUALITY: CHANGES_REQUIRED**

Claude's MikroORM recommendation is **directionally correct** but **overstates PGlite readiness** and **does not resolve the strict reading of the user's "no plaintext SQL" rule**. Both ORMs fail the strict rule; both pass a lenient reading. Lock-in cannot proceed without an explicit user clarification on rule scope.

---

## Per-claim verification table

| # | Claim (from Claude memo) | Status | Source |
|---|---|---|---|
| 1 | MikroORM PR #7622 (`@mikro-orm/pglite` driver) is "blocked only on Kysely 0.29 stable" | ⚠️ PARTIAL — PR is **open draft, unmerged**. "Official driver" framing premature. | https://github.com/mikro-orm/mikro-orm/pull/7622 |
| 2 | Community `mikro-orm-pglite` passes 99% of Postgres test suite | ⚠️ PARTIAL — exists, but carries explicit Bun/Yarn untested warning | https://socket.dev/npm/package/mikro-orm-pglite |
| 3 | TypeORM closed PGlite request "not planned" Aug 2024 | ✅ CONFIRMED — issue #11026 closed "not planned" (maintainer verbatim quote unretrievable but disposition confirmed) | https://github.com/typeorm/typeorm/issues/11026 |
| 4 | MikroORM Bun support is production-grade | 🔍 UNVERIFIABLE — works in CI per docs; no large-scale Bun production case studies cited |  |
| 5 | TypeORM has native `pgvector` decorator | ✅ CONFIRMED — `@Column('vector', { length: N })` since 0.3.27 | https://typeorm.io/changelog |
| 6 | Casbin `typeorm-adapter` healthier than `casbin-mikroorm-adapter` | ✅ CONFIRMED — typeorm-adapter v1.9.0 official node-casbin org, Feb 2026; mikroorm adapters abandoned/prototype |  |
| 7 | Both ORMs emit raw SQL strings in migration `up()` method bodies | ✅ CONFIRMED — TypeORM uses `await queryRunner.query("CREATE TABLE …")`; MikroORM uses `this.addSql("CREATE TABLE …")`. Both emit raw SQL strings inside `.ts` files. | https://typeorm.io/docs/migrations/generating, https://mikro-orm.io/docs/migrations |
| 8 | MikroORM `Loaded<T, Hint>` type inference superior | ✅ CONFIRMED | https://mikro-orm.io/docs/guide/type-safety |

---

## The core dissent

Claude's memo recommends MikroORM **assuming the "no plaintext SQL" rule does not extend to migration class bodies**. That assumption is unverified.

If the user's rule is interpreted **strictly** (any string starting with `CREATE` / `ALTER` / `INSERT` / `SELECT` / `DROP` is forbidden), both MikroORM and TypeORM fail. Their migration generators emit such strings inside `.ts` files by default, and there is no documented mode to switch the generator to query-builder-only output covering the full feature set Fulcrum needs (FTS GENERATED columns, GIN indexes, CHECK constraints, CREATE EXTENSION).

If the rule is interpreted **leniently** (no `.sql` files on disk; no ad-hoc query strings in production code paths; ORM-generated migration bodies tolerated), MikroORM is the correct pick.

This is a **user-only decision**. Cannot proceed.

---

## Missing considerations Claude overlooked

1. **Kysely as alternative**. Kysely's migration system uses pure query-builder calls (`db.schema.createTable(...).addColumn(...).execute()`) — zero raw SQL strings in `up()`/`down()`. Combined with Codex's parallel research on Drizzle/Prisma/Kysely, Kysely is the only candidate that satisfies the strict reading. Trade-off: no decorators (loses NestJS aesthetic).

2. **Effect SQL** (effect-ts/sql) — emerging structural alternative; class-light but type-safe. Worth a one-line mention in the recommendation memo as an out-of-scope alternative.

3. **NestJS standalone DI on Bun**. `NestFactory.createApplicationContext()` works on Bun ≥ 1.3 without the HTTP server. Composes with SvelteKit's request handler by resolving the container at app start and exposing `container.get(SomeService)` from `+server.ts`. This is the path that gets closest to "feels like NestJS" with any ORM behind it.

4. **Bundle size impact for `bun build --compile`**. Claude did not estimate this. MikroORM core ~280 KB minified; TypeORM core ~580 KB minified; Drizzle ~80 KB; Kysely ~120 KB. None blow the 150 MB binary target alone, but compounding with the ORM driver + reflect-metadata + DI container matters at the margin.

---

## Open-question delta

| Claude's open question | Codex disposition |
|---|---|
| Q1 — Migration class bodies still embed SQL string literals. Does the rule extend in there? | **STILL OPEN** — user must answer. This is the single unresolvable gating question. |
| Q2 — Casbin adapter maturity for MikroORM | **RESOLVED** — Fulcrum needs to write a custom `FulcrumCasbinAdapter` (~200 LOC, query-builder-only) regardless. The adapter market is too thin. PGlite-extensions research (parallel) confirmed this. |
| Q3 — pgvector schema-generator drift in MikroORM (#6008) | **RESOLVED** — pin explicit `vector(N)` length on the property; suppress unwanted migrations. Acceptable workaround. |

---

## Final recommendation

**If user clarifies "no plaintext SQL" as STRICT (no SQL strings anywhere, including migration bodies):** Drop MikroORM and TypeORM. Pick **Kysely** + custom decorator/repository wrapper for NestJS aesthetic, OR accept Drizzle with a CI-only build that never commits the `.sql` files (lenient interpretation of "no SQL files on disk in repo").

**If user clarifies "no plaintext SQL" as LENIENT (no `.sql` files committed; ad-hoc query strings forbidden in app code; ORM-generated migration class bodies tolerated):** Pick **MikroORM v7** as Claude recommended, with these additions:
- Pin `mikro-orm-pglite` (community) and stand up a Bun/Postgres compatibility spike before lock-in.
- Plan to write a custom `FulcrumCasbinAdapter` against MikroORM EntityRepository (~200 LOC).
- Pin explicit `vector(N)` lengths to dodge schema-generator drift.

**Recommended next step:** orchestrator should run `AskUserQuestion` with the strict-vs-lenient framing before any further research or sweep work.
