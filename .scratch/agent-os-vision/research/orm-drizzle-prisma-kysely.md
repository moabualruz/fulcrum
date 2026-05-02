## Comparison Matrix

| Axis | Drizzle ORM | Prisma | Kysely |
|---|---|---|---|
| Class-based/decorator entity definition (or wrapper feasibility) | No native `@Entity` / `@Column`; schema is TypeScript table objects. A decorator wrapper could collect class metadata and emit `pgTable(...)`, but this would be Fulcrum-owned infrastructure. No credible production decorator wrapper found in research [unverified]. Drizzle itself describes TypeScript schema/query usage, not class entities.[^drizzle-readme] | No classes/decorators. Canonical model source is `schema.prisma`, whose data model defines models and relations and generates Prisma Client types.[^prisma-schema-overview][^prisma-models] | No classes/decorators. Canonical model source is TypeScript table interfaces plus query-builder calls; Kysely markets itself as a type-safe SQL query builder, not an entity ORM.[^kysely-home][^kysely-github] |
| Repository + DI ergonomics (NestJS parity) | Good with custom repositories and Nest providers. Community `nestjs-drizzle` modules show DI by injection token, but listed as inactive on NestJS package index.[^nestjs-drizzle] | Best existing NestJS ergonomics. Prisma docs show `PrismaService extends PrismaClient`, `@Injectable()`, module providers, and service injection.[^prisma-nest] | Good but hand-rolled. Inject a `Kysely<DB>` or repository class; Kysely does not ship Nest integration, but its API is plain TypeScript and DI-friendly [unverified]. |
| Migration authoring (TS class? generated diff? `.sql` files emitted on disk?) | Canonical Drizzle Kit `generate` creates SQL migration files from TypeScript schema and `migrate` applies generated SQL files.[^drizzle-kit-overview][^drizzle-migrations] Drizzle Kit `push` applies schema directly, but it is not a class-based migration history.[^drizzle-kit-overview] No supported class migration mode found [unverified]. | Prisma Migrate generates `.sql` migration files and treats `prisma/migrations/*/migration.sql` as migration history/source of truth.[^prisma-migrate][^prisma-migration-history] No TS class migration mode. | Kysely migrations are TypeScript `Migration` objects with `up(db)` and optional `down(db)`, usually loaded by `FileMigrationProvider` from TS/JS files.[^kysely-migration][^kysely-file-provider][^kysely-migrator] No generated schema diff; authoring is manual query-builder code. |
| Bun 1.3+ runtime support | Drizzle states it works in Bun and has PGlite docs with Bun install snippets.[^drizzle-readme][^drizzle-pglite] | Prisma docs say Prisma ORM runs across Node.js, Bun, and Deno, with Bun commands in guides.[^prisma-intro] | Kysely states it runs in Bun and other JS environments.[^kysely-home][^kysely-github] |
| PGlite driver support (first-class vs community vs unsupported) | First-class official adapter: `drizzle-orm/pglite`; docs cover in-memory, directory-backed, and custom `PGlite` client.[^drizzle-pglite] | Community-maintained only. Prisma driver-adapter docs list PGlite under community-maintained adapters, not Prisma-maintained adapters.[^prisma-drivers] Packages like `pglite-prisma-adapter` and `prisma-pglite` exist.[^pglite-prisma-adapter][^prisma-pglite] | Community-maintained dialects. Kysely core allows custom dialects; `kysely-pglite` and `kysely-pglite-dialect` packages exist.[^kysely-dialect][^kysely-pglite][^kysely-pglite-dialect] |
| Postgres driver support | First-class PostgreSQL support through Drizzle's Postgres drivers; docs/README list PostgreSQL support.[^drizzle-readme][^drizzle-pglite] | First-class PostgreSQL support; Prisma docs use Postgres provider and `@prisma/adapter-pg` in current examples.[^prisma-nest][^prisma-drivers] | First-class `PostgresDialect` using `pg` Pool.[^kysely-postgres] |
| Dual-target same schema (PGlite + Postgres) | Strong for table/query schema because PGlite is Postgres-in-WASM and Drizzle uses same Postgres schema APIs; extension availability still must be checked per target.[^pglite-product][^drizzle-pglite] | Possible in theory with same `schema.prisma` provider `postgresql`, but PGlite path depends on community adapters/helpers and migration support is weaker.[^prisma-drivers][^prisma-pglite] | Possible with same DB interface and migrations if PGlite dialect behaves like Postgres; dependency is community dialect quality.[^kysely-dialect][^kysely-pglite] |
| FK + cascading + composite indexes | Strong. Drizzle supports foreign keys, `onDelete` / `onUpdate`, composite primary keys, and indexes through schema builder APIs.[^drizzle-relations][^drizzle-indexes] | Strong for ordinary relational schema. Prisma supports referential actions, composite IDs/unique constraints, and indexes.[^prisma-referential][^prisma-composite][^prisma-indexes] | Strong where expressible through schema builder. `CreateTableBuilder` supports foreign keys, composite FK constraints, primary/unique constraints; `CreateIndexBuilder` supports columns and `using(...)`.[^kysely-create-table][^kysely-create-index] |
| JSONB columns | Strong. Drizzle Postgres column docs include `jsonb` and `$type` for typed JSON payloads.[^drizzle-pg-columns] | Strong. Prisma maps `Json` to Postgres JSONB and supports GIN operator classes for JSONB indexes.[^prisma-indexes] | Type-level support through `JSONColumnType`; runtime column type must be set in migrations, often as `jsonb` data type string.[^kysely-json][^kysely-create-table] |
| `timestamptz` Date round-trip | Best fit for SvelteKit serialization: Drizzle timestamp column `mode: "string"` returns strings while still storing timestamps; `mode: "date"` returns Date objects.[^drizzle-timestamp] | Risk. Prisma `DateTime` / `@db.Timestamptz` is modeled through Prisma Client Date values [unverified]; no schema-level "return as string" mode found. Requires repository serializer or result mapper. | Risk. `ColumnType` can declare select type as `string` or `Date`, but runtime values come from the driver/dialect unless a plugin/mapper normalizes them.[^kysely-column-type] |
| FTS (`tsvector` + GIN) decorator/builder syntax | Partial. Drizzle guide uses custom `tsvector` type plus GIN index and generated columns; examples rely on Drizzle `sql` operator for generated expressions/query pieces, which conflicts with strict no raw SQL.[^drizzle-fts] | Poor for Postgres FTS. Prisma docs say function indexes such as `to_tsvector` are not yet supported/visible in Prisma schema; Postgres full-text support needs customized migrations/raw SQL.[^prisma-indexes][^prisma-extensions] | Partial. Kysely schema builder can add arbitrary data types and GIN indexes; expression/generated-column pieces usually need `sql` expressions, conflicting with no raw SQL.[^kysely-create-table][^kysely-create-index] |
| `pgvector` column type support | Strongest native builder support among three. Drizzle has `vector({ dimensions })` and pgvector index docs, but extension creation itself is not in schema and docs use custom SQL migration for `CREATE EXTENSION`, which violates hard rule unless extension install is externalized.[^drizzle-pgvector-doc][^drizzle-vector-guide] | Poor. Prisma docs say vector is represented as `Unsupported("vector")`; Prisma Client cannot use unsupported fields normally and docs recommend raw SQL/TypedSQL.[^prisma-extensions][^prisma-unsupported] | Partial. Can declare `vector(n)` as a migration data type if dialect accepts it; type/query helpers are Fulcrum-owned. Extension creation remains external or raw [unverified]. |
| Bundle size impact (`bun --compile`, target <150 MB) | Low risk. Drizzle README says ~7.4 kB min+gzip, tree-shakeable, zero dependencies; npm snapshot showed 10.4 MB unpacked.[^drizzle-readme][^drizzle-npm] Actual Bun compiled binary impact must be measured [unverified]. | Highest risk. npm snapshots showed `@prisma/client` around 76.9 MB unpacked and `prisma` CLI around 51.6 MB unpacked; Prisma v7 says Rust-free Prisma Client is default, reducing engine binary risk, but generated client plus adapters still need compile measurement.[^prisma-client-npm][^prisma-cli-npm][^prisma-changelog] | Low risk. Kysely says zero dependencies; npm snapshot showed 3.25 MB unpacked.[^kysely-home][^kysely-npm] Actual Bun compile impact must be measured [unverified]. |
| TypeScript inference quality | Strong. Drizzle schema infers select/insert types and is TypeScript-first.[^drizzle-readme][^drizzle-pg-columns] | Strongest generated-client ergonomics for CRUD; Prisma docs emphasize generated TypeScript types and type-safe queries.[^prisma-models][^prisma-nest] | Strong query inference. Kysely README states it infers visible tables/columns, aliases, selected columns, joins, subqueries, and CTEs.[^kysely-github] |
| Maturity (release cadence 2024-2026, stars, weekly downloads) | Mature but younger. GitHub snapshot: 33.9k stars, 178 releases, latest `0.45.2` Mar 27, 2026; PGlite support landed Mar 28, 2024. npm snapshot: 1,664,862 weekly downloads, 10.4 MB unpacked.[^drizzle-github][^drizzle-pglite-release][^drizzle-npm] | Most mature/adopted. GitHub org/release pages show ~44.9k stars and frequent 2026 releases through v7.7.0 Apr 7, 2026; npm snapshot for `@prisma/client`: 3,881,411 weekly downloads, 76.9 MB unpacked.[^prisma-github-org][^prisma-releases][^prisma-client-npm] | Mature and active. GitHub snapshot: 13.7k stars, 104 releases, latest `0.28.16` Apr 10, 2026; npm snapshot: 1,056,317 weekly downloads, 3.25 MB unpacked.[^kysely-github-stats][^kysely-npm] |
| Performance under PGlite WASM | Likely best of three due first-class direct adapter and thin runtime, but no authoritative PGlite ORM benchmark found [unverified]. PGlite itself is in-process WASM Postgres under 3 MB gzipped and supports in-memory/file-backed modes.[^pglite-product][^drizzle-pglite] | Highest overhead/risk under PGlite because PGlite path uses community adapter plus Prisma query/compiler stack; no authoritative benchmark found [unverified]. | Likely low overhead query-builder path, but community dialect can serialize single PGlite connection and can deadlock in some cases according to `kysely-pglite-dialect` package notes.[^kysely-pglite-dialect] |
| Connection pooling for Postgres mode | Uses underlying Postgres driver/pool; Drizzle supports Postgres drivers and does not own a heavy pool layer.[^drizzle-readme] | Prisma Client uses a connection pool or driver-adapter pool depending on mode.[^prisma-pool] | First-class: `PostgresDialect` takes a `pg` Pool or function returning a Pool.[^kysely-postgres][^kysely-postgres-config] |
| Transaction API ergonomics | Good. Drizzle supports `db.transaction(async tx => ...)` [unverified due no official transaction source captured]. | Good. Prisma supports sequential `$transaction([...])` and interactive `$transaction(async tx => ...)`.[^prisma-transactions] | Good. Kysely supports `db.transaction().execute(async trx => ...)`, isolation levels, controlled transactions, savepoints.[^kysely-transaction] |
| Test ergonomics (in-memory, fixtures) | Strong for local-first tests because official PGlite adapter supports in-memory and directory-backed modes.[^drizzle-pglite] | Medium. Prisma test setup is familiar, but PGlite test path depends on community adapter/helper; Prisma migrations still emit SQL.[^prisma-pglite][^pglite-prisma-adapter] | Strong if community dialect accepted: PGlite in-memory plus TS migrations; type generation can run from migration files or persisted PGlite database.[^kysely-pglite] |
| Casbin compatibility (`casbin_rule` owned independently) | Acceptable if Drizzle Kit is configured not to manage Casbin-owned tables and destructive `push` is avoided; Drizzle supports table filters/extensions filters for push/pull scope.[^drizzle-pull] | Acceptable if `casbin_rule` is omitted or ignored and Prisma Migrate does not own it [unverified]. Drift/introspection policy must be tested. | Best operational fit: migrations only touch what Fulcrum code writes, so independent Casbin table ownership is straightforward [unverified]. |

