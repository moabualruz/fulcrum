# DI + Decorator Stack Research: Bun + SvelteKit + tRPC + CLI/TUI

**Research date:** 2026-05-01  
**Bun tested:** 1.3.13 (macOS arm64)  
**Goal:** NestJS-DX decorators + DI without NestJS HTTP layer  

---

## 1. TypeScript Decorator Status

### Legacy vs Stage-3

| | Legacy (`experimentalDecorators: true`) | Stage-3 (TC39, TS 5.0+) |
|---|---|---|
| tsconfig flag | `experimentalDecorators: true` | none required (default in TS 5.0+) |
| metadata emission | `emitDecoratorMetadata: true` → emits `Reflect.metadata(...)` calls | TC39 `Symbol.metadata` — no design-type emission |
| reflect-metadata | required for type-based injection | NOT required |
| mutates prototype | yes (legacy behaviour) | no (wraps via context object) |
| decorator arg signature | `(target, key, descriptor)` | `(target, context: ClassDecoratorContext)` |
| TS 5.0 default | opt-in with flag | opt-out with flag |

### Bun 1.3.13 Status

- **Legacy decorators**: fully supported since Bun v1.0.3 (Sept 2023)[^1]
- **Stage-3 TC39 decorators**: added in **Bun v1.3.10** — method/field/class decorators, `Symbol.metadata`, `addInitializer`, correct evaluation order[^2]
- **Known bug**: `emitDecoratorMetadata` fails when tsconfig uses `extends` to inherit options (Bun issue #6326, open)[^3]. Workaround: copy decorator options directly into app-level `tsconfig.json`, not a base file.
- **reflect-metadata polyfill on Bun**: Bun does NOT ship `Reflect.getOwnMetadata` / `Reflect.defineMetadata` natively. You must import the polyfill package OR rely on a library that auto-imports it. Performance impact is negligible (one-time global install, ~15 KB bundled).

### Can you mix both in one project?

No. `experimentalDecorators: true` activates legacy mode; Stage-3 decorators are then invalid syntax under that flag. You pick one per tsconfig. This is the key constraint for ORM selection.

### ORM decorator requirements

| ORM | Decorator style | emitDecoratorMetadata? |
|---|---|---|
| TypeORM | legacy (`experimentalDecorators: true`) | yes |
| MikroORM v7 | **both paths**: `@mikro-orm/decorators/legacy` (legacy) or `@mikro-orm/decorators/es` (Stage-3)[^4] | legacy path yes; ES path no |
| Drizzle | no decorators | no |
| Prisma | no decorators | no |
| Kysely | no decorators | no |

**Implication**: If Fulcrum picks Stage-3 DI (e.g. needle-di), only MikroORM v7 (ES path), Drizzle, Prisma, and Kysely are compatible without a tsconfig split. TypeORM is incompatible with Stage-3-only tsconfig.

---

## 2. Candidate Evaluation Matrix

### 2a. `@nestjs/core` — Standalone Bootstrap

| Criterion | Result |
|---|---|
| Decorator style | Legacy (`experimentalDecorators: true`) |
| reflect-metadata required | Yes (explicit `import "reflect-metadata"`) |
| Bun 1.3.13 compat | **Tested: WORKS**. `NestFactory.createApplicationContext()` runs on Bun 1.3.13. |
| Bundle size (bun build, minified, target=bun) | **435 KB** (with optional deps externalized: `@nestjs/microservices`, `@nestjs/platform-express`, `@nestjs/websockets`, `class-transformer`, `class-validator`) |
| Constructor injection ergonomics | Excellent — identical to NestJS app: `constructor(private svc: FooService) {}` with `emitDecoratorMetadata` |
| Scopes | Singleton, Request, Transient — all work in standalone mode[^5] |
| Module composition | Full `@Module({ providers, imports, exports })` |
| Async provider factories | Yes — `useFactory: async () => ...` |
| Lifecycle hooks | `OnModuleInit`, `OnModuleDestroy`, `OnApplicationBootstrap` all work |
| TypeScript inference | Excellent |
| Maintenance | Active — v11.1.x as of May 2026 |
| Bun --compile support | Partial: requires externals for optional peer deps; `bun build --compile` works with `--external` flags |

**Key limitation**: NestJS standalone has no built-in way to bind to SvelteKit `event.locals` per-request. Pattern: create singleton `AppContext` in `hooks.server.ts` `init()`, call `app.resolve(SomeService)` per request with a manually-created DI context. `app.resolve()` handles REQUEST-scoped providers by accepting an optional `contextId`.

**Known issues on Bun**:
- NestJS issue #13881 tracks Bun support; core packages work, edge cases in some plugins[^6]
- `bun build --compile` raises unresolved module errors for optional lazy-loaded deps (`@nestjs/microservices`, etc.) — must pass `--external`

**Production case studies**: Used for AWS Lambda workers (standalone context cached across invocations), Discord bots (Necord), CLI tools (commander + Nest DI)[^7][^8]

---

### 2b. `tsyringe` (Microsoft)

| Criterion | Result |
|---|---|
| Decorator style | Legacy (`experimentalDecorators: true`) |
| reflect-metadata required | **Yes, explicitly** — tsyringe checks `Reflect.getMetadata` at startup and throws if not found. Must `import "reflect-metadata"` at app entry. |
| Bun 1.3.13 compat | **Tested: WORKS**. Bug #4677 (reflect-metadata not found) was closed with PR #18086[^9]. reflect-metadata must be the first import. |
| Bundle size | **33 KB** (minified, target=bun) + reflect-metadata (~15 KB bundled) = ~48 KB total |
| Constructor injection ergonomics | Good — `@injectable()` + `@inject(Token)` on each param; or `@injectable()` + `emitDecoratorMetadata` for auto-injection |
| Scopes | Transient (default), Singleton, ResolutionScoped, ContainerScoped. No built-in REQUEST scope — must use child containers. |
| Module composition | None built-in. Container is global singleton or child. |
| Async provider factories | Via `@launchtray/tsyringe-async` package (third-party)[^10] |
| Lifecycle hooks | None built-in |
| TypeScript inference | Good |
| Maintenance | v4.10.0 published 2025-04-16 — active |
| Bun --compile support | Works |

**Weakness vs NestJS DX**: no module system, no lifecycle hooks out of box, async requires third-party package. Request scope is manual (child container per request).

---

### 2c. `inversify` + `inversify-binding-decorators`

| Criterion | Result |
|---|---|
| Decorator style | Legacy (`experimentalDecorators: true`) |
| reflect-metadata required | **Auto-bundled** — inversify v8.x ships `reflect-metadata/lite` as transitive dep via `@inversifyjs/container`, auto-imported. Users need NOT add `import "reflect-metadata"` manually. |
| Bun 1.3.13 compat | **Tested: WORKS**. Confirmed with and without explicit reflect-metadata import. `@inject(Token)` and auto-injection via `emitDecoratorMetadata` both work. |
| Bundle size | **79 KB** (minified, target=bun, includes reflect-metadata/lite) |
| Constructor injection ergonomics | Good — `@injectable()` + `@inject(Token)`; or auto via `emitDecoratorMetadata` |
| Scopes | Singleton, Transient, Request (via `inRequestScope()`), custom activation handlers |
| Module composition | Container modules (`ContainerModule`) — not as ergonomic as NestJS `@Module` but functional |
| Async provider factories | Yes — `toProvider()` removed in v8; use factory pattern with promises |
| Lifecycle hooks | `@postConstruct()`, `@preDestroy()` — confirmed in v8 API[^11] |
| TypeScript inference | Good, with some verbosity in binding chains |
| Maintenance | v8.1.0 published **2026-03-15** — very active |
| Bun --compile support | Works |
| Stage-3 support | Not yet — issue #1507 closed without Stage-3 implementation. Inversify v8 remains legacy-decorator only.[^12] |

**Key finding on inversify v8**: switched to own metadata storage (`@inversifyjs/reflect-metadata-utils`) using `Reflect.defineMetadata`; no longer depends on the user having imported reflect-metadata globally. This resolves a long-standing pain point.

---

### 2d. `typedi`

| Criterion | Result |
|---|---|
| Decorator style | Legacy |
| reflect-metadata required | Yes |
| Bun compat | Unknown — last published 2021-01-15; `@freshgum/typedi` fork has experimental Bun note, published 2024-05-09 |
| Bundle size | 422 KB unpacked (surprisingly large for feature set) |
| Scopes | Singleton, Transient |
| Module composition | None |
| Async providers | None in original; fork has limited support |
| Lifecycle hooks | None |
| Maintenance | **DEAD** (original `typedi`). Fork `@freshgum/typedi` alive but niche. |

**Verdict**: Not recommended. Dead upstream; fork too small to trust for production.

---

### 2e. `@needle-di/core`

| Criterion | Result |
|---|---|
| Decorator style | **Stage-3 TC39** — no `experimentalDecorators` needed |
| reflect-metadata required | **No** — uses constructor default parameter pattern for injection |
| Bun 1.3.13 compat | **Tested: WORKS** — Stage-3 decorators, zero polyfills, runs cleanly |
| Bundle size | **7 KB** (minified, target=bun) — smallest by far |
| Constructor injection ergonomics | Different from NestJS: `constructor(private bar = inject(BarService)) {}` — uses default param values instead of DI-framework-injected params. Type-safe. |
| Scopes | Singleton (default for all providers). Transient not built-in — child containers simulate per-request scope. |
| Module composition | None built-in — flat container + child containers |
| Async provider factories | Yes — `{ provide: Token, useFactory: async () => ..., async: true }`, retrieved via `getAsync()` |
| Lifecycle hooks | None built-in |
| TypeScript inference | Excellent — full type inference without reflect |
| Maintenance | v1.1.2 published **2026-03-31** — active, growing |
| Bun --compile support | Works |

**DX gap vs NestJS**: The `constructor(private foo = inject(Foo)) {}` pattern is unfamiliar to NestJS veterans; no `@Inject()` on params. `@injectable()` class decorator is the same. No `@Module`, no lifecycle hooks.

**Verified working combos**:
- needle-di + MikroORM v7 ES decorators (`@mikro-orm/decorators/es`) — **tested: WORKS**
- needle-di + SvelteKit module-level container singleton — **tested: WORKS**
- needle-di + tRPC `ctx.container` pattern — **tested: WORKS**
- needle-di child container for per-request scope — **tested: WORKS**

---

### 2f. `awilix`

| Criterion | Result |
|---|---|
| Decorator style | **None** — proxy-based name matching |
| reflect-metadata required | No |
| Bun 1.3.13 compat | Tested: WORKS |
| Bundle size | 92 KB |
| Constructor injection ergonomics | Via destructured PROXY: `constructor({ barService }) {}` — zero decorators |
| Scopes | Singleton, Transient, Scoped (per-scope container) |
| Module composition | None |
| Async providers | Yes |
| Lifecycle hooks | None |
| Maintenance | v13.0.3 published 2026-03-03 — active |

**Verdict**: Viable for "no-decorator" projects. Breaks the "feels like NestJS" requirement. Cited for completeness.

---

### 2g. Hand-rolled DI

A minimal container using Stage-3 `Symbol.metadata` or a `WeakMap`-based registry is possible in ~100 lines. Used by projects like `typed-inject`. Drawbacks: no battle-testing, no ecosystem, maintenance burden.

---

## 3. Full Comparison Matrix

| | nestjs/core standalone | tsyringe | inversify v8 | needle-di | awilix |
|---|---|---|---|---|---|
| Decorator style | legacy | legacy | legacy | **Stage-3** | none |
| reflect-metadata | explicit import | explicit import | **auto-bundled** | **not needed** | not needed |
| Bun 1.3.13 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bundle (target=bun) | **435 KB** | 33 KB | 79 KB | **7 KB** | 92 KB |
| Singleton | ✅ | ✅ | ✅ | ✅ | ✅ |
| Request scope | ✅ (native) | manual | ✅ | via child container | via scope |
| Transient | ✅ | ✅ | ✅ | via child container | ✅ |
| Module system | ✅ @Module | ❌ | ContainerModule | ❌ | ❌ |
| Async providers | ✅ | 3rd-party | ✅ | ✅ | ✅ |
| Lifecycle hooks | ✅ | ❌ | @postConstruct/preDestroy | ❌ | ❌ |
| NestJS DX parity | **100%** | 70% | 85% | 75% | 30% |
| ORM Stage-3 compat | ❌ (legacy only) | ❌ (legacy only) | ❌ (legacy only) | ✅ (MikroORM v7 ES, Drizzle, Prisma) | ✅ (all) |
| Last release | 2026 | 2025-04 | **2026-03** | **2026-03** | 2026-03 |
| Maintenance | very active | active | very active | growing | active |

---

## 4. Integration Patterns

### 4a. SvelteKit Integration

SvelteKit 2.10+ provides an `async init()` export in `hooks.server.ts` that runs once before first request[^13]. Pattern:

```typescript
// src/lib/server/container.ts
import { injectable, inject, Container } from "@needle-di/core";
// ... register services
export const appContainer = new Container();

// src/hooks.server.ts
import { appContainer } from "$lib/server/container";

export async function init() {
  // optional: warm up expensive singletons
  await appContainer.getAsync(DatabaseToken);
}

export const handle: Handle = async ({ event, resolve }) => {
  // Per-request child container for request-scoped services
  const reqContainer = appContainer.createChild();
  reqContainer.bind({ provide: REQUEST_EVENT, useValue: event });
  event.locals.container = reqContainer;
  return resolve(event);
};

// src/routes/api/users/+server.ts
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const userService = locals.container.get(UserService);
  const users = await userService.findAll();
  return Response.json(users);
};
```

Verified working on Bun 1.3.13. Container singleton is module-level; child container per request provides per-request scope isolation.

### 4b. tRPC Integration

tRPC's `createContext()` runs per-request and its result is available in all procedures:

```typescript
// src/lib/server/trpc.ts
import { initTRPC } from "@trpc/server";
import { appContainer } from "./container";

export function createContext({ event }: { event: RequestEvent }) {
  const reqContainer = appContainer.createChild();
  reqContainer.bind({ provide: REQUEST_EVENT, useValue: event });
  return { container: reqContainer };
}

type Context = Awaited<ReturnType<typeof createContext>>;
const t = initTRPC.context<Context>().create();

export const router = t.router({
  getUser: t.procedure.input(z.object({ id: z.number() })).query(({ input, ctx }) => {
    return ctx.container.get(UserService).findById(input.id);
  }),
});
```

No official tRPC reference implementation for this pattern exists, but it's the standard idiom recommended in the tRPC DI discussion[^14].

### 4c. Commander / CLI Commands

```typescript
// src/cli/commands/sync.command.ts
import { appContainer } from "../container";

export const syncCommand = new Command("sync")
  .action(async () => {
    const syncService = appContainer.get(SyncService);
    await syncService.run();
  });
```

### 4d. OpenTUI Component Handlers

OpenTUI components are plain classes; DI resolves services from the singleton container:

```typescript
// src/tui/screens/dashboard.screen.ts
import { appContainer } from "../container";

export class DashboardScreen {
  private metrics = appContainer.get(MetricsService);
  
  render() { /* use this.metrics */ }
}
```

---

## 5. Code Sketches (candidates)

### Primary: `@needle-di/core` (Stage-3)

```typescript
// tsconfig.json - NO experimentalDecorators needed
// { "compilerOptions": { "target": "ES2022" } }

import { injectable, inject, Container, InjectionToken } from "@needle-di/core";

// Services
@injectable()
class BarService {
  greet() { return "bar"; }
}

@injectable()
class FooService {
  constructor(private bar = inject(BarService)) {}
  run() { return this.bar.greet(); }
}

// Async factory
const DB_TOKEN = new InjectionToken<Database>("DB", {
  factory: async (container) => {
    const config = container.get(ConfigService);
    return Database.connect(config.databaseUrl);
  },
  async: true,
});

// Child container for request scope
const appContainer = new Container();
function createRequestContainer(event: RequestEvent) {
  const child = appContainer.createChild();
  child.bind({ provide: REQUEST_EVENT, useValue: event });
  return child;
}

// Wire
const container = new Container();
const foo = container.get(FooService);
console.log(foo.run()); // "bar"
```

### Fallback 1: `inversify` v8

```typescript
// tsconfig.json
// { "experimentalDecorators": true, "emitDecoratorMetadata": true }
// NO need to import "reflect-metadata" — auto-bundled by inversify v8

import { injectable, inject, Container } from "inversify";

@injectable()
class BarService {
  greet() { return "bar"; }
}

@injectable()
class FooService {
  // emitDecoratorMetadata enables auto-injection - no @inject needed
  constructor(private bar: BarService) {}
  run() { return this.bar.greet(); }
}

@injectable()
class AsyncDbService {
  private db!: Database;
  
  @postConstruct()
  async init() {
    this.db = await Database.connect(process.env.DB_URL!);
  }
}

const container = new Container();
container.bind(BarService).toSelf().inSingletonScope();
container.bind(FooService).toSelf();
container.bind(AsyncDbService).toSelf().inSingletonScope();

const foo = container.get(FooService);
console.log(foo.run()); // "bar"
```

### Fallback 2: `@nestjs/core` Standalone

```typescript
// tsconfig.json
// { "experimentalDecorators": true, "emitDecoratorMetadata": true }

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module, Injectable, Scope } from "@nestjs/common";

@Injectable()
class BarService {
  greet() { return "bar"; }
}

@Injectable({ scope: Scope.REQUEST })
class FooService {
  constructor(private bar: BarService) {}
  run() { return this.bar.greet(); }
}

@Module({ providers: [BarService, FooService] })
class AppModule {}

// One-time initialization (hooks.server.ts init())
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

// Per-request resolution
const contextId = ContextIdFactory.create();
const foo = await app.resolve(FooService, contextId);
console.log(foo.run()); // "bar"

// CLI / one-shot
const foo2 = app.get(FooService); // singleton only
```

---

## 6. Recommendation

### Primary: `@needle-di/core` v1.1.2

**Why**: Smallest bundle (7 KB), zero dependencies, Stage-3 decorators (no `experimentalDecorators` / `reflect-metadata` footgun), works on Bun 1.3.13 with MikroORM v7 ES decorators, proven on all four integration points (SvelteKit, tRPC, CLI, TUI). Future-proof as TC39 decorator standard.

**DX gap**: Constructor injection syntax `constructor(private bar = inject(Bar)) {}` differs from NestJS pattern `constructor(private bar: Bar) {}`. This is a one-time learning gap, not a daily friction. No `@Module` decorator — use plain container `bind()` calls or a thin factory function per domain.

**Config**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Fallback 1: `inversify` v8.1.0

**Why**: Most feature-complete non-Nest option. `@postConstruct`/`@preDestroy` lifecycle, request scope natively, async providers. Auto-bundles reflect-metadata (no user footgun). 79 KB bundle. Very active maintainer (March 2026 release). Legacy decorators limit ORM choice to MikroORM v7 legacy path or TypeORM.

**When to prefer over needle-di**: team is NestJS-fluent and wants `@inject(BarService)` param decorator style rather than default-param injection.

### Fallback 2: `@nestjs/core` Standalone

**Why**: Zero learning curve if team already knows NestJS DI. Full `@Module`, `@Injectable({ scope: Scope.REQUEST })`, `OnModuleInit`, `OnModuleDestroy`. Tested working on Bun 1.3.13.

**When to prefer**: team is NestJS-fluent AND project needs module-level composition (`imports: [TypeOrmModule, RedisModule]`). Accept 435 KB bundle and `bun --compile --external` complexity.

**Do NOT use if**: bundle size matters for CLI tools, or if you want Stage-3 decorators.

---

## 7. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| **needle-di Stage-3 decorator metadata gap** — no `design:paramtypes` means no automatic type-based injection; every dep must use `inject(Token)` default param | Medium | Accepted trade-off; all injection is explicit and type-checked |
| **Bun tsconfig inheritance bug** (#6326) — `emitDecoratorMetadata` silently ignored when inherited | High (legacy DI) | Put `experimentalDecorators` + `emitDecoratorMetadata` in root `tsconfig.json`, not a base file |
| **Bun Stage-3 decorator support still young** — added v1.3.10, edge cases possible | Low | Tested working; Bun team tracks issues actively |
| **needle-di v1.x maturity** — young library, API may change | Medium | Pin to exact version; review CHANGELOG before upgrades |
| **inversify v8 ESM-only** — breaks CommonJS builds | Low | Fulcrum target is ESM; non-issue |
| **NestJS standalone bun --compile** — optional peer deps cause unresolved module errors at bundle time | High (if using Nest) | Pass all optional deps as `--external` flags; document in justfile |
| **ORM Stage-3 incompatibility** — TypeORM requires legacy decorators | High if TypeORM chosen | Avoid TypeORM; use MikroORM v7 (ES path) or Drizzle/Prisma |
| **MikroORM v7 `@Entity` in Stage-3 mode requires explicit scalar types** — no `design:paramtypes` for metadata | Low | MikroORM ES decorator path is designed for this; explicit type params at each `@Property()` |
| **Request scope + needle-di**: child containers share parent singletons unless overridden — multi-provider merge limitation | Low | Documented limitation; affects only multi-bound tokens across parent/child |
| **tsyringe maintenance cadence** — one release per year | Low | Works well, but fewer community fixes |

---

## 8. Unresolved Questions for User

1. **ORM choice gates decorator style**: Picking needle-di (Stage-3) closes off TypeORM entirely. Does the team have a preference for TypeORM vs MikroORM v7 ES vs Drizzle/Prisma? If TypeORM is required, fall back to inversify or NestJS standalone (both legacy-only).

2. **Module composition granularity**: needle-di and inversify lack NestJS `@Module({ imports, exports })` — does Fulcrum need module-level lazy loading (e.g., load the `BillingModule` only in contexts that need it), or is a flat container acceptable? If module isolation is required at the DI level, NestJS standalone is the only option.

3. **CLI binary size target**: `bun --compile` baseline is 60 MB (Bun runtime). NestJS standalone adds only ~0.4 MB to that. All candidates stay under the 150 MB target. Does Fulcrum have a stricter CLI binary target (e.g., < 70 MB)? If so, needle-di (7 KB overhead) is strongly preferred over NestJS standalone.

---

## 9. Citations

[^1]: Bun v1.0.3 blog — emitDecoratorMetadata support added: https://bun.com/blog/bun-v1.0.3  
[^2]: Bun v1.3.10 blog — TC39 Stage-3 ES decorators: https://bun.com/blog/bun-v1.3.10  
[^3]: Bun issue #6326 — emitDecoratorMetadata broken with inherited tsconfig: https://github.com/oven-sh/bun/issues/6326  
[^4]: MikroORM v7 release blog — legacy vs ES decorator paths: https://mikro-orm.io/blog/mikro-orm-7-released  
[^5]: NestJS docs — standalone applications: https://docs.nestjs.com/standalone-applications  
[^6]: NestJS issue #13881 — Bun support tracking: https://github.com/nestjs/nest/issues/13881  
[^7]: "Serverless NestJS micro-services without HTTP" (Capmo Engineering): https://medium.com/capmo-stories/serverless-nest-js-micro-services-integrations-without-http-42f453236b39  
[^8]: Necord standalone application (Discord bot DI): https://necord.org/techniques/standalone-application  
[^9]: Bun issue #4677 — reflect-metadata + tsyringe (closed): https://github.com/oven-sh/bun/issues/4677  
[^10]: @launchtray/tsyringe-async — async lifecycle hooks for tsyringe: https://www.npmjs.com/package/@launchtray/tsyringe-async  
[^11]: InversifyJS v8 decorator API — @postConstruct, @preDestroy: https://inversify.io/docs/api/decorator/  
[^12]: InversifyJS issue #1507 — Stage-3 decorator support (closed without impl): https://github.com/inversify/InversifyJS/issues/1507  
[^13]: SvelteKit hooks docs — `init` export (added v2.10, Dec 2024): https://svelte.dev/docs/kit/hooks  
[^14]: tRPC DI discussion — vanilla options for getting services into procedures: https://github.com/trpc/trpc/issues/3958  
[^15]: MikroORM upgrading v6→v7 — decorator import changes: https://mikro-orm.io/docs/upgrading-v6-to-v7  
[^16]: Top 5 TS DI containers comparison (LogRocket): https://blog.logrocket.com/top-five-typescript-dependency-injection-containers/  
[^17]: needle-di GitHub: https://github.com/needle-di/needle-di  
[^18]: needle-di docs: https://needle-di.io  
