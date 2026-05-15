# MikroORM → TypeORM Big-Bang Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MikroORM v7 with TypeORM as the sole ORM, wire NestJS-native TypeORM integration, use PGlite via `typeorm-pglite` as default local DB.

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

- [ ] **Step 1: Install typeorm-pglite**

```bash
bun add typeorm-pglite
```

- [ ] **Step 2: Write the DataSource config**

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

- [ ] **Step 3: Verify typeorm-pglite installed**

```bash
bun run -e "const { PGliteDriver } = require('typeorm-pglite'); console.log('OK:', typeof PGliteDriver)"
```

Expected: `OK: function`

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Convert a representative entity first as proof-of-concept**

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

- [ ] **Step 2: Batch-convert all 93 entities using the same pattern**

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

- [ ] **Step 3: Update getCoreEntities() in typeorm.config.ts**

Import all 93 converted entities and return them from `getCoreEntities()`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bunx tsc --noEmit --project services/platform-core/tsconfig.json
```

Expected: No errors related to entity decorators.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Convert all 40 repository files**

For each repository:
1. Replace `@injectable()` (needle-di) with `@Injectable()` (NestJS)
2. Replace `extends EntityRepository<X>` with constructor injection of `Repository<X>`
3. Replace `this.em.persist()` + `this.em.flush()` with `this.repo.save()`
4. Replace `this.em.getReference(Entity, id)` with `{ id } as Entity`
5. Replace `this.findAll({ where: ... })` with `this.repo.find({ where: ... })`
6. Replace `this.findOne({ ... })` with `this.repo.findOne({ where: ... })`
7. Replace `this.em.remove(entity)` + `this.em.flush()` with `this.repo.remove(entity)`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bunx tsc --noEmit --project services/platform-core/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add services/platform-core/src/infrastructure/application-database/repositories/
git commit -m "refactor(db): convert 40 MikroORM repositories to TypeORM Repository<T>"
```

---

## Task 4: Rewrite db.module.ts as NestJS Module

**Files:**
- Rewrite: `services/platform-core/src/infrastructure/application-database/db.module.ts`

Replace 414-line needle-di module with NestJS `@Module`:

- [ ] **Step 1: Write the new NestJS database module**

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

- [ ] **Step 2: Update app.module.ts to import ApplicationDatabaseModule**

Ensure `apps/server/src/app.module.ts` imports `ApplicationDatabaseModule` and all service modules can access TypeORM repos.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Archive old MikroORM migrations**

```bash
cd /Users/mkh/workspace/fulcrum
mkdir -p services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations
mv services/platform-core/src/infrastructure/application-database/migrations/*.ts services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations/
```

- [ ] **Step 2: Generate TypeORM migration from current entity state**

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

- [ ] **Step 3: Test migrations run against PGlite**

```bash
bun run -e "
const { initDataSource } = require('./services/platform-core/src/infrastructure/application-database/typeorm.config');
initDataSource().then(ds => ds.runMigrations()).then(() => console.log('OK')).catch(e => console.error(e));
"
```

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Update each service module**

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

- [ ] **Step 2: Remove needle-di imports from all service files**

```bash
rg -l "needle-di" services/ --type ts
```

Replace each `@injectable()` with `@Injectable()` from `@nestjs/common`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Delete MikroORM config and Kysely bridge**

```bash
rm services/platform-core/src/infrastructure/application-database/mikro-orm.config.ts
rm services/platform-core/src/infrastructure/application-database/PGliteKyselyDriver.ts
```

- [ ] **Step 2: Bulk replace remaining MikroORM imports**

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

- [ ] **Step 3: Verify zero MikroORM imports remain**

```bash
rg "@mikro-orm" services/ apps/ src/ --type ts
```

Expected: No results (except possibly in _archived-mikro-migrations/).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(db): remove MikroORM config, Kysely bridge, and all MikroORM imports"
```

---

## Task 8: Remove MikroORM Dependencies from package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove MikroORM and Kysely packages**

```bash
bun remove @mikro-orm/core @mikro-orm/decorators @mikro-orm/migrations @mikro-orm/postgresql @mikro-orm/sql @mikro-orm/knex kysely needle-di
```

- [ ] **Step 2: Verify no MikroORM in dependencies**

```bash
cat package.json | jq '.dependencies | keys[] | select(test("mikro-orm|kysely|needle-di"))'
```

Expected: No output.

- [ ] **Step 3: Verify bun install succeeds**

```bash
bun install
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore(deps): remove @mikro-orm/*, kysely, needle-di from dependencies"
```

---

## Task 9: Fix Tests (~50 Test Files)

**Files:**
- Modify: All `*.test.ts` and `*.spec.ts` files that reference MikroORM

- [ ] **Step 1: Find all test files referencing MikroORM patterns**

```bash
rg -l "EntityManager|MikroORM|mikro-orm|em\.persist|em\.flush|em\.getRepository|em\.getReference" services/ apps/ tests/ --type ts -g "*.test.*" -g "*.spec.*"
```

- [ ] **Step 2: Update test setup to use TypeORM DataSource**

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

- [ ] **Step 3: Run all tests**

```bash
bun test
```

Fix any remaining failures.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(db): update all test files for TypeORM DataSource"
```

---

## Task 10: Project Cleanup

**Files:**
- Delete: Empty `inference-runtime/` service
- Modify: `agent-client-protocol/` — clarify or remove
- Consolidate: tRPC router locations
- Remove: Orphaned/empty directories

- [ ] **Step 1: Remove empty inference-runtime service**

```bash
rm -rf services/inference-runtime/
```

- [ ] **Step 2: Consolidate tRPC routers**

```bash
# Check what's in runtime/trpc/routers/ vs trpc/routers/
ls apps/server/src/runtime/trpc/routers/ 2>/dev/null
ls apps/server/src/trpc/routers/
```

Merge into single `apps/server/src/trpc/routers/` location. Update imports.

- [ ] **Step 3: Remove any empty directories**

```bash
find services/ apps/ -type d -empty -delete
```

- [ ] **Step 4: Final verification**

```bash
bun run ci
```

Expected: All 6 stages pass (install / typecheck / test / build:all / skills:lint / compress:check).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove empty services, consolidate tRPC routers, clean project structure"
```

---

## Task 11: Update AGENTS.md and Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTEXT-MAP.md` (remove inference-runtime if deleted)

- [ ] **Step 1: Verify AGENTS.md ORM references are correct**

AGENTS.md already says "Single NestJS/TypeORM server target" — verify no stale MikroORM references remain.

- [ ] **Step 2: Update CONTEXT-MAP.md**

Remove any references to deleted services.

- [ ] **Step 3: Final commit**

```bash
git add AGENTS.md CONTEXT-MAP.md
git commit -m "docs: update AGENTS.md and CONTEXT-MAP.md post-migration"
```
