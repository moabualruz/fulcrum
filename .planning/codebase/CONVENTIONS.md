# Coding Conventions

**Analysis Date:** 2026-05-04

## Naming Patterns

**Entity Files (MikroORM):**
- PascalCase single-noun: `Task.ts`, `Sprint.ts`, `User.ts`, `Org.ts`, `Document.ts`
- Located in domain subdirs: `src/db/entities/{domain}/`
- Barrel re-exports via `index.ts` in each entity subdirectory

**Repository Files:**
- PascalCase with `Repository` suffix: `TaskRepository.ts`, `SchemaMigrationRepository.ts`
- Mirror entity domain dirs: `src/db/repositories/{domain}/`

**tRPC Router Files:**
- kebab-case or lowercase plural: `src/trpc/routers/tasks.ts`, `src/trpc/routers/artifacts.ts`
- One router per domain, exported as `{domain}Router`

**tRPC Schema Files:**
- kebab-case or lowercase plural: `src/trpc/schemas/tasks.ts`, `src/trpc/schemas/artifacts.ts`
- Zod schemas named `{Entity}{Purpose}Schema`: `TaskSchema`, `TaskStatusSchema`, `ListTasksInputSchema`

**CLI Command Files:**
- kebab-case: `src/cli/install.ts`, `src/cli/vendor-rules.ts`, `src/cli/package-mirror.ts`

**Test Files:**
- Co-located with source, suffix `.test.ts`: `install.test.ts`, `rules-engine.test.ts`
- Some tests in top-level `tests/` dir mirroring `src/` structure

**Utility Files:**
- kebab-case: `src/utils/proc.ts`, `src/utils/io.ts`, `src/utils/source-clean.ts`

**Functions:**
- camelCase: `createTestOrm`, `assembleSkillContext`, `lockCavemanUltra`, `scrubPaths`

**Variables/Constants:**
- camelCase for locals: `sandboxHome`, `webInstallCache`
- SCREAMING_SNAKE for module constants: `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ORG_ID`, `CI_ENV`

**Types/Interfaces:**
- PascalCase: `TestOrm`, `TestContainer`, `TestSession`, `ErrorReportEntry`
- Prefixed with `I` — NOT used (bare PascalCase only)

## Code Style

**Formatting:**
- No Prettier or Biome configured — formatting relies on editor defaults
- 2-space indentation in TypeScript files
- Semicolons used consistently
- Double quotes for imports

**Linting:**
- TypeScript strict mode: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- `verbatimModuleSyntax: true` — must use `import type` for type-only imports
- `isolatedModules: true` — no const enums or namespace merging
- Lint command: `bun run --bun tsc --noEmit`

**TypeScript Strictness:**
- `tsconfig.json` enforces strict null checks, unchecked indexed access
- Target ESNext with bundler module resolution
- Bun types via `@types/bun`

## Import Organization

**Order (observed pattern):**
1. Node.js built-ins (`node:fs`, `node:path`, `node:os`, `node:crypto`)
2. External packages (`@trpc/server`, `zod`, `@mikro-orm/*`, `bun:test`)
3. Internal absolute (`../db/entities/...`, `../trpc/...`)
4. Relative siblings (`./install.ts`, `./auth.ts`)

**Path Aliases:**
- `@/*` maps to `src/*` (defined in `tsconfig.json`) — but rarely used in practice
- Most imports use relative paths with explicit `.ts` extension: `from "./install.ts"`
- `allowImportingTsExtensions: true` — always include `.ts` extension on local imports

**Barrel Files:**
- Used in entity dirs: `src/db/entities/tasks/index.ts`, `src/db/entities/auth/index.ts`
- Used in module roots: `src/test-utils/index.ts`, `src/flags/index.ts`, `src/connectors/index.ts`
- Pattern: named re-exports, no default exports

**Type-Only Imports:**
- Required by `verbatimModuleSyntax`:
  ```typescript
  import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
  import type { Session } from "better-auth";
  ```

## Error Handling