## Per-ORM Analysis

### Drizzle

#### Pros

Drizzle has the best PGlite fit: official `drizzle-orm/pglite`, in-memory and directory-backed modes, and direct use of an existing `PGlite` client.[^drizzle-pglite] It also gives strong TypeScript schema inference, Postgres column builders, JSONB typing, FK/index APIs, and native pgvector column/index helpers.[^drizzle-readme][^drizzle-pg-columns][^drizzle-indexes][^drizzle-pgvector-doc]

Drizzle is small relative to Prisma. Its README advertises ~7.4 kB minified+gzipped and zero dependencies, while the npm snapshot showed 10.4 MB unpacked.[^drizzle-readme][^drizzle-npm]

Drizzle handles the SvelteKit Date serialization issue cleanly if Fulcrum standardizes on `timestamp(..., { withTimezone: true, mode: "string" })` for externally serialized fields.[^drizzle-timestamp]

#### Cons

Drizzle fails the migration constraint under canonical tooling. Drizzle Kit `generate` emits SQL migration files and `migrate` applies generated SQL files.[^drizzle-kit-overview][^drizzle-migrations] No supported TS class migration mode was found [unverified]. `push` avoids migration files but also avoids a class-based migration history.[^drizzle-kit-overview]

Drizzle also lacks native class/decorator entities. A wrapper can be built, but that creates a second schema DSL: class metadata must map perfectly to Drizzle table objects, constraints, indexes, FTS, vector types, and migrations [unverified].

