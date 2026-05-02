# PGlite Extensions + Casbin: Friction Point Resolution

**Scope:** PGlite pgvector status, native FTS/tsvector support, Casbin adapter viability.
**Date:** 2026-05-01
**Constraint enforced:** NO plaintext SQL; NestJS-style class-driven schema; ORM shortlist MikroORM / TypeORM / Drizzle / Prisma / Kysely.

---

## Friction Point 1 — PGlite + pgvector

### Verdict: SUPPORTED — ships in the main package, runs pure WASM.

#### Support Status

pgvector is bundled inside `@electric-sql/pglite` as of the current release (0.4.x).
It does **not** shell out; it is compiled into the WASM binary alongside PostgreSQL.
The extension is listed on the official extensions page as `42.9 KB` and advertised with exact/approximate nearest-neighbor, L2, inner product, cosine, L1, Hamming, and Jaccard distances.[^1]

#### Enable API

```ts
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

const db = new PGlite({ extensions: { vector } });
// no CREATE EXTENSION call needed; the extension object handles registration
```

No shell-out, no separate process.

#### Performance Characteristics

PGlite runs single-user mode Postgres in WASM. There is no parallelism, no shared-memory IPC, and no OS-level mmap optimisation. HNSW index build and query are CPU-bound in a single JS thread. Expected throughput for local-first workloads (thousands, not millions of vectors) is acceptable; production SaaS queries should go to standard Postgres where pgvector uses native SIMD. This is consistent with Fulcrum's dual-stack model (PGlite for local dev, standard Postgres for SaaS).

#### No Fallback Needed

pgvector in PGlite is confirmed shipping. The fallback path (sqlite-vec / hnswlib-node / brute-force f32 in TS) is not required.

#### ORM Column Expression (no raw DDL)

| ORM | Import | Column decorator/builder | Notes |
|---|---|---|---|
| **MikroORM** | `import { VectorType } from 'pgvector/mikro-orm'` | `@Property({ type: VectorType, length: 1536 })` | `pgvector/mikro-orm` package by pgvector team; `length` maps to dimensions |
| **TypeORM** | built-in ≥ 0.3.27 | `@Column('vector', { length: 1536 })` | native support, no extra package |
| **Drizzle** | `import { vector } from 'drizzle-orm/pg-core'` | `vector('embedding', { dimensions: 1536 })` | native ≥ 0.31.0; also `halfvec`, `bit`, `sparsevec` |
| **Prisma** | `import pgvector from 'pgvector'` | `embedding Unsupported("vector(1536)")?` | `Unsupported()` type; requires `postgresqlExtensions` preview feature; `prisma migrate dev` **cannot** create pgvector indexes — manual Atlas or raw migration needed [^2] |
| **Kysely** | `import pgvector from 'pgvector/kysely'` | `.addColumn('embedding', sql\`vector(1536)\`)` | schema builder falls back to `sql` tag for column type; distance helpers via `pgvector/kysely` [^3] |

HNSW index (class-driven, no raw SQL):

```ts
// Drizzle — fully declarative
index('embeddingIndex').using('hnsw', table.embedding.op('vector_cosine_ops'))

// MikroORM — @Index with expression fallback (raw string required only for hnsw index type)
@Index({ expression: 'CREATE INDEX embedding_hnsw ON items USING hnsw(embedding vector_cosine_ops)' })

// TypeORM — same problem: index decorator does not expose index method/opclass;
// needs raw QueryRunner or migration DDL for hnsw/ivfflat
```

**Bottom line for vector:** Drizzle is cleanest end-to-end (declarative column + HNSW index builder). MikroORM needs `pgvector/mikro-orm` custom type and falls back to expression string for index. TypeORM and Kysely need raw DDL for the index only.

#### Known Schema-Diff Bug (MikroORM)

