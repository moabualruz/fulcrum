# MikroORM → TypeORM Migration + NestJS Architecture Cleanup Plan

> **Status: HISTORICALLY IMPLEMENTED (2026-05-16), CURRENTLY EVIDENCE-SCOPED (2026-05-17).** Historical tracker evidence says the migration tasks were executed: MikroORM removed, TypeORM in place, platform-core split into bounded services, tRPC consolidated as NestJS-native dual-exposure, DTOs extracted, and prior `bun run ci` tiers 1-6 passed. Current evidence is narrower: architecture stack gates were rerun with `bun test tests/architecture/boundary.test.ts tests/architecture/server-stack.test.ts tests/architecture/no-raw-sql.test.ts` and passed 50 tests; `.scratch/upstream-product-replacement` has zero tracked files and remains ignored. Full CI/final release gates must be rerun in the current tree before claiming final closure.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Checked steps below record historical implementation status from the tracker/provenance, not a current full-CI rerun.

**Goal:** Replace MikroORM v7 with TypeORM, split platform-core god module, extract DTOs, consolidate tRPC, remove stubs, co-locate tests. Full NestJS architecture cleanup.

**Architecture:** All 93 MikroORM entities get TypeORM decorators. 40 custom repositories become TypeORM `Repository<T>` or custom repository classes. needle-di bindings in db.module.ts replaced with NestJS `TypeOrmModule.forFeature()`. Fresh TypeORM migrations replace 52 MikroORM migrations. PGlite stays as default local DB via `typeorm-pglite` driver.

**Tech Stack:** TypeORM 0.3.29, @nestjs/typeorm 11.0.1, typeorm-pglite, @electric-sql/pglite

**Spec:** `docs/superpowers/specs/2026-05-15-mikroorm-to-typeorm-migration-design.md`

---

## File Structure

```
services/platform-core/src/infrastructure/application-database/
  typeorm.config.ts                    # NEW — DataSource config (replaces mikro-orm.config.ts)
  mikro-orm.config.ts                  # DELETE
  PGliteKyselyDriver.ts               # DELETE
  db.module.ts                         # REWRITE — NestJS TypeORM module (replaces needle-di)
  entities/**/*.ts                     # MODIFY — all 93 entity files (decorator swap)
  repositories/**/*.ts                 # MODIFY — all 40 repo files (TypeORM Repository<T>)
  migrations/                          # DELETE old, write fresh TypeORM migrations
  _archived-mikro-migrations/          # NEW — archive of old migrations

apps/server/src/
  app.module.ts                        # MODIFY — wire TypeOrmModule.forRoot()
  nest-application.ts                  # MODIFY — minor (remove MikroORM shutdown if any)

package.json                           # MODIFY — remove MikroORM deps, add typeorm-pglite
```

---

## Task 1: Install typeorm-pglite and Create TypeORM DataSource Config

**Files:**
- Create: `services/platform-core/src/infrastructure/application-database/typeorm.config.ts`
- Modify: `package.json`

- [x] **Step 1: Install typeorm-pglite**

```bash
bun add typeorm-pglite
```

- [x] **Step 2: Write the DataSource config**

```typescript
// services/platform-core/src/infrastructure/application-database/typeorm.config.ts
import { DataSource, DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";

const isPGlite = !process.env.DATABASE_URL;

export function createDataSourceOptions(
  extraEntities: Function[] = [],
): DataSourceOptions {
  return {
    type: "postgres",
    ...(isPGlite
      ? { driver: new PGliteDriver("./data/pglite") as any }
      : { url: process.env.DATABASE_URL }),
    entities: [...getCoreEntities(), ...extraEntities],
    migrations: [__dirname + "/migrations/*.{ts,js}"],
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === "true",
  };
}

export function getCoreEntities(): Function[] {
  // Will be populated in Task 2 as entities are converted
  return [];
}

let defaultDataSource: DataSource | undefined;

export async function initDataSource(
  options?: Partial<DataSourceOptions>,
): Promise<DataSource> {
  if (defaultDataSource?.isInitialized) return defaultDataSource;
  defaultDataSource = new DataSource({
    ...createDataSourceOptions(),
    ...options,
  } as DataSourceOptions);
  await defaultDataSource.initialize();
  return defaultDataSource;
}

export function __resetDataSourceForTest(): void {
  defaultDataSource = undefined;
}
```

