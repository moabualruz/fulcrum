# NestJS + tRPC Dual-Exposure — OSS Projects Research

> Research date: 2026-05-16
> Scope: Real GitHub repos implementing both NestJS HTTP controllers AND tRPC routers over shared services.

---

## Integration Patterns Found

### Pattern A — Raw Express Middleware (no library)

`TrpcService` (`@Injectable`) wraps `initTRPC.context<Context>().create()`.
`TrpcRouter` (`@Injectable`) injects domain services, builds `appRouter`, exposes `applyMiddleware(app)`.
In `bootstrap()`: `app.get(TrpcRouter).applyMiddleware(app)` before `listen()`.
`@Controller` classes coexist unchanged. Same service injected into both.

**Critical:** NestJS guards/pipes/interceptors do NOT fire for `/trpc` path. Auth re-implemented as tRPC middleware.

### Pattern B — Decorator Library (nestjs-trpc ecosystem)

`@Router() @Injectable()` classes with `@Query()` / `@Mutation()` methods.
`TRPCModule.forRoot({ routers: [UserRouter], context: AppContext })`.
`ProcedureFactory` uses `ModuleRef` for full DI resolution.
Controllers in `controllers[]`, routers in `providers[]`.

Libraries: `nestjs-trpc` (KevinEdry, ~300 stars, 5K weekly DL), `@mguay/nestjs-trpc` (v11 compat), `@nexica/nestjs-trpc`.

### Pattern C — trpc-openapi Triple Surface

Single `appRouter` → 3 surfaces:
1. tRPC at `/trpc` via `createExpressMiddleware`
2. REST at `/rest` via `createOpenApiExpressMiddleware`
3. NestJS `@Controller` on standard paths

`.meta({ openapi: { method: 'GET', path: '/users' } })` annotation per procedure.

### Pattern D — createCallerFactory In-Process

`createCallerFactory(appRouter)` for CLI/cron/tests. No HTTP round-trip.
Retrieve `appRouter` from NestJS DI container.

---

## OSS Repos

| Repo | Stack | Pattern |
|---|---|---|
| `tomwray13/nestjs-nextjs-trpc` | NestJS + Next.js 13 + tRPC + pnpm | A (canonical) |
| `shahbaz42/next-nestjs-trpc-monorepo` | NestJS + Next.js + Turborepo | A |
| `nawodyaishan/nestjs-nextjs-trpc-monorepo` | NestJS + Next.js + tRPC | A |
| `betomossmann/example-nest-next-trpc` | NestJS + Next.js + tRPC | A |
| `ax-at/expo-nextjs-nestjs-trpc-turborepo` | Expo + Next.js + NestJS | A |
| `nrocchi/monorepo-next-nest-trpc-starter` | NestJS + Next.js + React Query | A |
| `Mnigos/nestjs-trpc-template` | NestJS + Next.js + shadcn + Turborepo | B (most complete) |
| `dmytro-komlyk/fullstack-boilerplate-next-nest-vps` | NestJS + Next.js + Docker | A |

---

## Gaps in Prior Art

- No SvelteKit + NestJS + tRPC repo found (all use Next.js)
- No `createCallerFactory` as named NestJS provider example
- No production postmortems on dual-exposure failure modes
- `nestjs-trpc` (KevinEdry) has open tRPC v11 compat issue (#48)

---

## Sources

- [trpc/trpc Discussion #1504](https://github.com/trpc/trpc/discussions/1504)
- [KevinEdry/nestjs-trpc](https://github.com/KevinEdry/nestjs-trpc)
- [mguay22/nestjs-trpc-v2](https://github.com/mguay22/nestjs-trpc-v2)
- [tomwray13/nestjs-nextjs-trpc](https://github.com/tomwray13/nestjs-nextjs-trpc)
- [mechaadi.com](https://mechaadi.com/blog/using-trpc-with-nestjs)
- [tomray.dev](https://www.tomray.dev/nestjs-nextjs-trpc)
- [tRPC server-side calls](https://trpc.io/docs/server/server-side-calls)