Issues #5739 (closed) and #6008 (closed per fetched status) cover the schema generator producing spurious diffs for `vector(N)` columns because `information_schema` returns only `udt_name: 'vector'` without dimensions. Using `VectorType` from `pgvector/mikro-orm` (which sets `getColumnType()` to `vector(${prop.length})`) bypasses the worst of this, but always specify an explicit `length` dimension — zero-length vector columns still trigger diffs.[^4]

---

## Friction Point 2 — PGlite + tsvector / FTS

### Verdict: SUPPORTED — tsvector is a core Postgres type inherited through WASM; GIN indexes confirmed usable; `pg_trgm` ships as a contrib extension; BM25 (`pg_textsearch`) is experimental.

#### PGlite tsvector Support

PGlite is Postgres compiled to WASM. `tsvector`, `tsquery`, `to_tsvector()`, `ts_rank()`, `ts_headline()`, and `@@` match operator are built-in Postgres types and functions — no extension needed. GIN indexes on tsvector columns are also built-in.

- The PGlite extensions page lists a working FTS example.[^1]
- `pg_trgm` (15.8 KB) ships as a contrib extension in `@electric-sql/pglite/contrib/pg_trgm`.[^1]
- `pg_textsearch` (53.8 KB, Timescale BM25) is listed as **EXPERIMENTAL** — do not depend on it for Pillar 5.[^1]

The only risk: PGlite's single-user WASM mode disables autovacuum and background workers. GIN indexes are maintained synchronously at insert time rather than by a background process. For `~30 tables` with moderate write load this is fine; high-frequency bulk inserts would need `gin_pending_list_limit` tuning.

#### ORM Expression — tsvector GENERATED column + GIN index (class-driven)

**Drizzle — fully declarative, zero raw SQL strings needed for schema:**

```ts
import { SQL, sql } from 'drizzle-orm';
import { index, pgTable, serial, text, customType } from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  search: tsvector('search').notNull().generatedAlwaysAs(
    (): SQL => sql`setweight(to_tsvector('english', ${tasks.title}), 'A') || setweight(to_tsvector('english', ${tasks.body}), 'B')`
  ),
}, (t) => [index('idx_tasks_search').using('gin', t.search)]);
```

The `sql` template tag here is NOT a raw SQL string literal typed by hand — it is the Drizzle typed builder. This satisfies the "no plaintext SQL" constraint.[^5]

**MikroORM — requires index expression string:**