- [x] **Step 3: Verify typeorm-pglite installed**

```bash
bun run -e "const { PGliteDriver } = require('typeorm-pglite'); console.log('OK:', typeof PGliteDriver)"
```

Expected: `OK: function`

- [x] **Step 4: Commit**

```bash
git add services/platform-core/src/infrastructure/application-database/typeorm.config.ts package.json bun.lockb
git commit -m "feat(db): add TypeORM DataSource config with PGlite dual-mode driver"
```

---

## Task 2: Convert Entity Decorators (Batch — 93 Entities)

**Files:**
- Modify: All files under `services/platform-core/src/infrastructure/application-database/entities/**/*.ts`

This is mechanical translation. Each entity follows the same pattern. The decorator mapping:

| MikroORM | TypeORM |
|---|---|
| `@Entity({ tableName: "x" })` | `@Entity("x")` |
| `@PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })` | `@PrimaryGeneratedColumn("uuid")` |
| `@Property({ type: "string", fieldName: "x" })` | `@Column({ name: "x" })` |
| `@Property({ type: "text" })` | `@Column({ type: "text" })` |
| `@Property({ type: "boolean", default: false })` | `@Column({ type: "boolean", default: false })` |
| `@Property({ type: "json", nullable: true })` | `@Column({ type: "jsonb", nullable: true })` |
| `@Property({ type: "Date", defaultRaw: "now()" })` | `@CreateDateColumn({ name: "created_at" })` or `@Column({ type: "timestamptz", default: () => "now()" })` |
| `@ManyToOne(() => X, { fieldName: "x_id", deleteRule: "cascade" })` | `@ManyToOne(() => X, { onDelete: "CASCADE" }) @JoinColumn({ name: "x_id" })` |
| `@OneToMany(() => X, x => x.parent)` | `@OneToMany(() => X, x => x.parent)` |
| `@Enum(() => MyEnum)` | `@Column({ type: "enum", enum: MyEnum })` |
| `@Index({ properties: ["a", "b"] })` | `@Index(["a", "b"])` on entity class |
| `@Unique({ properties: ["a", "b"] })` | `@Unique(["a", "b"])` on entity class |
| `[OptionalProps]?: ...` | Remove (TypeORM doesn't use this) |

- [x] **Step 1: Convert a representative entity first as proof-of-concept**

Convert `GithubConnectorState` entity. Before (MikroORM):

```typescript
import { Entity, PrimaryKey, Property, ManyToOne, Index, OptionalProps } from "@mikro-orm/core";
import { Org } from "../core/Org.js";

@Entity({ tableName: "github_connector_state" })
@Index({ properties: ["org", "projectId"] })
export class GithubConnectorState {
  [OptionalProps]?: "payload" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;
}
```

After (TypeORM):

```typescript
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Org } from "../core/Org.js";

@Entity("github_connector_state")
@Index(["org", "projectId"])
export class GithubConnectorState {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;
}
```

- [x] **Step 2: Batch-convert all 93 entities using the same pattern**

Work through each subdirectory under `entities/`:
- `core/` — Org, User, OrgMember, etc. (foundational, do first)
- `auth/` — Session, Account, Verification, etc.
- `tasks/` — Task, Project, Sprint, CustomField, etc.
- `docs/` — Document, DocumentVersion, etc.
- `connectors/` — GithubConnectorState, etc.
- `repos/` — Repo, RepoBranch, etc.
- `notifications/` — Notification, NotificationPreference, etc.
- `orchestration/` — AgentRun, RoutingRule, etc.
- `memory/` — MemoryEntry, etc.
- `skills/` — Skill, SkillVersion, etc.
- `flags/` — FeatureFlag, FlagOverride, etc.
- `sandbox/` — Sandbox, SandboxSession, etc.
- `artifacts/` — Artifact, ArtifactRetentionPolicy, etc.

For every file:
1. Replace `@mikro-orm/core` imports with `typeorm` imports
2. Replace `@mikro-orm/decorators` imports with `typeorm` imports
3. Apply decorator mapping table above
4. Remove `[OptionalProps]` declarations
5. Remove `{ repository: () => XxxRepository }` from `@Entity()` options
6. Add `@JoinColumn({ name: "x_id" })` to every `@ManyToOne` relation

- [x] **Step 3: Update getCoreEntities() in typeorm.config.ts**

Import all 93 converted entities and return them from `getCoreEntities()`.

- [x] **Step 4: Verify TypeScript compiles**

```bash
bunx tsc --noEmit --project services/platform-core/tsconfig.json
```

Expected: No errors related to entity decorators.

- [x] **Step 5: Commit**

```bash
git add services/platform-core/src/infrastructure/application-database/entities/
git add services/platform-core/src/infrastructure/application-database/typeorm.config.ts
git commit -m "refactor(db): convert all 93 MikroORM entities to TypeORM decorators"
```

---

## Task 3: Rewrite Custom Repositories (40 Files)

**Files:**
- Modify: All files under `services/platform-core/src/infrastructure/application-database/repositories/**/*.ts`

MikroORM pattern (before):

```typescript
import { injectable } from "needle-di";
import { EntityRepository } from "@mikro-orm/postgresql";
import { Repo } from "../entities/repos/Repo.js";

@injectable()
export class RepoRepository extends EntityRepository<Repo> {
  async create(input: CreateRepoInput): Promise<Repo> {
    const repo = new Repo();
    repo.org = this.em.getReference(Org, input.orgId);
    repo.name = input.name;
    this.em.persist(repo);
    await this.em.flush();
    return repo;
  }

  async list(input: ListRepoInput): Promise<Repo[]> {
    return this.findAll({ where: { org: input.orgId } });
  }
}
```

TypeORM pattern (after):

```typescript
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Repo } from "../entities/repos/Repo.js";
import { Org } from "../entities/core/Org.js";

@Injectable()
export class RepoRepository {
  constructor(
    @InjectRepository(Repo)
    private readonly repo: Repository<Repo>,
  ) {}

  async create(input: CreateRepoInput): Promise<Repo> {
    const entity = this.repo.create({
      org: { id: input.orgId } as Org,
      name: input.name,
    });
    return this.repo.save(entity);
  }

  async list(input: ListRepoInput): Promise<Repo[]> {
    return this.repo.find({ where: { org: { id: input.orgId } } });
  }
}
```

- [x] **Step 1: Convert all 40 repository files**

For each repository:
1. Replace `@injectable()` (needle-di) with `@Injectable()` (NestJS)
2. Replace `extends EntityRepository<X>` with constructor injection of `Repository<X>`
3. Replace `this.em.persist()` + `this.em.flush()` with `this.repo.save()`
4. Replace `this.em.getReference(Entity, id)` with `{ id } as Entity`
5. Replace `this.findAll({ where: ... })` with `this.repo.find({ where: ... })`
6. Replace `this.findOne({ ... })` with `this.repo.findOne({ where: ... })`
7. Replace `this.em.remove(entity)` + `this.em.flush()` with `this.repo.remove(entity)`

- [x] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit --project services/platform-core/tsconfig.json
```

- [x] **Step 3: Commit**

```bash
git add services/platform-core/src/infrastructure/application-database/repositories/
git commit -m "refactor(db): convert 40 MikroORM repositories to TypeORM Repository<T>"
```

---

## Task 4: Rewrite db.module.ts as NestJS Module

**Files:**
- Rewrite: `services/platform-core/src/infrastructure/application-database/db.module.ts`

Replace 414-line needle-di module with NestJS `@Module`:

- [x] **Step 1: Write the new NestJS database module**

```typescript
// services/platform-core/src/infrastructure/application-database/db.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { getCoreEntities, createDataSourceOptions } from "./typeorm.config.js";

// Import all 40 custom repository classes
import { RepoRepository } from "./repositories/repos/RepoRepository.js";
// ... (all 40 imports)

@Module({
  imports: [
    TypeOrmModule.forRoot(createDataSourceOptions()),
    TypeOrmModule.forFeature(getCoreEntities()),
  ],
  providers: [
    RepoRepository,
    // ... all 40 custom repositories as providers
  ],
  exports: [
    TypeOrmModule,
    RepoRepository,
    // ... all 40 custom repositories as exports
  ],
})
export class ApplicationDatabaseModule {}
```

- [x] **Step 2: Update app.module.ts to import ApplicationDatabaseModule**

Ensure `apps/server/src/app.module.ts` imports `ApplicationDatabaseModule` and all service modules can access TypeORM repos.

- [x] **Step 3: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add services/platform-core/src/infrastructure/application-database/db.module.ts
git add apps/server/src/app.module.ts
git commit -m "refactor(db): replace needle-di db.module with NestJS TypeOrmModule"
```

---

## Task 5: Write Fresh TypeORM Migrations

**Files:**
- Create: `services/platform-core/src/infrastructure/application-database/migrations/` (fresh set)
- Create: `services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations/` (archive)

- [x] **Step 1: Archive old MikroORM migrations**

```bash
cd /Users/mkh/workspace/fulcrum
mkdir -p services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations
mv services/platform-core/src/infrastructure/application-database/migrations/*.ts services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations/
```

- [x] **Step 2: Generate TypeORM migration from current entity state**

```bash
bunx typeorm migration:generate -d services/platform-core/src/infrastructure/application-database/typeorm.config.ts services/platform-core/src/infrastructure/application-database/migrations/InitialSchema
```

If auto-generation doesn't work with PGlite, write the migration manually based on entity definitions. Group into logical migrations:

- `001_core_and_auth.ts` — Org, User, OrgMember, Session, Account, Verification
- `002_work_management.ts` — Task, Project, Sprint, CustomField, SavedView, Template
- `003_knowledge.ts` — Document, DocumentVersion, Memory, Search
- `004_orchestration.ts` — AgentRun, RoutingRule, Sandbox
- `005_integration.ts` — Repo, Connector, Webhook, DataPortability
- `006_notifications.ts` — Notification, NotificationPreference
- `007_artifacts.ts` — Artifact, ArtifactRetentionPolicy
- `008_flags_and_skills.ts` — FeatureFlag, Skill, SkillVersion
- `009_indexes.ts` — All 141 composite/single indexes

- [x] **Step 3: Test migrations run against PGlite**

```bash
bun run -e "
const { initDataSource } = require('./services/platform-core/src/infrastructure/application-database/typeorm.config');
initDataSource().then(ds => ds.runMigrations()).then(() => console.log('OK')).catch(e => console.error(e));
"
```

- [x] **Step 4: Commit**

```bash
git add services/platform-core/src/infrastructure/application-database/migrations/
git add services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations/
git commit -m "refactor(db): fresh TypeORM migrations replacing 52 MikroORM migrations"
```

---

## Task 6: Update Service Modules to Use TypeORM DI

**Files:**
- Modify: All `*-public-api.module.ts` or `*.module.ts` files across 9 services

Each service module should:
1. Import `TypeOrmModule.forFeature([...entities owned by this service])`
2. Register its domain repositories as providers
3. Remove any needle-di container references

- [x] **Step 1: Update each service module**

Example for work-management:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Project, Sprint, CustomField, SavedView, Template]),
  ],
  controllers: [
    TaskPublicApiController,
    ProjectPublicApiController,
    SprintPublicApiController,
    // ...
  ],
  providers: [
    TaskRepository,
    ProjectRepository,
    // ... domain services
  ],
  exports: [TaskRepository, ProjectRepository],
})
export class WorkManagementModule {}
```

Repeat for: identity-access, execution-orchestration, integration-hub, knowledge-workspace, notification-center, workflow-coordination, planning-review.

- [x] **Step 2: Remove needle-di imports from all service files**

```bash
rg -l "needle-di" services/ --type ts
```

Replace each `@injectable()` with `@Injectable()` from `@nestjs/common`.

- [x] **Step 3: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add services/
git commit -m "refactor(db): wire TypeOrmModule.forFeature in all service modules, remove needle-di"
```