FTS and pgvector extension setup still hit raw SQL edges. Drizzle's own FTS guide uses `customType` plus `sql` expressions, and pgvector docs say Drizzle does not create the extension automatically.[^drizzle-fts][^drizzle-vector-guide]

#### PGlite Fit

Best candidate. PGlite itself is Postgres in WASM, packaged as TypeScript for browser, Node.js, Bun, and Deno, with in-memory/file-backed persistence and pgvector extension support.[^pglite-product] Drizzle has an official PGlite guide and a PGlite driver.[^drizzle-pglite]

Main risk is not connection, but feature parity: FTS, generated columns, GIN, pgvector extension loading, and migration semantics must be tested against both PGlite and server Postgres [unverified].

#### Migration Story

Canonical answer: Drizzle migrations are SQL-file migrations. Drizzle Kit can generate SQL files from TypeScript schema, apply SQL files, push schema directly, pull/introspect, and export SQL to console.[^drizzle-kit-overview][^drizzle-export] That is not compatible with "no `.sql` files on disk" if the rule is absolute.

A Fulcrum wrapper that consumes Drizzle snapshots/SQL without writing SQL files would be unsupported. The public docs describe SQL files, snapshots, console export, and direct push, not class migrations.[^drizzle-kit-overview][^drizzle-export]