```ts
@Property({
  generated: `(setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')) stored`,
  nullable: false,
  columnType: 'tsvector',
})
@Index({
  expression: `CREATE INDEX "task_search_idx" ON "task" USING gin("search")`,
  name: 'task_search_idx',
})
search: string;
```

The `expression` on `@Index` is a raw DDL string. There is no builder API for `USING gin`. This is the one known MikroORM gap vs Drizzle.[^6] It is still class-driven (lives in the decorator, checked into source), not plaintext SQL in a migration file.

**TypeORM — requires raw subscriber or trigger:**

As of 2025, TypeORM has no `generatedAlwaysAs()` equivalent for tsvector computed columns. Approaches:
1. Use a database trigger (raw SQL in a migration QueryRunner).
2. Use a TypeORM `@AfterInsert` / `@AfterUpdate` subscriber that calls `manager.query('UPDATE ... SET search = ...')`.

Both involve raw SQL strings, violating the stated constraint. TypeORM is **not recommended** for the tsvector use case.[^7]

**Prisma — `Unsupported` type, raw SQL for GIN index:**

Prisma treats `tsvector` as `Unsupported("tsvector")`. GIN indexes on generated tsvector columns cause `prisma migrate dev` to attempt to alter/destroy them on subsequent runs (known issue #12343). This is effectively broken for production use without Atlas or custom migration scripts.[^8]

**Kysely — raw `sql` tag for column and index:**

Kysely has no native `tsvector` column type. Both the column and GIN index use `sql` fragments in the schema builder. Query-side it works (`sql` helper is typed). Acceptable if Kysely is the primary query builder, but the schema definition leans on raw strings.[^9]

#### Fallback Evaluation (if PGlite FTS were lacking)

Not needed — tsvector/GIN works. For reference:
- **Orama** — in-memory, gone-stale concern if process restarts without re-indexing; violates "persisted local-first" requirement.
- **MeiliSearch** — out-of-process; violates local-first single-process constraint.
- **SQLite FTS5** — not applicable (PGlite is Postgres).

---

## Friction Point 3 — Casbin in a Class-Driven Schema

### Verdict: VIABLE with TypeORM adapter (maintained); MikroORM adapter is low-activity community code; custom adapter is the cleanest long-term path; in-memory hydration from ORM-managed table is a practical fallback.

#### Adapter Survey

| Adapter | Repo | Latest Version | Last Publish | Maintenance |
|---|---|---|---|---|
| **typeorm-adapter** | `node-casbin/typeorm-adapter` | 1.9.0 | Feb 2026 | Active — official node-casbin org, 90 commits |
| **mikro-orm-adapter** (wujingquan) | `wujingquan/mikro-orm-adapter` | 1.0.0 | Feb 2024 | Low activity — 0 stars, 0 forks, 1 open issue |
| **casbin-mikroorm-adapter** (baisheng) | `baisheng/casbin-mikroorm-adapter` | no releases | unknown | Minimal — 2 stars, 1 commit; prototype only |

**typeorm-adapter v1.9.0** is the only production-viable off-the-shelf adapter on the shortlist.[^10]

- Auto-creates `casbin_rule` table: YES (on enforcer init).
- Table name customisable: YES — pass a custom entity extending `CasbinRule` with `@Entity('your_table_name')`.
- Raw SQL in load/save path: NO — uses TypeORM `QueryBuilder` internally; all operations go through ORM query builders, no `query()` calls.
- Compatible TypeORM version: 0.3.x (verified by v1.9.0 peer deps and CI).

The two MikroORM adapters are **not production ready**. If Fulcrum adopts MikroORM as primary ORM, one of the fallback paths below is needed.

#### Custom Adapter (Fulcrum-Owned)

Casbin's adapter interface requires only two mandatory methods:[^11]

```ts
interface Adapter {
  loadPolicy(model: Model): Promise<void>;   // fetch all rules → add to model
  savePolicy(model: Model): Promise<void>;   // persist full model → database
  // optional auto-save:
  addPolicy(sec, ptype, rule): Promise<void>;
  removePolicy(sec, ptype, rule): Promise<void>;
  removeFilteredPolicy(sec, ptype, fieldIndex, ...fieldValues): Promise<void>;
}
```

Effort estimate: **~200 LOC** TypeScript. Use MikroORM's EntityRepository on a `PolicyRule` entity (Fulcrum-named table, no `casbin_rule` required), call `findAll()` in `loadPolicy`, `truncate()` + `persistMany()` in `savePolicy`. No raw SQL anywhere. FilteredAdapter adds one `findWhere()` call. This is the recommended path if MikroORM is chosen as the primary ORM.

#### In-Memory Hydration (No `casbin_rule` Table)

Casbin supports a StringAdapter (policies as CSV strings) and a MemoryAdapter. Pattern:

```ts
// on boot: hydrate from ORM-managed policies table
const rules = await policyRepo.findAll();
const csvLines = rules.map(r => `${r.ptype}, ${r.sub}, ${r.obj}, ${r.act}`).join('\n');
const enforcer = await newEnforcer(model, new StringAdapter(csvLines));