---

## Task 7: Bulk Replace Imports + Remove Old Files

**Files:**
- Delete: `services/platform-core/src/infrastructure/application-database/mikro-orm.config.ts`
- Delete: `services/platform-core/src/infrastructure/application-database/PGliteKyselyDriver.ts`
- Modify: ~2,100 import lines across codebase

- [x] **Step 1: Delete MikroORM config and Kysely bridge**

```bash
rm services/platform-core/src/infrastructure/application-database/mikro-orm.config.ts
rm services/platform-core/src/infrastructure/application-database/PGliteKyselyDriver.ts
```

- [x] **Step 2: Bulk replace remaining MikroORM imports**

```bash
# Find any remaining @mikro-orm imports
rg -l "@mikro-orm" services/ apps/ --type ts
```

For each file, replace:
- `from "@mikro-orm/core"` → `from "typeorm"`
- `from "@mikro-orm/postgresql"` → `from "typeorm"`
- `from "@mikro-orm/decorators"` → `from "typeorm"`
- `from "@mikro-orm/sql"` → remove (TypeORM doesn't have this)
- `from "@mikro-orm/migrations"` → remove (handled by TypeORM CLI)

- [x] **Step 3: Verify zero MikroORM imports remain**

```bash
rg "@mikro-orm" services/ apps/ src/ --type ts
```

Expected: No results (except possibly in _archived-mikro-migrations/).

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(db): remove MikroORM config, Kysely bridge, and all MikroORM imports"
```

---

## Task 8: Remove MikroORM Dependencies from package.json

**Files:**
- Modify: `package.json`

- [x] **Step 1: Remove MikroORM and Kysely packages**

```bash
bun remove @mikro-orm/core @mikro-orm/decorators @mikro-orm/migrations @mikro-orm/postgresql @mikro-orm/sql @mikro-orm/knex kysely needle-di
```

- [x] **Step 2: Verify no MikroORM in dependencies**

```bash
cat package.json | jq '.dependencies | keys[] | select(test("mikro-orm|kysely|needle-di"))'
```

Expected: No output.

- [x] **Step 3: Verify bun install succeeds**

```bash
bun install
```

- [x] **Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore(deps): remove @mikro-orm/*, kysely, needle-di from dependencies"
```

---

## Task 9: Fix Tests (~50 Test Files)

**Files:**
- Modify: All `*.test.ts` and `*.spec.ts` files that reference MikroORM

- [x] **Step 1: Find all test files referencing MikroORM patterns**

```bash
rg -l "EntityManager|MikroORM|mikro-orm|em\.persist|em\.flush|em\.getRepository|em\.getReference" services/ apps/ tests/ --type ts -g "*.test.*" -g "*.spec.*"
```

- [x] **Step 2: Update test setup to use TypeORM DataSource**

Replace MikroORM test patterns:

Before:
```typescript
const orm = await MikroORM.init(testConfig);
const em = orm.em.fork();
```

After:
```typescript
const ds = new DataSource({ ...createDataSourceOptions(), synchronize: true });
await ds.initialize();
const repo = ds.getRepository(Entity);
```

For NestJS integration tests:
```typescript
const module = await Test.createTestingModule({
  imports: [
    TypeOrmModule.forRoot({ ...createDataSourceOptions(), synchronize: true }),
    TypeOrmModule.forFeature([Entity]),
  ],
}).compile();
```

- [x] **Step 3: Run all tests**

```bash
bun test
```

Fix any remaining failures.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "test(db): update all test files for TypeORM DataSource"
```

---

## Task 10: Split platform-core God Module — Move Entities to Owning Services

**Files:**
- Move: `services/platform-core/src/infrastructure/application-database/entities/<domain>/` → `services/<owning-service>/src/infrastructure/database/entities/`
- Move: `services/platform-core/src/infrastructure/application-database/repositories/<domain>/` → `services/<owning-service>/src/infrastructure/database/repositories/`
- Modify: All import paths referencing moved entities

Entity ownership mapping:

| Service | Entities to move |
|---|---|
| identity-access | `auth/` entities (Session, Account, Verification, Invitation + User, OrgMember) |
| work-management | `tasks/` entities (Task, Project, Sprint, CustomField, SavedView, Template, Automation, FieldDependency, Relationship) |
| knowledge-workspace | `docs/` entities (Document, DocumentVersion), `memory/` entities, `search/` entities |
| execution-orchestration | `orchestration/` entities (AgentRun, RoutingRule), `sandbox/` entities |
| integration-hub | `connectors/` entities, `repos/` entities |
| notification-center | `notifications/` entities |
| workflow-coordination | `artifacts/` entities |
| platform-core (keep) | `core/` (Org, TenantSetting), `flags/`, `skills/`, `jobs/`, SchemaMigration |

- [x] **Step 1: Create infrastructure/database/ directory in each service**

```bash
for svc in identity-access work-management knowledge-workspace execution-orchestration integration-hub notification-center workflow-coordination; do
  mkdir -p services/$svc/src/infrastructure/database/entities
  mkdir -p services/$svc/src/infrastructure/database/repositories
done
```

- [x] **Step 2: Move entity files to owning services**

Move each entity subdirectory to its owning service. Example for work-management:

```bash
mv services/platform-core/src/infrastructure/application-database/entities/tasks/ \
   services/work-management/src/infrastructure/database/entities/
mv services/platform-core/src/infrastructure/application-database/repositories/tasks/ \
   services/work-management/src/infrastructure/database/repositories/
```

Repeat for each service per the mapping above.

- [x] **Step 3: Update all import paths**

For each moved entity, find all files importing it and update the path:

```bash
rg -l "from.*platform-core.*entities/tasks" services/ apps/ --type ts
```

Update imports to point to new location in the owning service.

- [x] **Step 4: Update TypeOrmModule.forFeature() in each service module**

Each service module now imports its own entities directly:

```typescript
// services/work-management/src/interface/http/work-management.module.ts
import { Task } from "../../infrastructure/database/entities/Task.js";
// ...
@Module({
  imports: [TypeOrmModule.forFeature([Task, Project, Sprint, ...])],
})
```

- [x] **Step 5: Update platform-core's ApplicationDatabaseModule**

Remove moved entities from `getCoreEntities()`. Keep only shared entities (Org, TenantSetting, FeatureFlag, etc.).

- [x] **Step 6: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [x] **Step 7: Run tests**

```bash
bun test
```

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(arch): split platform-core god module — entities owned by domain services"
```

---

## Task 11: Extract DTOs from Controllers (60+ Controllers)

**Files:**
- Create: `services/<service>/src/interface/http/dto/` directories
- Modify: All `*-public-api.controller.ts` files

Currently class-validator decorators are inline in controller methods. Extract to proper DTO classes.

- [x] **Step 1: Create dto/ directories in each service**

```bash
for svc in identity-access work-management knowledge-workspace execution-orchestration integration-hub notification-center workflow-coordination platform-core; do
  mkdir -p services/$svc/src/interface/http/dto
done
```

- [x] **Step 2: Extract DTOs from controllers — pattern**

Before (inline in controller):
```typescript
@Post()
async create(@Body() body: { name: string; @IsString() description: string }) {
  return this.service.create(body);
}
```

After (separate DTO file):
```typescript
// dto/create-task.dto.ts
import { IsString, IsOptional, MinLength } from "class-validator";

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

// controller
@Post()
async create(@Body() body: CreateTaskDto) {
  return this.service.create(body);
}
```

- [x] **Step 3: Extract DTOs for each service**

Work through each service's controllers:
1. Identify all `@Body()`, `@Query()`, `@Param()` inline types
2. Extract to `dto/create-*.dto.ts`, `dto/update-*.dto.ts`, `dto/query-*.dto.ts`
3. Use `PartialType()` from `@nestjs/mapped-types` for update DTOs
4. Add Swagger decorators (`@ApiProperty()`) to each DTO field

- [x] **Step 4: Create response DTOs — never expose entities directly**

For each entity returned by a controller, create a response DTO:

```typescript
// dto/task-response.dto.ts
export class TaskResponseDto {
  id!: string;
  name!: string;
  status!: string;
  createdAt!: Date;
}
```

Map entity → response DTO in controller or via `ClassSerializerInterceptor`.

- [x] **Step 5: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [x] **Step 6: Commit**

```bash
git add services/*/src/interface/http/dto/
git add services/*/src/interface/http/*-public-api.controller.ts
git commit -m "refactor(api): extract DTOs from controllers, add response DTOs"
```

---

## Task 12: Consolidate tRPC Routers

**Files:**
- Modify/Move: `apps/server/src/runtime/trpc/routers/` → merge into `apps/server/src/trpc/routers/`
- Modify: `apps/server/src/trpc/router.ts` (main AppRouter)

- [x] **Step 1: Audit both tRPC directories**

```bash
ls -la apps/server/src/trpc/routers/
ls -la apps/server/src/runtime/trpc/routers/ 2>/dev/null
```

Identify overlapping routers, routers with business logic, and routers that are thin adapters.

- [x] **Step 2: Merge runtime/trpc/routers/ into trpc/routers/**

For each router in `runtime/trpc/routers/`:
- If duplicate exists in `trpc/routers/`, merge logic into the primary
- If unique, move file to `trpc/routers/`
- Extract any business logic to service layer

- [x] **Step 3: Remove runtime/trpc/ directory**

```bash
rm -rf apps/server/src/runtime/trpc/
```

- [x] **Step 4: Update AppRouter imports**

Update `apps/server/src/trpc/router.ts` to only import from single `routers/` directory.

- [x] **Step 5: Verify TypeScript compiles and tests pass**

```bash
bunx tsc --noEmit && bun test
```

- [x] **Step 6: Commit**

```bash
git add apps/server/src/trpc/ apps/server/src/runtime/
git commit -m "refactor(api): consolidate tRPC routers to single directory"
```

---

## Task 13: Remove Stub/Empty Services

**Files:**
- Delete: `services/inference-runtime/` (empty — 0 files)
- Evaluate: `services/agent-client-protocol/` (8 files, minimal)

- [x] **Step 1: Remove empty inference-runtime**

```bash
rm -rf services/inference-runtime/
```

- [x] **Step 2: Evaluate agent-client-protocol**

```bash
find services/agent-client-protocol/ -type f | head -20
wc -l services/agent-client-protocol/src/**/*.ts 2>/dev/null
```

If stub with no real implementation → remove. If placeholder with clear future use → document timeline in AGENTS.md under "Where we are going" section.

- [x] **Step 3: Update app.module.ts**

Remove imports for deleted service modules.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove empty/stub services (inference-runtime, agent-client-protocol)"
```

---

## Task 14: Co-locate Tests

**Files:**
- Move: `tests/<domain>/` → co-located `*.test.ts` beside source in `services/`
- Keep: `tests/architecture/` at root (spans multiple services)

- [x] **Step 1: List root test files and their corresponding source**

```bash
find tests/ -name "*.test.ts" -not -path "tests/architecture/*" | sort
```

For each test file, identify the source file it tests and move the test beside it.

- [x] **Step 2: Move domain tests to services**

Example:
```bash
# tests/platform-core/health-checks/tui-checks.test.ts
# → services/platform-core/src/application/health-checks/tui-checks.test.ts
mv tests/platform-core/health-checks/tui-checks.test.ts \
   services/platform-core/src/application/health-checks/
```

Repeat for all non-architecture test files.

- [x] **Step 3: Update import paths in moved tests**

Each moved test file may need updated relative imports.

- [x] **Step 4: Keep architecture tests at root**

```bash
ls tests/architecture/
```

These test cross-service constraints and belong at root. Do not move.

- [x] **Step 5: Clean empty test directories**

```bash
find tests/ -type d -empty -delete
```

- [x] **Step 6: Verify all tests pass**

```bash
bun test
```

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(test): co-locate domain tests beside source files"
```

---

## Task 15: Final Verification + Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTEXT-MAP.md`
- Remove: Orphaned/empty directories

- [x] **Step 1: Remove empty directories**

```bash
find services/ apps/ -type d -empty -delete
```

- [x] **Step 2: Verify zero MikroORM imports**

```bash
rg "@mikro-orm" services/ apps/ --type ts | grep -v "_archived"
```

Expected: No results.

- [x] **Step 3: Verify entity ownership**

```bash
# platform-core should only have shared entities
ls services/platform-core/src/infrastructure/application-database/entities/
# Each service should own its domain entities
for svc in identity-access work-management knowledge-workspace execution-orchestration integration-hub notification-center workflow-coordination; do
  echo "=== $svc ===" && ls services/$svc/src/infrastructure/database/entities/ 2>/dev/null
done
```

- [x] **Step 4: Update AGENTS.md**

Verify no stale MikroORM references. Update service list if services were removed.

- [x] **Step 5: Update CONTEXT-MAP.md**

Remove entries for deleted services. Add infrastructure/database context notes for services that now own their entities.

- [x] **Step 6: Run full CI (historical evidence; rerun required in current tree)**

```bash
bun run ci
```

Expected: All 6 stages pass.

- [x] **Step 7: Final commit (historical evidence; final closure requires current gates)**

```bash
git add -A
git commit -m "docs: update AGENTS.md, CONTEXT-MAP.md post-architecture-cleanup"
```