#### NestJS-style DI Ergonomics

Good with custom providers/repositories. `nestjs-drizzle` shows injecting a Drizzle instance by token and using it in `@Injectable()` services, but the package index marks it inactive.[^nestjs-drizzle]

For Fulcrum, Drizzle would need `DatabaseModule`, scoped `FulcrumDb` provider, repository classes, and perhaps decorator-generated table objects. That is ergonomic enough, but not true TypeORM/MikroORM parity [unverified].

### Prisma

#### Pros

Prisma has the best off-the-shelf NestJS story. Official docs show a `PrismaService` using `@Injectable()`, service injection, and generated Prisma Client types.[^prisma-nest]

Prisma is also the most adopted of the three by npm/GitHub snapshots: Prisma pages showed frequent 2026 releases, `@prisma/client` around 3.88M weekly downloads, and a large GitHub repo around 44.9k stars.[^prisma-releases][^prisma-client-npm][^prisma-github-org]

For conventional Postgres relational modeling, Prisma supports referential actions, compound IDs/unique constraints, indexes, and JSONB/GIN index operator classes.[^prisma-referential][^prisma-composite][^prisma-indexes]

#### Cons

Prisma conflicts with two hard constraints. First, the schema source is `.prisma`, not TypeScript classes/decorators.[^prisma-schema-overview][^prisma-models] Second, Prisma Migrate generates and uses SQL migration files as migration history.[^prisma-migrate][^prisma-migration-history]

PGlite support is not first-class. Prisma's official driver-adapter docs list PGlite as community-maintained, while Prisma-maintained adapters cover `pg`, Prisma Postgres, MySQL/MariaDB, SQLite adapters, SQL Server, and serverless providers.[^prisma-drivers]

Advanced Postgres features collide with the no-raw-SQL rule. Prisma docs say pgvector uses `Unsupported("vector")` and raw SQL/TypedSQL; function indexes such as `to_tsvector` are not supported/visible in Prisma schema.[^prisma-extensions][^prisma-indexes][^prisma-unsupported]

#### PGlite Fit

Weakest candidate. Community packages exist, including `pglite-prisma-adapter` and `prisma-pglite`, but the support surface is adapter/helper-owned rather than Prisma-owned.[^pglite-prisma-adapter][^prisma-pglite]

`prisma-pglite` specifically describes enabling `prisma migrate dev` / reset against PGlite and auto-propagating schema similarly to `db push`, but also notes limits around applying new migrations to an existing PGlite database.[^prisma-pglite]

#### Migration Story

Prisma Migrate is explicitly SQL-file based: it generates `.sql` migration files, stores them under `prisma/migrations`, and treats the migration folder as source of truth.[^prisma-migrate][^prisma-migration-history]

This is a canonical no for the strict Fulcrum migration rule. `db push` is useful for prototyping but is not a TS class migration history.[^prisma-migrate]

#### NestJS-style DI Ergonomics

Best of three for NestJS services. Prisma docs show a direct `PrismaService extends PrismaClient` pattern with DI into user/post services.[^prisma-nest] Community `nestjs-prisma` also provides `PrismaModule` and `PrismaService` injection.[^nestjs-prisma]

