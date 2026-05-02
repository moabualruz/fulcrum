# Synthesis — No-Plaintext-SQL Stack Decision

**Date:** 2026-05-01
**Prepared by:** claude-orchestrator (synthesizing 7 parallel research streams)
**Status:** awaiting-user-decision (gates all further work)

---

## Inputs (all in `.scratch/agent-os-vision/research/`)

1. `orm-mikro-typeorm.md` — Claude: TypeORM + MikroORM matrix, recommends MikroORM v7
2. `orm-drizzle-prisma-kysely.md` — Codex: Drizzle + Prisma + Kysely matrix, recommends Kysely (strict) / Drizzle (PGlite)
3. `sql-sweep-manifest.md` — 437 plaintext-SQL refs across 119 scratch files needing rewrite
4. `orm-mikro-typeorm.review.md` — Codex adversarial review: SPEC FAIL until user clarifies "no plaintext SQL" scope
5. `di-decorators-bun.md` — DI candidates tested live on Bun 1.3.13: needle-di primary, inversify v8 + NestJS standalone fallback
6. `pglite-extensions-casbin.md` — pgvector ✅, tsvector ✅; Prisma + TypeORM disqualified for FTS; Casbin needs custom adapter regardless of ORM
7. `migration-body-sql.md` — Migration class bodies emit raw SQL strings in MikroORM + TypeORM; Drizzle + Prisma emit `.sql` files; Kysely uses pure query-builder

---

## What survived the elimination round

| ORM | PGlite | FTS | pgvector | Casbin | Migration body | Decorators | Verdict |
|---|---|---|---|---|---|---|---|
| **MikroORM v7** | community (PR #7622 draft) | DDL string in `@Index({expression})` | `pgvector/mikro-orm` VectorType | custom 200 LOC adapter | raw SQL strings in `addSql()` | yes (ES + legacy modes) | LENIENT only |
| **TypeORM 0.3.x** | community (closed "not planned") | breaks on re-migrate | native `@Column('vector')` | official `typeorm-adapter` | raw SQL strings in `queryRunner.query()` | yes (legacy only) | DISQUALIFIED (FTS) |
| **Drizzle** | first-class | cleanest via `customType` + `.using('gin')` | native ≥ 0.31.0 | none | `.sql` files emitted by drizzle-kit | no | LENIENT-with-gitignore only |
| **Prisma** | community-only | broken on re-migrate | none | none | `.sql` files emitted by prisma migrate | no (.prisma DSL) | DISQUALIFIED (FTS + DSL not classes) |
| **Kysely** | community `kysely-pglite` | tagged-template `sql\`…\`` for advanced bits | tagged-template | custom adapter | pure query-builder (zero SQL strings) | no | STRICT-pass |

---

## Three interpretations of "no plaintext SQL"

### Tier A — STRICT-STRICT
*No SQL string content anywhere, including tagged-template literals or DDL strings inside decorator options.*
- **Impossible** with current tooling for full Postgres feature set Fulcrum needs (FTS GENERATED columns, GIN/HNSW, CHECK, partial indexes, CREATE EXTENSION).
- Would require building a custom DDL DSL — measured in months of foundation work before any pillar starts.
- **Not recommended.** Estimated 4–6 weeks of pre-work plus permanent maintenance burden.

### Tier B — STRICT
*No SQL string literals in `.ts`/`.js` source files. No `.sql` files in repo. Tagged-template literals tolerated as escape hatch (because they're TS, with parameter binding).*
- **Only Kysely qualifies.**
- Trade-offs:
  - No decorators on entities (loses NestJS aesthetic — repositories are plain `@Injectable()` classes wrapping query builder).
  - Tagged templates needed for: `CREATE EXTENSION vector`, `tsvector GENERATED ALWAYS AS (…) STORED`, `CREATE INDEX … USING gin`, `CREATE INDEX … USING hnsw`, partial indexes, CHECK constraints with complex expressions.
  - DI pick: needle-di (7KB, Stage-3) or inversify v8.

### Tier C — LENIENT
*No `.sql` files committed to repo. ORM-generated migration class bodies that contain SQL strings tolerated. Ad-hoc SQL strings in production app code remain forbidden.*
- **MikroORM v7** primary — closest to NestJS DX.
- **Drizzle** alternative — better PGlite story, but requires `.gitignore drizzle/` and CI-only generation.
- DI pick: needle-di (MikroORM v7 ES decorator mode) or NestJS standalone (`createApplicationContext`).
- Carve-out required in `DECISIONS.md` documenting the sanctioned escape hatch.

---

## Recommendation matrix

| If user values… | Pick |
|---|---|
| NestJS aesthetic + full Postgres features + minimum sweep churn | **Tier C → MikroORM v7 + needle-di** |
| Strict no-SQL-strings rule + accept plain-function repository style | **Tier B → Kysely + needle-di + custom decorator wrappers** |
| Strict-strict purism (no SQL anywhere at all) | **Not feasible — abandon constraint or build DSL** |

---

## Cost-of-change estimate (sweep + rebuild)

Per `sql-sweep-manifest.md`: 437 refs across 119 files, ~9 weeks of doc rewrite.

If Tier B (Kysely) is picked:
- Sweep cost: same 9 weeks (no extra savings)
- Plus: ~2 weeks building the decorator-class wrapper layer over Kysely if NestJS aesthetic is also wanted
- Plus: ~1 week building custom Casbin adapter against Kysely query builder

If Tier C (MikroORM) is picked:
- Sweep cost: same 9 weeks
- Plus: ~1 week MikroORM PGlite spike (Bun + driver compat)
- Plus: ~1 week custom Casbin adapter against MikroORM EntityRepository
- Plus: PR #7622 close-watch (or stay on community `mikro-orm-pglite` indefinitely)

Both paths require comparable foundation effort. The differentiator is purely the SQL-rule strictness + decorator aesthetic.

---

## Failure gates (per Fulcrum C3)

### If Tier C (MikroORM) chosen and PGlite driver fails Bun spike:
- 2nd choice: switch to TypeORM (lose FTS — punt FTS to 2nd choice Orama in-memory until pgvector matures)
- 3rd choice: drop to Tier B / Kysely

### If Tier B (Kysely) chosen and tagged-template count grows beyond ~20 occurrences:
- 2nd choice: introduce a `Ddl` builder class that wraps the tagged-template content into a typed builder (no improvement to user but moves SQL out of migration files)
- 3rd choice: drop to Tier C / MikroORM, accepting carve-out

---

## Single decision needed from user

**Pick one tier (A / B / C) for the no-plaintext-SQL rule.**

If A: orchestrator must build a custom DDL DSL before anything else lands. Estimate +6 weeks before first migration possible.
If B: Kysely + needle-di lock; tagged-template carve-out documented in DECISIONS.md; sweep all 17 PRDs to remove decorator-style references.
If C: MikroORM v7 + needle-di lock; ORM-generated SQL-in-TS carve-out documented in DECISIONS.md; sweep 17 PRDs to replace `.sql`-file references with class-migration references.

After tier locked, orchestrator runs the parallel sweep across all 17 PRDs + 341 issues (≤ 6 subagents) to align docs, then resumes Wave 1 implementation.
