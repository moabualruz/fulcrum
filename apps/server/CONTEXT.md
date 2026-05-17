# Server Composition

The single NestJS backend runtime for Fulcrum. This context covers how the process boots, how service modules are composed into one `AppModule`, and how the same application services are dual-exposed over HTTP (controllers + Swagger) and tRPC (router + caller). It owns wiring only — no per-service business logic, no entities, no repositories.

## Language

**NestApplication**:
The Nest `INestApplication` instance returned by `NestFactory.create(AppModule)`; the live composed runtime that listens on a port.
_Avoid_: Express app, Hono server, Nest server

**AppModule**:
The root Nest module that imports every service's feature module plus `TrpcModule` and `ApplicationDatabaseModule`; the only place modules are composed.
_Avoid_: RootModule, MainModule, ServerModule

**BootstrapPhase**:
The ordered startup sequence inside `createFulcrumNestApplication` and `startFulcrumNestServer`: create app, install global pipes, build OpenAPI document, mount tRPC middleware, seed dev runtime, listen.
_Avoid_: Init, startup, main

**ServiceModule**:
A feature module exported by a bounded service (e.g. `TaskPublicApiModule`, `AuthPublicApiModule`) and imported by `AppModule`; the unit of composition.
_Avoid_: Feature module, plugin, app, package

**HttpController**:
A `@Controller` class inside a service's `interface/http/` folder; handles HTTP concerns (status, response mapping, Swagger decorators) and delegates immediately to an application service.
_Avoid_: Endpoint, handler, route, REST controller

**TrpcRouter**:
The `@Injectable()` provider in `trpc/trpc.router.ts` that builds `appRouter` by composing per-feature sub-routers and mounts it on Express at `/trpc` via `applyMiddleware(app)`.
_Avoid_: TrpcServer, RouterRoot, ApiRouter

**TrpcService**:
The `@Injectable()` provider that wraps `initTRPC.context<TrpcContext>().meta<TrpcProcedureMeta>().create(...)` and exposes `router`, `publicProcedure`, `mergeRouters`, and `createCallerFactory`.
_Avoid_: TrpcFactory, TrpcInstance, t

**AppRouter**:
The type produced by `TrpcRouter#buildRouter`; consumed by clients (web, CLI, TUI) for end-to-end type safety.
_Avoid_: RouterType, ApiType, ApiSchema

**AppCaller**:
The in-process caller built via `t.createCallerFactory(appRouter)` in `trpc/local-caller.ts`; used by CLI/TUI to invoke procedures without HTTP round-trips.
_Avoid_: LocalClient, InProcessClient, DirectCaller

**TrpcContext**:
The per-request object carrying `session`, `userId`, `orgId`, `em` (TypeORM `EntityManager`), `container` (DI container), `requestId`, and `responseHeaders`; created by `createContext`.
_Avoid_: Ctx, RequestContext, TrpcCtx

**GlobalPipe**:
The `ValidationPipe` registered via `app.useGlobalPipes(...)` in `createFulcrumNestApplication`; applies project-wide to HTTP requests. (Future: replaced by `ZodValidationPipe`.)
_Avoid_: GlobalValidator, RequestPipe

**ZodValidationPipe**:
The project-mandated validation pipe (Zod, not class-validator) that controllers will use for DTO validation. Not yet wired globally; tracked as cleanup.
_Avoid_: ClassValidatorPipe, ValidationPipe (when distinguishing)

**OpenApiDocument**:
The Swagger document built via `DocumentBuilder` + `SwaggerModule.createDocument(app, config)`, served at `/openapi`; the HTTP surface's machine-readable contract.
_Avoid_: SwaggerJson, ApiSpec, OpenApiSpec

**SeedService**:
The local-development seeder invoked by `startFulcrumNestServer` when `FULCRUM_REQUIRE_AUTH` is unset; never runs in production paths.
_Avoid_: Bootstrap data, fixture loader

**ApplicationDatabaseModule**:
The platform-core module imported by `AppModule` that provides the root TypeORM `DataSource`; every service module's `TypeOrmModule.forFeature(...)` resolves against it.
_Avoid_: DbModule, OrmModule, TypeOrmRootModule

## Relationships

- **AppModule** imports every **ServiceModule** plus **TrpcModule** and **ApplicationDatabaseModule** — it is the only composition root
- **NestApplication** is produced by `NestFactory.create(AppModule)` and proceeds through the **BootstrapPhase** sequence
- **GlobalPipe** is registered on **NestApplication** before any controller handles a request
- **TrpcRouter** is resolved from **NestApplication** via `app.get(TrpcRouter)` and mounts **AppRouter** on the Express adapter at `/trpc` during bootstrap
- **TrpcRouter** depends on **TrpcService**, which exposes the `router` and `publicProcedure` builders used to assemble **AppRouter**
- **AppRouter** and **HttpController**s both call the same application services injected from **ServiceModule**s — two interfaces, one application layer
- **AppCaller** wraps **AppRouter** via `createCallerFactory` and is used by CLI/TUI in-process; the web app uses the HTTP **AppRouter** mount
- **OpenApiDocument** is generated from **HttpController** decorators on **NestApplication** and served at `/openapi`
- **SeedService** runs once during **BootstrapPhase** against the **ApplicationDatabaseModule** `DataSource` when auth is not required

## Example dialogue

> **Dev:** "I'm adding a new endpoint for archiving sprints. Do I put it in `tasks.ts` tRPC router or a new sprint controller?"
> **Architect:** "Both. The behavior lives in the sprint application service inside `services/work-management/`. The **HttpController** in `interface/http/sprint-public-api.controller.ts` and the sprint procedures in the **TrpcRouter** each inject that service and stay thin — one for HTTP, one for tRPC."
> **Dev:** "And the validation?"
> **Architect:** "Zod schema in the application service input contract. The tRPC procedure validates via `.input(schema)`; the HTTP controller will validate via **ZodValidationPipe** — never class-validator."

## Flagged ambiguities

- "Router" was used for both **AppRouter** (the tRPC tree) and Express routing (controller routes). Resolved: **AppRouter** = tRPC composition; Nest's HTTP routing is owned by **HttpController** decorators, never referenced as "the router".
- "Controller" vs tRPC "procedure": **HttpController** is the HTTP interface; a tRPC procedure inside **AppRouter** is the tRPC interface. Both delegate to the same application service; neither owns business logic.
- "Service" is overloaded: **TrpcService** (Nest provider wrapping `initTRPC`) is distinct from an application service (business logic inside a bounded service) and from a domain service (pure-domain collaborator). Composition surface only knows **TrpcService**; application/domain services live in `services/**`.
- "Module" means a Nest `@Module`-decorated class here (**AppModule**, **ServiceModule**, **TrpcModule**). It does not mean a TypeScript ES module or a npm workspace package.
- "Caller" can mean either the **AppCaller** (in-process tRPC) or any client of the HTTP API. Resolved: **AppCaller** is reserved for the `createCallerFactory` result used by CLI/TUI; HTTP clients are just "HTTP clients".
- `ValidationPipe` from `@nestjs/common` is currently the **GlobalPipe**, but project rules require Zod. The **ZodValidationPipe** replacement is pending migration debt, not a design choice.