Entity-class parity is still absent. Prisma generates model types and client delegates; it does not make decorator entity classes the source of schema truth.[^prisma-models]

### Kysely

#### Pros

Kysely is the only candidate whose canonical migration API is compatible with "no `.sql` files on disk": migrations are TypeScript `Migration` objects/functions with `up(db)` and optional `down(db)`.[^kysely-migration][^kysely-migrator]

It is small and runtime-simple. Kysely says it has zero dependencies and runs in Bun; npm snapshot showed 3.25 MB unpacked and about 1.06M weekly downloads.[^kysely-home][^kysely-npm]

Postgres support is first-class through `PostgresDialect` over `pg` Pool, and transaction ergonomics are strong.[^kysely-postgres][^kysely-transaction]

#### Cons

Kysely is not an ORM in the entity sense. It has no native decorators/classes, no identity map, no repository layer, no change tracking, no relation metadata, and no schema diff generator [unverified]. Fulcrum must hand-roll repository classes, migration classes, schema conventions, and possibly metadata decorators.

PGlite is community-only. Core Kysely supports custom dialects, but PGlite dialect packages are external.[^kysely-dialect][^kysely-pglite][^kysely-pglite-dialect]

Advanced Postgres features usually require either string data type names or `sql` expressions. Kysely allows raw SQL strings when needed, but Fulcrum's hard rule forbids that path.[^kysely-home][^kysely-create-table][^kysely-create-index]

#### PGlite Fit

Medium. PGlite itself supports Bun, file-backed persistence, and extensions.[^pglite-product] `kysely-pglite` provides an in-memory/directory-backed dialect and migration/codegen utilities.[^kysely-pglite]

Risk is dialect maturity. `kysely-pglite-dialect` notes PGlite is single-user/single-connection and serializes connection acquisition, which may cause deadlocks in patterns that work on normal Postgres.[^kysely-pglite-dialect]

#### Migration Story

Best fit. Kysely's `Migration` interface is `up(db: Kysely<any>)` and optional `down(db: Kysely<any>)`.[^kysely-migration] `MigrationProvider` returns named `Migration` objects, and `FileMigrationProvider` reads migrations from a folder.[^kysely-file-provider][^kysely-provider]

Fulcrum can wrap each migration in a class:

```ts
export class CreateRunsTables {
  async up(db: Kysely<any>) {
    await db.schema.createTable('agent_runs').execute()
  }

  async down(db: Kysely<any>) {
    await db.schema.dropTable('agent_runs').execute()
  }
}
```

The file above contains query-builder calls, not SQL files. Note: table/type names are still string literals; that appears unavoidable in Kysely and should be accepted explicitly if Kysely is chosen [unverified].

#### NestJS-style DI Ergonomics

Good if Fulcrum owns conventions. A Nest-style module can provide `Kysely<DB>`, `UnitOfWork`, and repository classes. Transaction-scoped repositories can accept `Kysely<DB> | Transaction<DB>`, matching Kysely's transaction API.[^kysely-transaction]

It will not feel like TypeORM/MikroORM decorator entities unless Fulcrum builds decorators as metadata only. That decorator layer would be local architecture, not Kysely capability [unverified].

## Head-to-Head Verdict

Strict reading: none of the three fully satisfies "class-driven entities, no plaintext SQL, TS/class migrations, PGlite, advanced Postgres features" without Fulcrum-owned infrastructure.

Pragmatic winner under the hard no-`.sql` rule: **Kysely**.

Why:

- Kysely is the only candidate with canonical TypeScript `up(db)` / `down(db)` migrations and no generated SQL migration files.[^kysely-migration][^kysely-migrator]
- Kysely can be wrapped cleanly in NestJS-style repository and Unit of Work classes because its API is plain TypeScript and transactions pass a typed `trx` object.[^kysely-transaction]
- Kysely keeps bundle-size risk low compared with Prisma.[^kysely-home][^kysely-npm][^prisma-client-npm]
- Kysely's biggest weakness, PGlite support, has community dialects that are small enough to replace if needed.[^kysely-pglite][^kysely-pglite-dialect]

Runtime-first alternate: **Drizzle**.

Drizzle should win if Fulcrum relaxes migration constraints enough to allow Drizzle Kit SQL migration artifacts or adopts direct `push` for local-first databases. It has the strongest PGlite adapter and best schema/type ergonomics.[^drizzle-pglite][^drizzle-readme] Under the stated hard rule, though, Drizzle's migration story is a blocker.[^drizzle-kit-overview][^drizzle-migrations]

Reject for Fulcrum hard constraints: **Prisma**.

