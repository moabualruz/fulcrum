# MikroORM → TypeORM Big-Bang Migration

**Date:** 2026-05-15
**Status:** Approved
**Scope:** Full ORM migration + NestJS toolchain consolidation + project cleanup

## Context

Fulcrum uses MikroORM v7 as primary ORM (93 entities, 40 custom repositories, 52 migrations, ~2,100 imports) with a custom Kysely bridge for PGlite local dev. TypeORM and @nestjs/typeorm are declared in package.json but have zero imports. AGENTS.md mandates TypeORM as the target ORM. This spec covers the migration.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Target ORM | TypeORM + @nestjs/typeorm | AGENTS.md mandate; official NestJS integration |
| Migration strategy | Big-bang batch | Pre-production; entities are simple (no advanced MikroORM features) |
| Existing migrations | Discard, write fresh TypeORM set | Cleaner than 1:1 translation of 52 files |
| Local DB | PGlite via `typeorm-pglite` (v0.3.4) | Default when no DATABASE_URL; full PostgreSQL when DATABASE_URL set |
| Validation | Zod (keep as-is) | User decision; 81+ imports, dominant in codebase |
| class-validator | Keep (60+ imports in controllers) | Already used for NestJS DTO validation at HTTP boundary |

## Architecture

### DataSource Configuration

```
DATABASE_URL absent → typeorm-pglite driver → PGlite (in-process, ./data/pglite)
DATABASE_URL present → standard pg driver → PostgreSQL
```

TypeORM DataSource created in `services/platform-core/src/infrastructure/application-database/`, registered via `TypeOrmModule.forRoot()` in AppModule, features registered per service module via `TypeOrmModule.forFeature([...entities])`.

### Decorator Translation

| MikroORM | TypeORM | Count |
|---|---|---|
| `@Entity()` | `@Entity()` | 115 |
| `@Property()` | `@Column()` | 662 |
| `@PrimaryKey()` | `@PrimaryGeneratedColumn()` / `@PrimaryColumn()` | 88 |
| `@ManyToOne()` | `@ManyToOne()` | 104 |
| `@OneToMany()` | `@OneToMany()` | 1 |
| `@Enum()` | `@Column({ type: 'enum', enum: X })` | 10 |
| `@Index()` | `@Index()` | 141 |
| `@Unique()` | `@Unique()` | 35 |

### Repository Pattern

MikroORM custom `EntityRepository<T>` subclasses (40 total) → TypeORM `Repository<T>` injected via `@InjectRepository(Entity)`. Custom query methods preserved as service methods or custom repository classes extending `Repository<T>`.

## Phases

### Phase 1: Entity Translation (93 files)
Translate all MikroORM entity decorators to TypeORM equivalents. Mechanical — no logic changes. All entities remain in `services/platform-core/src/infrastructure/application-database/entities/`.

### Phase 2: Repository Rewrite (40 files)
Replace MikroORM `EntityRepository` subclasses with TypeORM `Repository<T>` pattern. Custom query methods move to service layer or custom repository extending `Repository<T>`.

### Phase 3: Fresh Migrations (~10-15 files)
Write new TypeORM migration set matching current schema. Group by domain (auth, tasks, docs, orchestration, etc.). Archive old 52 MikroORM migrations to `_archived/`.

### Phase 4: Config Swap (3-5 files)
- Delete `mikro-orm.config.ts`
- Delete `PGliteKyselyDriver.ts`
- Create `typeorm.config.ts` with dual-mode DataSource (PGlite default, PostgreSQL when DATABASE_URL)
- Install `typeorm-pglite` package
- Wire `TypeOrmModule.forRoot()` in AppModule

### Phase 5: NestJS Module Integration (~10 modules)
Wire `TypeOrmModule.forFeature([...entities])` in each service's public-api module. Replace EntityManager injection with `@InjectRepository()`.

### Phase 6: Dependency Cleanup (package.json)
Remove: `@mikro-orm/core`, `@mikro-orm/decorators`, `@mikro-orm/migrations`, `@mikro-orm/postgresql`, `@mikro-orm/sql`, `@mikro-orm/knex`, `kysely`
Add: `typeorm-pglite`
Keep: `typeorm`, `@nestjs/typeorm` (already present)

### Phase 7: Import Rewrite (~2,100 imports)
Bulk replace all `@mikro-orm/*` imports with `typeorm` equivalents across codebase.

### Phase 8: Test Fix (~50 test files)
Update all DB-touching tests to use TypeORM DataSource. Replace MikroORM EntityManager test utilities.

### Phase 9: Project Cleanup
- Remove empty `inference-runtime/` service
- Clarify or remove `agent-client-protocol/` stub (8 files)
- Consolidate tRPC router locations (`trpc/routers/` + `runtime/trpc/routers/` → single location)
- Remove orphaned files, empty directories
- Verify all tests pass, `bun run ci` green

## Risks

| Risk | Mitigation |
|---|---|
| `typeorm-pglite` is community-maintained (single author, v0.3.x) | Pin version; if breaks, fallback to Docker PostgreSQL for local dev |
| PGlite single-connection limit | Acceptable for local dev; prod uses full PostgreSQL |
| Large diff (hundreds of files) | Pre-production; no deployed instances to break |
| TypeORM has slower development velocity than MikroORM | Acceptable tradeoff for NestJS-native integration |

## Success Criteria

- [ ] Zero `@mikro-orm/*` imports in codebase
- [ ] Zero `kysely` imports in codebase
- [ ] All 93 entities use TypeORM decorators
- [ ] All repositories use TypeORM `Repository<T>` pattern
- [ ] `TypeOrmModule.forRoot()` + `.forFeature()` wired in NestJS modules
- [ ] Fresh TypeORM migrations create equivalent schema
- [ ] PGlite works as default local DB via `typeorm-pglite`
- [ ] `DATABASE_URL` switches to full PostgreSQL
- [ ] `bun run ci` passes
- [ ] No orphaned deps in package.json