**tRPC Layer:**
- Use `TRPCError` with appropriate codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`
- Error formatter adds `requestId` to every error shape (`src/trpc/trpc.ts`)
- `protectedProcedure` middleware enforces session presence — missing session → `UNAUTHORIZED`

**Error Reporting:**
- Gated remote error reporting behind `FULCRUM_FEATURES=error-reporting-remote` flag
- Stack traces scrubbed of absolute paths before transmission (`src/errors/reporter.ts`)
- HMAC-SHA256 signing for outbound error reports
- No PII in error payloads

**General Pattern:**
- Throw descriptive errors with context
- Feature-flag gating: build always, gate ON behind flag (C1 convention)

## Commit Message Conventions

**Format:** Conventional Commits — `type(scope): subject`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`
- Scope examples: `web`, `test-gaps`, `01` (phase numbers)
- Subject: lowercase, imperative mood, no trailing period

**Examples from history:**
```
feat: add test coverage scratch plan + update README + feature guide
fix(web): use local inference client on settings page
fix(web): resolve dashboard crash — remove conflicting migration + auto-seed default org
docs: add Wave 1 master audit report
docs(01): create phase plan — 10 plans in 4 waves
```

**Changelog:** Generated via `git-cliff` (`bun run changelog`)

## Code Organization Per Module

**Entity → Repository → Schema → Router pattern:**

1. **Entity** (`src/db/entities/{domain}/{Entity}.ts`):
   - MikroORM v7 ES Stage-3 decorators (`@mikro-orm/decorators/es`)
   - `@Entity({ tableName, repository })` wires to repository class
   - Explicit `type` on every `@Property`/`@PrimaryKey` (Stage-3 no reflect-metadata)

2. **Repository** (`src/db/repositories/{domain}/{Entity}Repository.ts`):
   - Extends `EntityRepository<Entity>` from MikroORM
   - Decorated with `@injectable()` from `@needle-di/core`
   - Defines typed input interfaces: `TaskCreateInput`, `TaskListInput`, etc.

3. **Schema** (`src/trpc/schemas/{domain}.ts`):
   - Zod v4 schemas shared across web, CLI, and TUI surfaces
   - Every field gets `.describe()` for OpenAPI generation
   - Pattern: `{Entity}Schema` for output, `{Action}{Entity}InputSchema` for input

4. **Router** (`src/trpc/routers/{domain}.ts`):
   - Uses `protectedProcedure` for auth-required endpoints
   - Procedures reference schemas for input/output validation
   - One router per domain, composed in `src/trpc/router.ts`

**DI Container:**
- needle-di `Container` for dependency injection
- `registerDbBindings()` wires ORM into container
- Repositories resolved from `ctx.container` in tRPC procedures

## TypeScript Patterns

**Zod Schemas:**
```typescript
export const TaskStatusSchema = z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]);
export const TaskSchema = z.object({
  id: z.string().uuid().describe("Unique task identifier."),
  orgId: z.string().uuid().describe("Organisation the task belongs to."),
  title: z.string().describe("Short human-readable task title."),
  status: TaskStatusSchema.describe("Current workflow status of the task."),
  createdAt: z.date().describe("Timestamp when the task was created."),
});
```

**Feature Flags:**
- Feature gating via `FULCRUM_FEATURES` env var
- Build always, gate ON behind flag (C1 convention)
- `ExperimentStore` for A/B testing (`src/flags/experiments.ts`)

**MikroORM Entity Pattern:**
```typescript
@Entity({ tableName: "tasks", repository: () => TaskRepository })
@Index({ name: "idx_tasks_org_created", properties: ["org", "createdAt"] })
export class Task {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id" })
  org!: Org;

  @Property({ type: "timestamptz", defaultRaw: "now()" })
  createdAt!: Date;
}
```

**Non-null assertion (`!`):**
- Used on MikroORM entity properties (populated by ORM, not constructor)
- Used with indexed access after bounds check: `sections[0]!.heading`

## Module Design

**Exports:**
- Named exports only — no default exports in source files
- Exception: Svelte components use default exports (SvelteKit convention)

**Barrel Files:**
- Used for entity domains and module public APIs
- Re-export types alongside values

**File Header Comments:**
- JSDoc block at top of significant files explaining purpose, conventions, and pillar references
- Convention codes referenced: C1 (flag gating), C4 (shared schemas), C6 (no raw SQL), C7 (MikroORM decorators), C8 (DI pattern), C11 (casbin gating)

---

*Convention analysis: 2026-05-04*