Prisma is excellent for NestJS DI and conventional SaaS Postgres, but `.prisma` schema plus SQL migration files plus community PGlite adapter plus raw SQL/Unsupported paths for pgvector/FTS make it misaligned with Fulcrum's stated constraints.[^prisma-schema-overview][^prisma-migrate][^prisma-drivers][^prisma-extensions]

## Risk Register

| ORM choice | Top risk | Mitigation |
|---|---|---|
| Drizzle | Migration blocker: canonical diff emits `.sql` files.[^drizzle-kit-overview][^drizzle-migrations] | Only choose Drizzle if user explicitly relaxes no-`.sql` rule, or build a separate class migration system and use Drizzle only for schema/query runtime. |
| Drizzle | Decorator wrapper drift from Drizzle schema semantics [unverified]. | Generate Drizzle table objects from one metadata source; forbid hand-written table objects outside wrapper; add snapshot tests for all 30+ tables. |
| Drizzle | FTS/pgvector extension setup uses raw SQL in docs.[^drizzle-fts][^drizzle-vector-guide] | Externalize extension provisioning to database bootstrap not ORM migrations, or accept a narrow "trusted extension operation" exception. |
| Prisma | `.prisma` DSL is not TypeScript classes and migration history is SQL files.[^prisma-schema-overview][^prisma-migrate] | Do not choose Prisma under strict rule. If chosen anyway, document rule exception explicitly. |
| Prisma | PGlite adapter is community-maintained, not Prisma-maintained.[^prisma-drivers] | Treat PGlite mode as experimental; require automated parity tests against PGlite and server Postgres. |
| Prisma | pgvector and Postgres FTS require Unsupported/raw/TypedSQL paths.[^prisma-extensions][^prisma-indexes] | Move vector/FTS into separate deterministic search subsystem, or avoid Prisma for those tables. |
| Kysely | No schema diff generator, no entity ORM, no native decorators [unverified]. | Generate migration skeletons from class metadata or require explicit migration classes; keep repository layer small and convention-heavy. |
| Kysely | PGlite dialect is community-maintained and single-connection behavior can deadlock.[^kysely-pglite-dialect] | Run concurrency and transaction tests early; keep a dialect adapter boundary so Drizzle can replace PGlite mode if needed. |
| Kysely | Raw SQL temptation for FTS, generated columns, pgvector operators.[^kysely-home][^kysely-create-index] | Create typed builder helpers for allowed constructs; ban `sql` import via lint except in a quarantined adapter package with explicit approval. |

## Specific Question Answers

### Q1. Does Prisma `.prisma` DSL violate no-plaintext-SQL rule?

Two interpretations:

1. **Narrow "no plaintext SQL" interpretation:** `.prisma` does not violate this specific rule because it is Prisma Schema Language, not SQL. Prisma docs describe it as the main configuration/data-model file containing data sources, generators, and application models.[^prisma-schema-overview][^prisma-models]
2. **Full Fulcrum hard-constraint interpretation:** `.prisma` violates the spirit of the rule because it is not TypeScript classes/decorators and it creates a non-TS schema source of truth. Prisma Migrate also generates `.sql` migration files, which directly violates the no-plaintext-SQL migration constraint.[^prisma-migrate][^prisma-migration-history]

Recommended stance: **Treat Prisma as non-compliant** for Fulcrum. The DSL itself is not SQL, but it fails the class-driven TypeScript source-of-truth requirement, and Prisma's canonical migration history is SQL files.

### Q2. Drizzle migration emission: is there a class-based migration mode? Can migrations be wrapped as TS Migration classes that consume drizzle artifacts without `.sql` files landing on disk?

Canonical answer: **No supported class-based migration mode found.** Drizzle Kit docs say `generate` creates SQL migration files, `migrate` applies generated SQL migration files, and migration history uses a migration folder with SQL files/snapshots.[^drizzle-kit-overview][^drizzle-migrations] `export` prints SQL DDL to console and says Drizzle Kit outputs SQL files by default.[^drizzle-export]

Possible but unsupported alternatives:

- `drizzle-kit push`: applies schema directly to the database with no versioned class migration history.[^drizzle-kit-overview]
- Custom wrapper around Drizzle snapshots or exported SQL: would still consume generated SQL and depends on undocumented internals [unverified].
- Hand-written TS migration classes using Drizzle query builder: feasible for simple DML/DQL, but DDL coverage and schema diffing become Fulcrum-owned; Drizzle Kit is no longer the migration system [unverified].

