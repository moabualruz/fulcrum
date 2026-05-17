# MikroORM → TypeORM Migration + NestJS Architecture Cleanup

**Date:** 2026-05-15
**Status:** HISTORICALLY IMPLEMENTED (2026-05-17), CURRENTLY STACK-VERIFIED — prior notes claim CI completion; current stack verification includes identity-access TypeORM adapter/passkey tests passing 12 tests, architecture stack gates passing 50 tests, `bun run --bun tsc --noEmit` passing, app-surface direct ORM scan returning 0 files, tracked `.sql` files absent, upstream scratch tracked count 0, and repository/naming/migration/PostgreSQL/PGlite/cross-surface audit cluster passing 75 tests. Full CI/final gates must wait for remaining Phase 9.6 product workflow blockers.
**Scope:** Full ORM migration + god module split + DTO extraction + tRPC consolidation + stub removal + test co-location

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
| Zod | Do not expand | AGENTS.md now makes Zod the validation direction; historical references are migration notes, not current architecture authority |

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

### Phase 9: Split platform-core God Module (93 entities → domain-owned)
platform-core currently owns all 93 entities and 40 repositories centrally. Every service imports from it → no locality, change one entity rebuilds all. Split entities and repositories to the owning service's `src/infrastructure/database/` directory. platform-core keeps only shared infra (DataSource config, base entity classes, cross-cutting entities like Org/User/OrgMember). Each service registers its own entities via `TypeOrmModule.forFeature()`.

Entity ownership by service:
- **identity-access**: User, Org, OrgMember, Session, Account, Verification, Invitation (~8 entities)
- **work-management**: Task, Project, Sprint, CustomField, SavedView, Template, Automation, FieldDependency, Relationship (~17 entities)
- **knowledge-workspace**: Document, DocumentVersion, Memory, Search (~6 entities)
- **execution-orchestration**: AgentRun, RoutingRule, Sandbox, SandboxSession (~6 entities)
- **integration-hub**: Repo, RepoBranch, Connector, Webhook, DataPortability (~6 entities)
- **notification-center**: Notification, NotificationPreference (~10 entities)
- **workflow-coordination**: Artifact, ArtifactRetentionPolicy, WorkflowCycle, Audit (~6 entities)
- **platform-core** (shared): Org, TenantSetting, FeatureFlag, FlagOverride, SchemaMigration, Job (~10 entities)

### Phase 10: Extract DTOs/Schemas from Controllers (60+ controllers)
Historical controller validation notes must be reconciled with current AGENTS.md: Zod remains the validation library. Extract request/response contracts into proper `dto/` or schema folders per feature module, keep controllers thin, validate with Zod-backed pipes/schemas, delegate to services, and return response DTOs. Never expose entities directly as API responses.

### Phase 11: Consolidate tRPC → NestJS Controllers
33 tRPC routers split across `apps/server/src/trpc/routers/` and `apps/server/src/runtime/trpc/routers/`. Some contain business logic. Consolidate to single location first, then incrementally convert to NestJS controllers (long-term — full conversion is future work, but consolidation + removing business logic from routers is in scope).

### Phase 12: Remove Stub/Empty Services
- Delete empty `inference-runtime/` service (0 files, deletion test passes)
- Evaluate `agent-client-protocol/` (8 files) — remove if stub, document timeline if placeholder

### Phase 13: Co-locate Tests
30+ test files in root `tests/` directory duplicate or mirror tests co-located in services. Migrate root tests to co-located `*.spec.ts` / `*.test.ts` beside source files. Architecture tests (`tests/architecture/`) stay at root (they span multiple services by design). Delete emptied root test directories.

### Phase 14: Final Verification + Cleanup
- Remove orphaned files, empty directories
- Verify `bun run ci` passes all 6 stages
- Verify zero `@mikro-orm/*` imports
- Verify entity ownership matches service boundaries

## Risks

| Risk | Mitigation |
|---|---|
| `typeorm-pglite` is community-maintained (single author, v0.3.x) | Pin version; if breaks, fallback to Docker PostgreSQL for local dev |
| PGlite single-connection limit | Acceptable for local dev; prod uses full PostgreSQL |
| Large diff (hundreds of files) | Pre-production; no deployed instances to break |
| TypeORM has slower development velocity than MikroORM | Acceptable tradeoff for NestJS-native integration |

## Success Criteria

Checked criteria below reflect historical implementation evidence plus the current focused architecture gate evidence. They are not a current full-CI/final-gate claim; rerun full CI in the current tree before final closure.

- [x] Zero `@mikro-orm/*` imports in codebase
- [x] Current 2026-05-17 focused evidence: stale identity-access MikroORM adapter/passkey names were corrected to TypeORM; focused identity tests passed 12 tests and architecture stack tests passed 50 tests.
- [x] Zero `kysely` imports in codebase
- [x] All 93 entities use TypeORM decorators
- [x] All repositories use TypeORM `Repository<T>` pattern
- [x] `TypeOrmModule.forRoot()` + `.forFeature()` wired in NestJS modules
- [x] Fresh TypeORM migrations create equivalent schema
- [x] PGlite works as default local DB via `typeorm-pglite`
- [x] `DATABASE_URL` switches to full PostgreSQL
- [x] Historical evidence: `bun run ci` passed; current tree requires rerun
- [x] No orphaned deps in package.json
- [x] Entities owned by their service (not centralized in platform-core)
- [x] DTOs extracted to `dto/` folders, controllers are thin
- [x] tRPC routers consolidated to single location, no business logic in routers
- [x] No empty/stub services without documented timeline
- [x] Tests co-located with source (except architecture tests at root)
