# NestJS + tRPC v11 Native Integration Patterns

> Research date: 2026-05-16
> Scope: Mount tRPC v11 inside NestJS WITHOUT third-party bridge packages. Framework-native patterns using NestJS DI + tRPC express adapter directly.

---

## 1. Adapter Decision: Express over Fetch for NestJS

| Adapter | Import | When to use |
|---|---|---|
| `createExpressMiddleware` | `@trpc/server/adapters/express` | **NestJS/Express** — preferred path |
| `fastifyPlugin` | `@trpc/server/adapters/fastify` | NestJS/Fastify |
| `fetchRequestHandler` | `@trpc/server/adapters/fetch` | Edge/serverless only — does NOT fit NestJS |
| Standalone | `@trpc/server/adapters/standalone` | Greenfield with no existing HTTP server |

**`fetchRequestHandler` does NOT fit NestJS** — designed for Cloudflare Workers / Next.js App Router edge runtimes.

---

## 2. Pattern A: Injectable TrpcRouter + app.use() in bootstrap

Dominant community pattern. Entirely framework-native.

### Structure

```
src/
  trpc/
    trpc.service.ts    # @Injectable — creates initTRPC instance
    trpc.router.ts     # @Injectable — injects NestJS services, builds appRouter
    trpc.module.ts     # @Module — exports TrpcService + TrpcRouter
```

### trpc.service.ts

```typescript
@Injectable()
export class TrpcService {
  trpc = initTRPC.context<Context>().create();
  procedure = this.trpc.procedure;
  router = this.trpc.router;
  mergeRouters = this.trpc.mergeRouters;
}
```

### trpc.router.ts

```typescript
@Injectable()
export class TrpcRouter {
  constructor(
    private readonly trpc: TrpcService,
    private readonly userService: UserService,
  ) {}

  appRouter = this.trpc.router({
    getUser: this.trpc.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => this.userService.findById(input.id)),
  });

  async applyMiddleware(app: INestApplication) {
    app.use('/trpc', trpcExpress.createExpressMiddleware({
      router: this.appRouter,
      createContext,
    }));
  }
}
```

### main.ts

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trpc = app.get(TrpcRouter);
  await trpc.applyMiddleware(app);
  await app.listen(3000);
}
```

---

## 3. Pattern B: OnModuleInit Lifecycle Hook

For deferred router construction when async providers must resolve first:

```typescript
@Injectable()
export class TrpcRouter implements OnModuleInit {
  private _appRouter: AppRouter;
  constructor(private trpc: TrpcService, private userService: UserService) {}
  onModuleInit() {
    this._appRouter = this.trpc.router({ ... });
  }
  get appRouter() { return this._appRouter; }
}
```

---

## 4. createCallerFactory — In-Process Calls

tRPC v11 `createCallerFactory` for CLI/TUI/tests — bypasses HTTP entirely:

```typescript
const createCaller = createCallerFactory(appRouter);
const caller = createCaller(contextObj);
await caller.someProc(input);
```

**Caveats:**
- Do NOT call procedures from within other procedures (re-runs all middleware)
- Context must be constructed manually for in-process calls

---

## 5. DI Access from tRPC Context

Services captured in closure at construction time (singleton-safe):

```typescript
createContext = ({ req, res }) => ({
  req, res,
  auth: this.authService,    // singleton NestJS service
  db: this.databaseService,
});
```

**Request-scoped:** Use `moduleRef.resolve(Token, ContextIdFactory.getByRequest(req))`.

---

## 6. Known Failure Modes

| Issue | Root Cause | Fix |
|---|---|---|
| 404 on tRPC routes | `app.use()` called AFTER `app.listen()` | Mount before `listen()` |
| `req.body` undefined | NestJS body parser conflicts | Disable for `/trpc` prefix |
| Request-scoped not resolving | `moduleRef.get()` is singleton-only | Use `moduleRef.resolve()` |
| `createCallerFactory` loops | Full middleware re-execution | Only use for tests/seeding |

---

## 7. What Bridge Packages Actually Do (replicate natively)

- **Auto-mount:** `TRPCModule.forRoot()` calls `applyMiddleware(app)` via `OnModuleInit` — saves 3 lines in main.ts
- **Decorators:** `@Router`, `@Query`, `@Mutation` produce same `t.router({})` at runtime
- **Request-scoped DI:** `ModuleRef.resolve()` with per-request context IDs

None of these require a package. All achievable with standard NestJS APIs.

---

## Sources

- [tRPC Discussion #1504: Using with Nest.JS](https://github.com/trpc/trpc/discussions/1504)
- [tRPC Express Adapter docs](https://trpc.io/docs/server/adapters/express)
- [tRPC Server-Side Calls docs](https://trpc.io/docs/server/server-side-calls)
- [tomray.dev: NestJS + NextJS + tRPC](https://www.tomray.dev/nestjs-nextjs-trpc)
- [innei blog: NestJS + tRPC + DI](http://blog.innei.ren/nestjs-with-trpc-and-dependency-injection)
- [mechaadi.com: NestJS tRPC integration](https://mechaadi.com/blog/using-trpc-with-nestjs)
- [NestJS lifecycle events docs](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [NestJS issue #15527: Native tRPC support request](https://github.com/nestjs/nest/issues/15527)