Recommended answer: **Do not claim Drizzle satisfies the migration rule.** It only becomes viable if Fulcrum relaxes the rule or replaces Drizzle Kit migrations.

### Q3. Kysely migration API: confirm it uses TS `up(db)` / `down(db)` with query-builder calls and no `.sql` files.

Confirmed. Kysely's `Migration` interface is:

```ts
interface Migration {
  down?(db: Kysely<any>): Promise<void>
  up(db: Kysely<any>): Promise<void>
}
```

The Kysely API docs define `up(db)` and optional `down(db)` on `Migration`.[^kysely-migration] `FileMigrationProvider` reads migrations from a folder and returns named `Migration` objects.[^kysely-file-provider] `Migrator` runs those migrations.[^kysely-migrator]

Kysely itself does compile query-builder calls to SQL at runtime, but it does not require `.sql` files as migration artifacts. This satisfies "no `.sql` files on disk" if TypeScript migration files with builder calls are acceptable.

### Q4. Class-style entity wrapper over Drizzle: feasible? Any production repos?

Feasible mechanically: a decorator layer can collect metadata from classes, then generate/export Drizzle `pgTable` definitions and repository bindings. TypeScript decorators can model the TypeORM/MikroORM surface Fulcrum wants; Drizzle schema APIs can receive generated table names, columns, indexes, FKs, and custom types [unverified].

But no credible production repository using a Drizzle `@Entity` / `@Column` decorator wrapper was found in this research [unverified]. What was found:

- Drizzle's official model is TypeScript schema objects, not entity classes.[^drizzle-readme]
- NestJS community packages integrate Drizzle via DI tokens, not decorator entity metadata.[^nestjs-drizzle]
- Articles/examples show repository patterns around Drizzle and NestJS, but not a mature decorator-entity wrapper [unverified].[^drizzle-nest-article]

Recommendation: treat class-style Drizzle entity wrapper as a new Fulcrum subproject, not an available ORM feature.

### Q5. Failure gates: if chosen ORM fails on PGlite, list 2nd and 3rd fallback options.

Chosen ORM under strict constraints: **Kysely**.

Failure gate for Kysely:

- Community PGlite dialect cannot pass Fulcrum parity suite: migrations, transactions, cascades, composite indexes, JSONB, `timestamptz` string normalization, FTS, pgvector-gated columns, and Casbin-owned table coexistence.
- Single-connection behavior causes deadlocks or transaction semantics that differ materially from server Postgres.[^kysely-pglite-dialect]

Fallback order:

1. **2nd: Drizzle.** Best PGlite runtime support through official adapter.[^drizzle-pglite] Requires explicit migration-rule exception or separate class migration system.
2. **3rd: Prisma.** Use only if Drizzle also fails and Fulcrum accepts `.prisma`, SQL migrations, and community PGlite adapter risk.[^prisma-drivers][^pglite-prisma-adapter]

If user instead chooses Drizzle first for runtime reasons, fallback order should be Kysely then Prisma.

### Q6. Production case studies: Bun + PGlite with any of these three ORMs.

No strong production case study for **Bun + PGlite + Drizzle/Prisma/Kysely** was found in this research [unverified].

Grounded public examples/docs found:

- Drizzle official PGlite docs cover Bun install snippets and PGlite in-memory/directory-backed usage.[^drizzle-pglite]
- Drizzle release notes added PGlite support in Mar 2024.[^drizzle-pglite-release]
- Prisma official docs list PGlite as community-maintained adapter; `pglite-prisma-adapter` and `prisma-pglite` package docs show examples/helpers.[^prisma-drivers][^pglite-prisma-adapter][^prisma-pglite]
- Kysely community `kysely-pglite` package shows in-memory/directory usage, migrations, type generation, and PGlite live query integration.[^kysely-pglite]
- GitHub topic results include examples such as `drizzle-vitest-pg` for Drizzle + PGlite testing, not production deployment.[^pglite-topic]

Conclusion: choose based on constraint fit and run Fulcrum's own PGlite parity benchmark/proof before committing.

## References