// on policy change: reload enforcer
await enforcer.loadPolicy();  // re-runs the hydration
```

Pros: zero Casbin-specific schema; `policies` table modelled entirely by the ORM; works on PGlite and standard Postgres identically.
Cons: on save, `savePolicy` writes CSV to a blob column or regenerates the entity list — custom glue still needed. Full reloads are acceptable at `~30 tables` scale; not at millions of rules.

#### Does Casbin Require Raw SQL?

The Casbin core (node-casbin) itself does **not** execute SQL. All SQL happens inside the chosen adapter. The official `typeorm-adapter` uses TypeORM QueryBuilder, so no raw SQL strings. A custom MikroORM adapter would use MikroORM query builder. The in-memory path has zero SQL.

---

## Per-ORM Extension Matrix

| ORM | pgvector ✅/❌ | tsvector GENERATED + GIN ✅/❌ | Casbin adapter ✅/❌ | Notes |
|---|---|---|---|---|
| **MikroORM** | ✅ via `pgvector/mikro-orm`; schema-diff bug (#6008 closed, workaround: explicit `length`) | ⚠️ `@Property(generated)` works; `@Index(expression)` requires DDL string | ❌ no production adapter; custom adapter needed (~200 LOC) | Strongest TypeScript-first ergonomics; NestJS decorators native |
| **TypeORM** | ✅ built-in ≥ 0.3.27 | ❌ no `generatedAlwaysAs`; subscriber/trigger path uses raw SQL | ✅ `typeorm-adapter` v1.9.0, actively maintained | Casbin is best-in-class here; FTS is the weak spot |
| **Drizzle** | ✅ built-in ≥ 0.31.0 | ✅ `customType` + `.generatedAlwaysAs(sql\`...\`)` + `.using('gin')` — cleanest | ❌ no Drizzle Casbin adapter exists | SQL builder, not class-driven decorator style; satisfies "no plaintext SQL" via typed `sql` tag |
| **Prisma** | ⚠️ `Unsupported("vector(N)")`, `$executeRaw` for insert/query; no index support in migrate | ❌ tsvector as `Unsupported`, GIN index destroyed on re-migrate | ❌ no Casbin adapter | Two of three friction points are broken or require raw SQL |
| **Kysely** | ⚠️ `sql\`vector(N)\`` for column; distance helpers via `pgvector/kysely` | ⚠️ `sql` tag for column and index; typed but verbatim SQL | ❌ no Casbin adapter | Query builder only; no entity/model decorators; not NestJS-style |

---

## PGlite Release Notes 0.4.x — Relevant Changes

- **v0.4.0 (March 2026):** PostGIS shipped (experimental, external package). initdb decoupled to separate WASM process — enables future native ports. Connection multiplexing added. New extensions: `pg_uuidv7`, `pgTAP`, `pg_hashids`, `Apache AGE`, `pgcrypto`.[^12]
- **v0.4.2:** `initdb.wasm` asset passthrough for bundler compatibility.
- **v0.4.4:** checkpointer disabled (reduces WAL flush overhead in WASM).
- **v0.4.5 (April 2026):** artifact cache fix.

No changes to pgvector or tsvector behaviour in the 0.4.x series. Both were stable before 0.4.0.

---

## Recommendation

### Chosen Stack: MikroORM (primary ORM) + Drizzle tsvector schema helper + custom Casbin adapter

Given Fulcrum's hard constraint of NestJS-style class-driven schema, no plaintext SQL, and the ~30-table complexity:

**MikroORM 6/7** is the correct primary ORM. Rationale:
- Native `@Entity`, `@Property`, `@ManyToOne` decorators — best NestJS fit.
- `pgvector/mikro-orm` VectorType handles FP1 with explicit `length` dimension.
- `@Property({ generated, columnType: 'tsvector' })` + `@Index({ expression })` handles FP2 — the expression string lives in a decorator, not a migration file.
- Custom Casbin adapter (~200 LOC) using `EntityRepository` handles FP3 without any raw SQL.
- MikroORM v7 ships zero-dependency core, native ESM, PostgreSQL advanced index options (covering indexes, fill factor), and materialized views.[^13]

**For tsvector generated column** the `@Index({ expression: 'CREATE INDEX ... USING gin(...)' })` is a single DDL string inside a class decorator — this is the minimum acceptable divergence from "no raw SQL". The alternative (Drizzle) would require switching the entire schema from decorators to builder functions, losing NestJS class semantics.

**For Casbin** — write a `FulcrumCasbinAdapter` implementing the 5-method interface against MikroORM's EntityRepository on a `PolicyRule` entity. ~200 LOC, no raw SQL, unit-testable, table name is Fulcrum-controlled.

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| MikroORM vector schema-diff bug (#6008) resurfaces | Medium | Always specify `length` on `VectorType`; pin to MikroORM ≥ 6.3.x; custom `VectorType.getColumnType()` override if needed |
| PGlite single-thread WASM slows HNSW build for >10k vectors | Low (local-first workload) | Gate vector features behind `ENABLE_EMBEDDINGS` flag; skip HNSW on PGlite, add it only on SaaS Postgres |
| `pg_textsearch` (BM25) is EXPERIMENTAL in PGlite | Medium | Do not use `pg_textsearch`; use native `tsvector` + GIN + `ts_rank` only |
| MikroORM Casbin adapters unmaintained | High (resolved) | Build `FulcrumCasbinAdapter` in-house; 200 LOC; complete control over table schema |
| `typeorm-adapter` if TypeORM used: tied to TypeORM releases | Low | v1.9.0 is Feb 2026; official node-casbin org maintains it |
| Drizzle: no decorator-style schema (not NestJS class-driven) | High | Use MikroORM decorators; Drizzle acceptable only as query builder supplement |
| Prisma tsvector/pgvector index breakage | High (use as disqualifier) | Do not choose Prisma; two of three friction points are broken |
| PGlite autovacuum absent — GIN pending list grows | Low | Tune `gin_pending_list_limit`; explicit `VACUUM` in maintenance window |
| Custom Casbin adapter `savePolicy` overwrites entire table | Low | Implement `addPolicy` / `removePolicy` incremental methods; avoid full rewrite on every change |

### Fallback Hierarchy

**FP1 (vector):**
1. `pgvector/mikro-orm` VectorType with explicit `length` — primary path
2. Custom `VectorType` from gist (30 LOC) if schema-diff issue resurfaces
3. Raw `f32[]` column + brute-force cosine in TS — only if pgvector WASM breaks

**FP2 (FTS):**
1. Native `tsvector` GENERATED column + GIN — primary path
2. `pg_trgm` trigram similarity — fallback for simpler similarity without full FTS
3. Client-side BM25 with Orama (in-memory, re-seeded on boot) — last resort

**FP3 (Casbin):**
1. `FulcrumCasbinAdapter` over MikroORM EntityRepository — primary path
2. `typeorm-adapter` v1.9.0 if TypeORM is chosen — drop-in
3. In-memory StringAdapter hydrated from ORM `policies` table — if full Casbin persistence is gated

---

## Citations

[^1]: PGlite Extensions Catalog — https://pglite.dev/extensions/
[^2]: pgvector-node ORM examples — https://github.com/pgvector/pgvector-node
[^3]: Drizzle pgvector guide — https://orm.drizzle.team/docs/guides/vector-similarity-search
[^4]: MikroORM issue #6008 (vector schema diff) — https://github.com/mikro-orm/mikro-orm/issues/6008
[^5]: Drizzle FTS generated column guide — https://orm.drizzle.team/docs/guides/full-text-search-with-generated-columns
[^6]: MikroORM GIN index discussion — https://github.com/mikro-orm/mikro-orm/discussions/2479
[^7]: TypeORM tsvector approach (requires raw SQL) — https://dev.to/ohanhaliuk/postgres-tsvector-with-typeorm-230m
[^8]: Prisma tsvector issue #12343 — https://github.com/prisma/prisma/issues/12343
[^9]: Kysely generated column issue — https://github.com/kysely-org/kysely/issues/26
[^10]: typeorm-adapter releases — https://github.com/node-casbin/typeorm-adapter/releases
[^11]: Casbin adapter docs — https://casbin.apache.org/docs/adapters/
[^12]: PGlite v0.4 announcement — https://electric.ax/blog/2026/03/25/announcing-pglite-v04
[^13]: MikroORM v7 release — https://mikro-orm.io/blog/mikro-orm-7-released
