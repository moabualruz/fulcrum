# ORM Migration Body SQL Research

## Per-ORM Analysis

### MikroORM v7

- Path convention: default migration path is `./migrations`; `pathTs` can point at TS source such as `src/migrations`; default file name callback returns `Migration${timestamp}${name ? '_' + name : ''}`; programmatic docs show `Migration20191019195930.ts` creation.[^mikro-migrations]
- Extension: generated output defaults to TypeScript via `emit: 'ts'`; docs also allow `emit: 'js' | 'ts' | 'cjs'`.[^mikro-migrations]
- Sample file: `./migrations/Migration20260501120000_create_users.ts`.[^mikro-migrations]
- Representative `up()` body for a users table:

```ts
async up(): Promise<void> {
  this.addSql('create table "users" ("id" serial primary key, "email" text not null, "name" text not null);');
  this.addSql('alter table "users" add constraint "users_email_unique" unique ("email");');
}
```

- Raw SQL in body: Y. MikroORM's migration-class example uses `this.addSql('select 1 + 1')`, and generated migrations are created from `diff: { up: string[]; down: string[] }` by `TSMigrationGenerator`.[^mikro-migrations]
- QB-only generated mode: N documented. The documented customization hook is a custom `MigrationGenerator`, but the documented generator API receives SQL string arrays, not schema-builder operations.[^mikro-migrations]
- Hand-authored QB-only TS: Y, partially. Docs say `Migration.addSql()` accepts Knex instances and `Migration.getKnex()` exposes a Knex instance, so a hand migration can use Knex schema/query builder instead of SQL string literals for basic DDL.[^mikro-migrations]
- Auto-generation source: schema diff from entity metadata; snapshots are written from target schema derived from entity metadata on `migration:create`, and rewritten from real database introspection after `migration:up` / `migration:down`.[^mikro-migrations]

### TypeORM 0.3.x

- Path convention: `migration:create <path/to/migrations>/<migration-name>` writes `{TIMESTAMP}-<migration-name>.ts` under the provided directory; docs example uses `src/db/migrations/post-refactoring` -> `src/db/migrations/{TIMESTAMP}-post-refactoring.ts`.[^typeorm-create]
- Extension: `migration:create` and `migration:generate` create `.ts` files by default; `--outputJs` / `-o` emits `.js`; `migration:run` and `migration:revert` run `.js` unless using `ts-node` wrappers.[^typeorm-execute]
- Sample file: `src/db/migrations/20260501120000-create-users.ts`.[^typeorm-create]
- Representative generated `up()` body:

```ts
async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(
    `CREATE TABLE "users" ("id" SERIAL NOT NULL, "email" text NOT NULL, "name" text NOT NULL, CONSTRAINT "PK_users_id" PRIMARY KEY ("id"))`,
  )
  await queryRunner.query(
    `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")`,
  )
}
```

- Raw SQL in body: Y. The generation docs say automatic generation writes all SQL queries needed to update the database, and the generated class calls `queryRunner.query(\`ALTER TABLE ...\`)` in `up()` / `down()`.[^typeorm-generate]
- QB-only generated mode: N documented. The documented generator emits SQL query calls; no official switch is documented to emit QueryRunner schema API calls instead.[^typeorm-generate]
- Hand-authored QB-only TS: Y, for many schema operations. The documented QueryRunner API supports `createTable`, `addColumn`, `createForeignKey`, `createIndex`, `createCheckConstraint`, and related schema methods.[^typeorm-api]
- Auto-generation source: entity changes compared with existing database schema on the server.[^typeorm-generate]

### Drizzle

- Path convention: default output folder is `./drizzle`; `drizzle-kit generate` creates a timestamped subfolder containing `migration.sql` and `snapshot.json`; `--name` customizes the folder suffix.[^drizzle-generate]
- Extension: `.sql` for migration content; `snapshot.json` accompanies each generated migration.[^drizzle-generate]
- Sample file: `./drizzle/20260501120000_create_users/migration.sql`.[^drizzle-generate]
- Representative migration body/file content:

```sql
CREATE TABLE "users" (
 "id" SERIAL PRIMARY KEY,
 "email" TEXT UNIQUE,
 "name" TEXT
);
```

- Raw SQL in body/file: Y. Drizzle's documented generate flow "generate SQL migrations" and saves `migration.sql`; the documented sample file contains `CREATE TABLE "users" ...`.[^drizzle-generate]
- QB-only generated mode: N for persisted migration files. Drizzle has `drizzle-kit push`, which omits SQL file generation and applies generated SQL directly to the database, but that is direct push, not a query-builder-only migration-file mode.[^drizzle-push]
- Hand-authored QB-only TS: N documented for Drizzle Kit migrations. Custom migrations are documented as empty SQL files for custom SQL, and docs say JavaScript/TypeScript custom migrations are an upcoming release.[^drizzle-custom]
- Auto-generation source: Drizzle TS schema files -> JSON snapshot -> comparison with previous migration snapshots -> SQL migration file; `push` additionally introspects the live database before applying changes.[^drizzle-generate][^drizzle-push]

### Prisma

- Path convention: `prisma/migrations/<YYYYMMDDHHMMSS_name>/migration.sql`; migration history is represented by `prisma/migrations` plus one subfolder and `migration.sql` file per migration.[^prisma-history]
- Extension: `.sql`.[^prisma-history]
- Sample file: `prisma/migrations/20260501120000_create_users/migration.sql`.[^prisma-getting-started]
- Representative migration body/file content:

```sql
CREATE TABLE "User" (
  "id" SERIAL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```

- Raw SQL in body/file: Y. Prisma Migrate generates a history of `.sql` migration files, and the getting-started docs show `migration.sql` containing `CREATE TABLE` and `ALTER TABLE` statements.[^prisma-overview][^prisma-getting-started]
- QB-only generated mode: N documented. Prisma Migrate is documented as generating SQL migration files from the Prisma schema; customization means editing generated SQL, not switching to TS query-builder migrations.[^prisma-overview][^prisma-unsupported]
- Hand-authored QB-only TS: N documented. Prisma Migrate deploys migration files and does not use the Prisma schema to fetch models during deploy; unsupported features are added by customizing `migration.sql`.[^prisma-history][^prisma-unsupported]
- Auto-generation source: Prisma schema data model -> SQL migration files; existing projects can introspect with `prisma db pull` before creating a baseline migration.[^prisma-overview][^prisma-getting-started]

### Kysely

- Path convention: core Kysely uses a `MigrationProvider`; docs show `FileMigrationProvider` with an absolute `migrationFolder`, and migration names run in alpha-numeric order with an ISO 8601 prefix recommended.[^kysely-migrations][^kysely-file-provider]
- Extension: documented examples are TypeScript functions; `kysely-ctl` defaults to TS file migrations and can optionally allow `.js`, `.cjs`, or `.mjs` migrations.[^kysely-migrations][^kysely-ctl]
- Sample file: `migrations/2026-05-01T120000_create_users.ts`.[^kysely-migrations]
- Representative `up()` body:

```ts
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('email', 'varchar', (col) => col.notNull().unique())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .execute()
}
```

- Raw SQL in body: N for the documented basic schema-builder style. Kysely migration docs say migrations can use `Kysely.schema` to modify schema, and the PostgreSQL example creates tables and indexes with builder calls; the docs also show `sql` tag usage for expressions such as `defaultTo(sql\`now()\`)`, so advanced expressions can reintroduce raw SQL fragments.[^kysely-migrations]
- QB-only generated mode: N/A. Kysely core docs do not document schema-diff auto-generation; migrations are hand-authored TS functions consumed by a migration provider.[^kysely-migrations]
- Hand-authored QB-only TS: Y for schema-builder-covered DDL. Docs explicitly state migrations can use `Kysely.schema` and normal queries.[^kysely-migrations]
- Auto-generation source: none documented in Kysely core; optional CLI can create/run migration files but Kysely migration docs do not document entity/schema diff generation.[^kysely-migrations][^kysely-ctl]

## Summary Table

| ORM | Raw SQL in body/file | QB-only generated mode | Hand-authored QB | Auto-gen source |
| --- | --- | --- | --- | --- |
| MikroORM v7 | Y, `this.addSql('...')` by default.[^mikro-migrations] | N documented; custom generator receives SQL arrays.[^mikro-migrations] | Y, partially via Knex instances/getKnex.[^mikro-migrations] | Entity metadata diff plus snapshots; DB introspection rewrites snapshots after apply.[^mikro-migrations] |
| TypeORM 0.3.x | Y, generated `queryRunner.query(\`...\`)`.[^typeorm-generate] | N documented.[^typeorm-generate] | Y, for documented QueryRunner schema API surface.[^typeorm-api] | Entity changes compared with live DB schema.[^typeorm-generate] |
| Drizzle | Y, generated `migration.sql`.[^drizzle-generate] | N for migration files; `push` omits files but applies SQL directly.[^drizzle-push] | N documented for Drizzle Kit; TS custom migrations are documented as upcoming.[^drizzle-custom] | Drizzle TS schema snapshot diff; `push` also introspects DB.[^drizzle-generate][^drizzle-push] |
| Prisma | Y, generated `migration.sql`.[^prisma-overview][^prisma-getting-started] | N documented.[^prisma-overview] | N documented.[^prisma-unsupported] | Prisma schema -> SQL files; optional DB introspection updates schema before baselining.[^prisma-overview][^prisma-getting-started] |
| Kysely | N for basic documented TS schema-builder migrations; `sql` tag can add SQL fragments.[^kysely-migrations] | N/A, no core auto-generation documented.[^kysely-migrations] | Y.[^kysely-migrations] | None documented in core.[^kysely-migrations] |

## Strict vs Lenient Stance

- Strict "no plaintext SQL anywhere" compatible: Kysely only, if project policy also bans `sql` tagged templates and requires schema-builder-only migrations.[^kysely-migrations]
- Strict compatible with caveat: TypeORM and MikroORM can be used only if all migrations are hand-authored through QueryRunner/Knex builder APIs and auto-generated SQL migrations are banned by policy.[^typeorm-api][^mikro-migrations]
- Not strict compatible as normal migration workflow: Drizzle and Prisma persist `.sql` migration files by design.[^drizzle-generate][^prisma-overview]
- Lenient reading candidate: MikroORM and TypeORM can keep ORM-generated migration SQL if DECISIONS.md explicitly carves out generated, reviewed migration SQL strings in `up()` / `down()` bodies.[^mikro-migrations][^typeorm-generate]
- Lenient reading candidate: Drizzle and Prisma can be accepted only if DECISIONS.md carves out generated migration SQL files and defines review rules for unsupported/custom SQL.[^drizzle-generate][^prisma-unsupported]
- "Zero raw SQL string literals in `up()` / `down()` bodies by default": Kysely, among ORMs that actually have TS migration bodies in official docs.[^kysely-migrations]
- "Zero plaintext SQL migration artifacts by default": none of MikroORM, TypeORM, Drizzle, Prisma; Kysely has no auto-generated SQL artifact in the documented core migration flow.[^mikro-migrations][^typeorm-generate][^drizzle-generate][^prisma-overview][^kysely-migrations]

## Practical Cost Analysis

- CREATE EXTENSION: Prisma documents creating an empty migration and adding `CREATE EXTENSION IF NOT EXISTS ...` to `migration.sql`; Prisma also documents schema-declared PostgreSQL extensions in newer versions, but the migration artifact is still SQL.[^prisma-pg-extensions][^prisma-native-functions] Drizzle custom migrations are SQL files; TypeScript custom migrations are documented as upcoming, so a strict no-SQL regime blocks Drizzle-managed extension migrations.[^drizzle-custom] MikroORM/TypeORM/Kysely builder-only support for `CREATE EXTENSION` is not documented in the official migration pages reviewed here, so relying on builder-only extension creation is [UNVERIFIED].
- `tsvector` GENERATED columns: Drizzle documents generated columns with full-text search using `customType`, `.generatedAlwaysAs(() => sql\`to_tsvector(...)\`)`, and a GIN index, so strict no-plaintext-SQL must also ban or wrap Drizzle `sql` expressions in schema files.[^drizzle-generated-columns] Prisma's unsupported-feature docs say features not representable in Prisma schema require customized SQL migrations; whether `tsvector` generated columns are representable in Prisma v7 schema is [UNVERIFIED]. MikroORM/TypeORM/Kysely builder-only support for generated `tsvector` columns is [UNVERIFIED] from the migration docs reviewed.
- GIN/HNSW indexes and partial indexes: Drizzle documents index builders with `.using(...)` and `.where(sql\`\`)`, and the generated-column FTS example emits `USING gin`; partial-index predicates still use `sql` expressions.[^drizzle-indexes][^drizzle-generated-columns] Prisma docs say partial indexes are now supported in Prisma Schema Language through `where` on `@@index`, `@@unique`, and `@unique`, while unsupported features still require customized SQL migrations.[^prisma-unsupported] HNSW support through these ORM migration builders is [UNVERIFIED] from official migration docs reviewed.
- CHECK constraints: TypeORM QueryRunner documents `createCheckConstraint`; Drizzle documents `check(..., sql\`...\`)`; Prisma support for CHECK constraints in Prisma Schema Language is [UNVERIFIED] from the reviewed docs; MikroORM/Kysely builder-only CHECK support is [UNVERIFIED] from the reviewed migration docs.[^typeorm-api][^drizzle-indexes]
- Data migrations: TypeORM QueryRunner and Kysely migrations can run normal queries through their TS APIs; MikroORM docs allow data changes via `execute()` or `EntityManager`, but warn EntityManager use in migrations is discouraged because metadata changes over time.[^typeorm-api][^kysely-migrations][^mikro-migrations]
- Net cost of query-builder-only: low for create/drop tables, columns, basic indexes, and foreign keys in TypeORM/Kysely; medium for CHECK/default/generated expressions because many APIs require expression strings or `sql` tagged fragments; high for extension installation, FTS generated columns, HNSW/vector indexes, and other dialect-specific DDL unless project accepts either raw SQL carve-outs or external provisioning. This cost assessment is an inference from the documented API examples above.[^typeorm-api][^kysely-migrations][^drizzle-indexes][^prisma-unsupported]

## Recommendation

Adopt Kysely if the rule is strict: migrations can be plain TypeScript schema-builder functions, no generated SQL files are part of core workflow, and the policy can reject `sql` tagged templates in migrations except by explicit exception.[^kysely-migrations]

TypeORM is second-best only if Fulcrum bans `migration:generate` output and hand-authors QueryRunner migrations; this gives durable TS migration files but loses auto-generated migration convenience and still needs exceptions for expression-heavy or dialect-specific DDL.[^typeorm-generate][^typeorm-api]

MikroORM is workable only with a similar hand-authored Knex-builder discipline; its normal generated migration story is SQL-string based, and its documented custom generator receives SQL strings, so auto-generation conflicts with strict reading.[^mikro-migrations]

Drizzle and Prisma conflict with strict "no plaintext SQL anywhere" because their normal migration histories are `.sql` files; use them only under a lenient DECISIONS.md carve-out for generated migration SQL, or use Drizzle `push`/Prisma `db push` only for prototyping where durable migration files are not required.[^drizzle-generate][^drizzle-push][^prisma-overview]

## Citations

[^mikro-migrations]: MikroORM v7 migrations docs: https://mikro-orm.io/docs/migrations
[^typeorm-create]: TypeORM 0.3 creating migrations docs: https://typeorm.io/docs/migrations/creating
[^typeorm-generate]: TypeORM 0.3 generating migrations docs: https://typeorm.io/docs/migrations/generating
[^typeorm-execute]: TypeORM 0.3 executing/reverting docs: https://typeorm.io/docs/migrations/executing
[^typeorm-api]: TypeORM 0.3 QueryRunner migration API docs: https://typeorm.io/docs/migrations/api
[^drizzle-generate]: Drizzle Kit generate docs: https://orm.drizzle.team/docs/drizzle-kit-generate
[^drizzle-push]: Drizzle Kit push docs: https://orm.drizzle.team/docs/drizzle-kit-push
[^drizzle-custom]: Drizzle Kit custom migrations docs: https://orm.drizzle.team/docs/kit-custom-migrations
[^drizzle-indexes]: Drizzle indexes and constraints docs: https://orm.drizzle.team/docs/indexes-constraints
[^drizzle-generated-columns]: Drizzle generated columns docs: https://orm.drizzle.team/docs/generated-columns
[^prisma-overview]: Prisma Migrate overview: https://www.prisma.io/docs/orm/prisma-migrate
[^prisma-getting-started]: Prisma Migrate getting started: https://www.prisma.io/docs/orm/prisma-migrate/getting-started
[^prisma-history]: Prisma Migrate migration histories: https://www.prisma.io/docs/v6/orm/prisma-migrate/understanding-prisma-migrate/migration-histories
[^prisma-unsupported]: Prisma Migrate unsupported database features: https://www.prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features
[^prisma-pg-extensions]: Prisma PostgreSQL extensions: https://www.prisma.io/docs/orm/prisma-schema/postgresql-extensions
[^prisma-native-functions]: Prisma native database functions: https://www.prisma.io/docs/orm/prisma-migrate/workflows/native-database-functions
[^kysely-migrations]: Kysely migrations docs: https://kysely.dev/docs/migrations
[^kysely-file-provider]: Kysely FileMigrationProvider API docs: https://kysely-org.github.io/kysely-apidoc/classes/FileMigrationProvider.html
[^kysely-ctl]: Official Kysely CLI README: https://github.com/kysely-org/kysely-ctl