[^drizzle-readme]: https://github.com/drizzle-team/drizzle-orm
[^drizzle-pglite]: https://orm.drizzle.team/docs/connect-pglite
[^drizzle-pglite-release]: https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0306
[^drizzle-kit-overview]: https://orm.drizzle.team/docs/kit-overview
[^drizzle-migrations]: https://orm.drizzle.team/docs/migrations
[^drizzle-export]: https://orm.drizzle.team/docs/drizzle-kit-export
[^drizzle-pull]: https://orm.drizzle.team/docs/drizzle-kit-pull
[^drizzle-pg-columns]: https://orm.drizzle.team/docs/column-types/pg
[^drizzle-timestamp]: https://orm.drizzle.team/docs/guides/timestamp-default-value
[^drizzle-indexes]: https://orm.drizzle.team/docs/indexes-constraints
[^drizzle-relations]: https://orm.drizzle.team/docs/relations
[^drizzle-fts]: https://orm.drizzle.team/docs/guides/full-text-search-with-generated-columns
[^drizzle-pgvector-doc]: https://orm.drizzle.team/docs/extensions/pg
[^drizzle-vector-guide]: https://orm.drizzle.team/docs/guides/vector-similarity-search
[^drizzle-github]: https://github.com/drizzle-team/drizzle-orm
[^drizzle-npm]: https://www.npmjs.com/package/drizzle-orm
[^nestjs-drizzle]: https://www.nestjs.io/packages/knaadh-nestjs-drizzle
[^drizzle-nest-article]: https://jsdev.space/howto/drizzle-orm-nestjs/

[^prisma-intro]: https://docs.prisma.io/
[^prisma-schema-overview]: https://docs.prisma.io/docs/orm/prisma-schema/overview
[^prisma-models]: https://www.prisma.io/docs/orm/prisma-schema/data-model
[^prisma-migrate]: https://www.prisma.io/docs/orm/prisma-migrate
[^prisma-migration-history]: https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories
[^prisma-drivers]: https://www.prisma.io/docs/orm/core-concepts/supported-databases/database-drivers
[^prisma-nest]: https://docs.prisma.io/docs/v6/guides/nestjs
[^nestjs-prisma]: https://nestjs-prisma.dev/docs/basic-usage/
[^prisma-referential]: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions
[^prisma-composite]: https://docs.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-composite-ids-and-constraints
[^prisma-indexes]: https://www.prisma.io/docs/v6/orm/prisma-schema/data-model/indexes
[^prisma-extensions]: https://docs.prisma.io/docs/postgres/database/postgres-extensions
[^prisma-unsupported]: https://docs.prisma.io/docs/orm/reference/prisma-schema-reference
[^prisma-pool]: https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
[^prisma-transactions]: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
[^prisma-client-npm]: https://www.npmjs.com/package/%40prisma/client
[^prisma-cli-npm]: https://www.npmjs.com/package/prisma
[^prisma-github-org]: https://github.com/prisma
[^prisma-releases]: https://github.com/prisma/prisma/releases
[^prisma-changelog]: https://www.prisma.io/changelog
[^pglite-prisma-adapter]: https://www.npmjs.com/package/pglite-prisma-adapter
[^prisma-pglite]: https://electrovir.github.io/prisma-pglite/index.html

[^kysely-home]: https://kysely.dev/
[^kysely-github]: https://github.com/kysely-org/kysely
[^kysely-github-stats]: https://github.com/kysely-org/kysely
[^kysely-npm]: https://www.npmjs.com/package/kysely
[^kysely-dialect]: https://kysely-org.github.io/kysely-apidoc/interfaces/Dialect.html
[^kysely-postgres]: https://kysely-org.github.io/kysely-apidoc/classes/PostgresDialect.html
[^kysely-postgres-config]: https://kysely-org.github.io/kysely-apidoc/interfaces/PostgresDialectConfig.html
[^kysely-transaction]: https://kysely-org.github.io/kysely-apidoc/classes/Transaction.html
[^kysely-migration]: https://kysely-org.github.io/kysely-apidoc/interfaces/Migration.html
[^kysely-provider]: https://kysely-org.github.io/kysely-apidoc/interfaces/MigrationProvider.html
[^kysely-file-provider]: https://kysely-org.github.io/kysely-apidoc/classes/FileMigrationProvider.html
[^kysely-migrator]: https://kysely-org.github.io/kysely-apidoc/classes/Migrator.html
[^kysely-create-table]: https://kysely-org.github.io/kysely-apidoc/classes/CreateTableBuilder.html
[^kysely-create-index]: https://kysely-org.github.io/kysely-apidoc/classes/CreateIndexBuilder.html
[^kysely-json]: https://kysely-org.github.io/kysely-apidoc/types/JSONColumnType.html
[^kysely-column-type]: https://kysely-org.github.io/kysely-apidoc/types/ColumnType.html
[^kysely-pglite]: https://www.npmjs.com/package/kysely-pglite
[^kysely-pglite-dialect]: https://socket.dev/npm/package/kysely-pglite-dialect

[^pglite-product]: https://electric-sql.com/products/pglite
[^pglite-topic]: https://github.com/topics/pglite
