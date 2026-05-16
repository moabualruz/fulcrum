# tRPC v11 Official Documentation Research

> Consolidated findings from official tRPC v11 docs (trpc.io), GitHub source (`trpc/trpc`), and community integrations.
> Sources: GitHub raw docs via `gh api`, WebSearch, v10-to-v11 migration guide.
> Date: 2026-05-16

---

## Table of Contents

1. [Server Adapters](#1-server-adapters)
2. [createCallerFactory — Server-Side Calls](#2-createcallerfactory--server-side-calls)
3. [Middleware](#3-middleware)
4. [Subscriptions](#4-subscriptions)
5. [Server-Side Call Patterns](#5-server-side-call-patterns)
6. [Custom Adapters (incl. NestJS Integration)](#6-custom-adapters)
7. [Context Creation](#7-context-creation)
8. [Error Handling](#8-error-handling)
9. [Metadata](#9-metadata)
10. [Key v11 Changes from v10](#10-key-v11-changes-from-v10)

---

## 1. Server Adapters

tRPC is not a server — it must be hosted via an adapter. Adapters act as glue between the host system and the tRPC API. All adapters support `createContext` for per-request context and `onError` for global error handling.

### Available Adapters

| Adapter | Package Import | Host | Notes |
|---------|---------------|------|-------|
| **Standalone** | `@trpc/server/adapters/standalone` | Node.js HTTP/HTTP2 | Simplest; wraps `http.createServer()`. Supports `basePath`, `middleware` (connect-style), HTTP/2 via `createHTTP2Handler`. |
| **Express** | `@trpc/server/adapters/express` | Express.js | `createExpressMiddleware()` → Express middleware. Mount at any path. |
| **Fastify** | `@trpc/server/adapters/fastify` | Fastify v5+ | `fastifyTRPCPlugin` → Fastify plugin. **Requires Fastify v5+** (v4 silently returns empty responses). Supports WebSocket via `@fastify/websocket` with `useWSS: true`. |
| **Fetch** | `@trpc/server/adapters/fetch` | WinterCG-compliant runtimes | `fetchRequestHandler()` — uses native `Request`/`Response`. Works with: Cloudflare Workers, Deno, Vercel Edge, Astro, Remix, SolidStart, Next.js App Router. |
| **Next.js** | `@trpc/server/adapters/next` | Next.js Pages Router | `createNextApiHandler()` for `pages/api/`. For App Router, use the Fetch adapter instead. |
| **AWS Lambda** | `@trpc/server/adapters/aws-lambda` | API Gateway v1/v2, Lambda Function URL | `awsLambdaRequestHandler()`. Also supports response streaming via `awsLambdaStreamingRequestHandler()`. |
| **WebSocket** | `@trpc/server/adapters/ws` | `ws` WebSocketServer | `applyWSSHandler()`. Supports heartbeat/keepAlive config. |

### Adapter Architecture

All adapters ultimately call the internal `resolveResponse()` function from `@trpc/server/http`. This is the core request-resolution pipeline that:

1. Parses the request (path, method, headers, body)
2. Resolves the procedure type (query/mutation/subscription)
3. Validates HTTP method (GET for queries/subscriptions, POST for mutations)
4. Creates context via `createContext()`
5. Calls the procedure through the middleware chain
6. Formats the response (JSON, SSE stream, JSONL stream)
7. Applies `responseMeta` and `onError` hooks

Two primary adapter patterns exist:
- **Fetch-based**: Receives `Request`, returns `Response` directly via `resolveResponse()`
- **Node HTTP-based**: Receives `IncomingMessage`/`ServerResponse`, converts to `Request` internally via `incomingMessageToRequest()`, calls `resolveResponse()`, then writes back via `writeResponse()`

### Standalone Adapter Example

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

createHTTPServer({
  router: appRouter,
  createContext() { return {}; },
  // basePath: '/trpc/',  // optional
}).listen(2022);
```

### Express Adapter Example

```ts
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';

const app = express();
app.use('/trpc', trpcExpress.createExpressMiddleware({
  router: appRouter,
  createContext,
}));
```

### Fetch Adapter Example (Cloudflare Workers / Next.js App Router / Astro / etc.)

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
    });
  },
};
```

### Fastify Adapter Example

```ts
import { fastifyTRPCPlugin, FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';

const server = fastify({ routerOptions: { maxParamLength: 5000 } });

server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) { console.error(`Error on '${path}':`, error); },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});
```

---

## 2. createCallerFactory — Server-Side Calls

### Purpose

`createCallerFactory()` creates a server-side caller for any router, enabling direct procedure invocation from server code without HTTP. Primary use cases:
- Server-side rendering (SSR) data fetching
- Integration testing
- API endpoints that need to call tRPC procedures

### API

```ts
const t = initTRPC.context<Context>().create();
const { createCallerFactory, router } = t;

const appRouter = router({ /* ... */ });

// 1. Create a caller factory for the router
const createCaller = createCallerFactory(appRouter);

// 2. Create a caller with a specific context
const caller = createCaller({ foo: 'bar' });

// 3. Call procedures directly
const result = await caller.post.list();
const added = await caller.post.add({ title: 'Hello' });
```

### Alternative: `router.createCaller()`

```ts
const caller = router.createCaller({});
const result = await caller.greeting({ name: 'tRPC' });
```

### IMPORTANT: When NOT to Use

> **`createCaller` should NOT be used to call procedures from within other procedures.** This creates overhead by (potentially) creating context again, executing all middlewares, and validating the input — all of which were already done by the current procedure. Instead, extract shared logic into a separate function and call that from within procedures.

### Error Handling with createCaller

Both `createCallerFactory` and `createCaller` accept an `onError` option:

```ts
interface OnErrorShape {
  ctx: unknown;
  error: TRPCError;
  path: string | undefined;
  input: unknown;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
}

const caller = router.createCaller(
  { /* context */ },
  {
    onError: (opts) => {
      console.error('An error occurred:', opts.error);
    },
  },
);
```

Handlers passed to `createCallerFactory` are called **before** handlers passed to `createCaller`.

### Performance Characteristics

- **No HTTP overhead**: No network roundtrip, no serialization/deserialization of HTTP request/response
- **Full middleware execution**: All middlewares still run, context is still created
- **Input validation**: Zod/other validators still execute
- **Same error behavior**: `TRPCError` thrown same as HTTP path; use `getHTTPStatusCodeFromError()` to extract HTTP codes

### Integration Test Pattern

```ts
// router.ts
export const createCaller = t.createCallerFactory(appRouter);

// test.ts
import { createCaller } from './_app';

async function test() {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const input: inferProcedureInput<AppRouter['post']['add']> = {
    text: 'hello test',
    title: 'hello test',
  };

  const post = await caller.post.add(input);
  const byId = await caller.post.byId({ id: post.id });
}
```

---

## 3. Middleware

### Basic Pattern

Middleware wraps procedure invocation. Must call `opts.next()` and return its result.

```ts
const loggedProcedure = publicProcedure.use(async (opts) => {
  const start = Date.now();
  const result = await opts.next();
  const durationMs = Date.now() - start;

  const meta = { path: opts.path, type: opts.type, durationMs };
  result.ok
    ? console.log('OK request timing:', meta)
    : console.error('Non-OK request timing', meta);

  return result;
});
```

### Context Extension

Middleware can add/override context keys in a typesafe manner by passing `ctx` to `opts.next()`:

```ts
const protectedProcedure = publicProcedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: {
      user: opts.ctx.user,  // narrowed to non-nullable
    },
  });
});
```

### `.concat()` — Reusable Middleware Plugins

`.concat()` allows independently defining a partial procedure that can be used with any tRPC instance matching context/metadata requirements. **This is the recommended approach for creating reusable middleware plugins.**

```ts
// myPlugin.ts — a library creating a reusable plugin
export function createMyPlugin() {
  const t = initTRPC.context<{}>().meta<{}>().create();

  return {
    pluginProc: t.procedure.use((opts) => {
      return opts.next({
        ctx: { fromPlugin: 'hello from myPlugin' as const },
      });
    }),
  };
}

// app.ts — consuming the plugin
const plugin = createMyPlugin();
const procedureWithPlugin = publicProcedure.concat(plugin.pluginProc);
```

### `.pipe()` (unstable_pipe) — Extending Middlewares

Allows chaining middlewares in a typesafe manner. Context must overlap between piped middlewares.

```ts
const fooMiddleware = t.middleware((opts) => {
  return opts.next({ ctx: { foo: 'foo' as const } });
});

const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
  opts.ctx.foo; // 'foo' — available from fooMiddleware
  return opts.next({ ctx: { bar: 'bar' as const } });
});

const barProcedure = publicProcedure.use(barMiddleware);
// barProcedure has ctx.foo and ctx.bar
```

**Order matters**: If middleware A overrides `ctx.a` to a different type, middleware B that expects the original `ctx.a` cannot be piped after A.

### `experimental_standaloneMiddleware` (DEPRECATED)

**Deprecated in favor of `.concat()`.** Allows creating middleware with explicit Context, Input, and Meta type requirements independent of any tRPC instance:

```ts
const projectAccessMiddleware = experimental_standaloneMiddleware<{
  ctx: { allowedProjects: string[] };
  input: { projectId: string };
}>().create((opts) => {
  if (!opts.ctx.allowedProjects.includes(opts.input.projectId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed' });
  }
  return opts.next();
});
```

---

## 4. Subscriptions

### Model: Async Generators (v11)

tRPC v11 uses **async generator functions** (`async function*`) for subscriptions. The old `observable()` pattern from v10 is still supported but generators are the recommended approach.

### Transport Options

| Transport | Recommendation | Setup Complexity |
|-----------|---------------|-----------------|
| **Server-Sent Events (SSE)** | **Recommended first choice** | Low — no separate server needed |
| **WebSockets** | For bidirectional communication | Higher — requires WebSocket server |

### Basic SSE Subscription

```ts
import EventEmitter, { on } from 'node:events';
import { initTRPC } from '@trpc/server';

const ee = new EventEmitter();

const appRouter = t.router({
  onPostAdd: t.procedure.subscription(async function* (opts) {
    for await (const [data] of on(ee, 'add', {
      signal: opts.signal,  // auto-cancels when client disconnects
    })) {
      const post = data as Post;
      yield post;
    }
  }),
});
```

### `tracked()` — Automatic Reconnection (Recommended)

The `tracked()` helper sends an `id` with each event, enabling automatic client reconnection and resumption:

```ts
import { tracked } from '@trpc/server';

const subRouter = router({
  onPostAdd: publicProcedure
    .input(z.object({
      lastEventId: z.string().nullish(),
    }).optional())
    .subscription(async function* (opts) {
      const iterable = ee.toIterable('add', { signal: opts.signal });

      // Replay missed events on reconnect
      if (opts.input?.lastEventId) {
        // fetch and yield events since lastEventId
      }

      for await (const [data] of iterable) {
        yield tracked(post.id, post);
      }
    }),
});
```

- For SSE: part of the EventSource spec (`lastEventId` header)
- For WebSockets: `wsLink` automatically sends/updates last known ID

### Polling Pattern

```ts
.subscription(async function* (opts) {
  let lastEventId = opts.input?.lastEventId ?? null;

  while (!opts.signal!.aborted) {
    const posts = await db.post.findMany({
      where: lastEventId ? { createdAt: { gt: lastEventId } } : undefined,
      orderBy: { createdAt: 'asc' },
    });

    for (const post of posts) {
      yield tracked(post.createdAt.toJSON(), post);
      lastEventId = post.createdAt;
    }

    await sleep(1_000);
  }
})
```

### Stopping from Server

Simply `return` in the generator function to stop the subscription and trigger client `onComplete`.

### Cleanup

Use `try...finally` — tRPC invokes `.return()` on the generator when the subscription stops:

```ts
.subscription(async function* (opts) {
  let timeout;
  try {
    for await (const [data] of on(ee, 'add', { signal: opts.signal })) {
      timeout = setTimeout(() => { /* ... */ });
      yield data;
    }
  } finally {
    if (timeout) clearTimeout(timeout);
  }
})
```

### Error Handling in Subscriptions

- Errors thrown in generators propagate to `onError()` on the backend
- **5xx errors**: client automatically reconnects using last tracked event ID
- **Other errors**: subscription is cancelled and propagated to client `onError()`

### Output Validation

Since subscriptions are async iterators, output validation requires going through the iterator. tRPC provides a `zAsyncIterable` helper pattern for Zod validation of yielded values (see official docs for full implementation).

### SSE Configuration (v11)

```ts
const t = initTRPC.create({
  sse: {
    ping: {
      enabled: true,
      intervalMs: 15_000,
    },
    client: {
      reconnectAfterInactivityMs: 20_000,
    },
  },
});
```

---

## 5. Server-Side Call Patterns

### Pattern 1: createCallerFactory (Recommended)

Best for: SSR, integration tests, custom API endpoints.

```ts
// Export from router definition
export const createCaller = t.createCallerFactory(appRouter);

// Use in SSR / API handler
const caller = createCaller(await createContext());
const data = await caller.post.list();
```

### Pattern 2: Extract Shared Logic (for inter-procedure calls)

**Do NOT use createCaller for procedure-to-procedure calls.** Extract shared business logic instead:

```ts
// shared.ts
export async function getPostById(id: string) {
  return db.post.findUnique({ where: { id } });
}

// router.ts
const postRouter = router({
  byId: publicProcedure.input(z.string()).query((opts) =>
    getPostById(opts.input)
  ),
  withComments: publicProcedure.input(z.string()).query(async (opts) => {
    const post = await getPostById(opts.input);  // shared logic, no caller overhead
    const comments = await getComments(opts.input);
    return { ...post, comments };
  }),
});
```

### Pattern 3: Next.js Server-Side Helpers

```ts
import { createServerSideHelpers } from '@trpc/react-query/server';

const helpers = createServerSideHelpers({
  router: appRouter,
  ctx: await createContext(),
});
```

---

## 6. Custom Adapters

### Internal Architecture for Adapter Authors

The official comment in the source code states:

> If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`

#### Key Imports

```ts
import type { AnyTRPCRouter } from '@trpc/server';
import type { HTTPBaseHandlerOptions } from '@trpc/server/http';
import { resolveResponse } from '@trpc/server/http';  // THE core function
```

#### `resolveResponse()` — The Core

Every adapter ultimately calls `resolveResponse()`. It accepts:

```ts
interface ResolveHTTPRequestOptions<TRouter extends AnyRouter> {
  // From HTTPBaseHandlerOptions:
  router: TRouter;
  allowMethodOverride?: boolean;
  responseMeta?: (opts) => { headers?: Headers; status?: number };

  // Adapter-specific:
  createContext: (opts: { info: TRPCRequestInfo }) => Promise<Context>;
  req: Request;              // Web standard Request
  path: string;              // Procedure path (after stripping endpoint prefix)
  error: TRPCError | null;   // Pre-handler error (e.g., from connect middleware)
  onError?: (opts) => void;
}
```

Returns: `Promise<Response>` (Web standard Response)

#### Fetch Adapter Pattern (simplest custom adapter template)

```ts
export async function fetchRequestHandler<TRouter extends AnyRouter>(
  opts: FetchHandlerRequestOptions<TRouter>,
): Promise<Response> {
  const resHeaders = new Headers();

  const createContext = async (innerOpts) => {
    return opts.createContext?.({ req: opts.req, resHeaders, ...innerOpts });
  };

  const url = new URL(opts.req.url);
  const path = trimSlashes(url.pathname.slice(trimSlashes(opts.endpoint).length));

  return await resolveResponse({
    ...opts,
    req: opts.req,
    createContext,
    path,
    error: null,
    onError(o) { opts?.onError?.({ ...o, req: opts.req }); },
    responseMeta(data) {
      const meta = opts.responseMeta?.(data);
      // merge headers...
      return { headers: resHeaders, status: meta?.status };
    },
  });
}
```

#### Node HTTP Adapter Pattern (for Express/Fastify/Standalone)

```ts
export async function nodeHTTPRequestHandler(opts) {
  const request = incomingMessageToRequest(opts.req, opts.res, {
    maxBodySize: opts.maxBodySize ?? null,
  });

  const createContext = async (innerOpts) => {
    return await opts.createContext?.({ ...opts, ...innerOpts });
  };

  const response = await resolveResponse({
    ...opts,
    req: request,
    error: err ? getTRPCErrorFromUnknown(err) : null,
    createContext,
    onError(o) { opts?.onError?.({ ...o, req: opts.req }); },
  });

  await writeResponse({ request, response, rawResponse: opts.res });
}
```

### NestJS Integration Options

Three approaches exist for NestJS + tRPC:

#### Option A: `nestjs-trpc` (Official Community Package)

- Package: `nestjs-trpc` / `nestjs-trpc-v2`
- Supports tRPC v11
- Uses NestJS-native decorators: `@Router`, `@Query`, `@Mutation`
- Build-time: `TRPCGenerator` analyzes decorated classes via `ts-morph`, generates schema files
- Runtime: `TRPCDriver` discovers routers/procedures via `ProcedureFactory`/`RouterFactory`
- Platform drivers for both Express and Fastify
- URL: https://nestjs-trpc.io/

#### Option B: `trpc-nestjs-adapter`

- Package: `trpc-nestjs-adapter`
- Simpler: just wraps tRPC router in a NestJS controller
- Supports request-scoped NestJS providers
- **Limitation**: batching does not work
- URL: https://github.com/macstr1k3r/trpc-nestjs-adapter

#### Option C: Custom Adapter via Fetch/Express Middleware

Mount tRPC as middleware within NestJS's underlying HTTP platform:

```ts
// For Express-based NestJS:
import * as trpcExpress from '@trpc/server/adapters/express';

// In NestJS bootstrap:
const app = await NestFactory.create(AppModule);
const expressApp = app.getHttpAdapter().getInstance();
expressApp.use('/trpc', trpcExpress.createExpressMiddleware({
  router: appRouter,
  createContext,
}));
```

Or use `createCallerFactory` to bridge NestJS controllers to tRPC procedures (server-side calls without HTTP overhead).

---

## 7. Context Creation

### Two-Step Setup

1. **Define type** during `initTRPC`:

```ts
const t = initTRPC.context<Context>().create();
```

2. **Create runtime context** for each request:

```ts
export async function createContext(opts: CreateHTTPContextOptions) {
  const token = opts.req.headers['authorization'];
  return { token };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
```

### Per-Request Behavior

`createContext()` is called **once per request**. All procedures within a single batched request share the same context.

### Inner/Outer Context Pattern

```ts
// Inner: always available (testing, server-side calls)
export async function createContextInner(opts?: { session: Session | null }) {
  return {
    db,
    session: opts?.session,
  };
}

// Outer: depends on HTTP request (only available via HTTP)
export async function createContext(opts: CreateHTTPContextOptions) {
  const session = getSessionFromCookie(opts.req);
  const contextInner = await createContextInner({ session });
  return {
    ...contextInner,
    req: opts.req,
    res: opts.res,
  };
}

// IMPORTANT: infer Context from INNER context
export type Context = Awaited<ReturnType<typeof createContextInner>>;
```

**Why inner context**: Whatever is defined in inner context is always available in procedures. Outer context (`req`/`res`) is only available via HTTP calls, not server-side calls or tests.

### Context Type Options per Adapter

| Adapter | Context Options Type |
|---------|---------------------|
| Standalone | `CreateHTTPContextOptions` / `CreateHTTP2ContextOptions` |
| Express | `trpcExpress.CreateExpressContextOptions` |
| Fastify | `CreateFastifyContextOptions` |
| Fetch | `FetchCreateContextFnOptions` (has `req: Request`, `resHeaders: Headers`, `info: TRPCRequestInfo`) |
| Next.js | `CreateNextContextOptions` |
| AWS Lambda | `CreateAWSLambdaContextOptions<APIGatewayProxyEvent>` |
| WebSocket | `CreateWSSContextFnOptions` |

### Note on Large Context Objects

> Putting a database client such as `prisma` on `createContextInner` is convenient and common, but large generated clients (like Prisma) can increase type-checking overhead because they become part of your context type across procedures. If that overhead becomes noticeable, import the client directly at call sites.

---

## 8. Error Handling

### TRPCError

```ts
import { TRPCError } from '@trpc/server';

throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'An unexpected error occurred',
  cause: originalError,  // optional: preserves stack trace
});
```

### Error Codes to HTTP Status

| Code | HTTP | Description |
|------|------|-------------|
| `PARSE_ERROR` | 400 | Invalid JSON / parse failure |
| `BAD_REQUEST` | 400 | Client error |
| `UNAUTHORIZED` | 401 | Missing/invalid auth |
| `PAYMENT_REQUIRED` | 402 | Payment needed |
| `FORBIDDEN` | 403 | Not authorized |
| `NOT_FOUND` | 404 | Resource not found |
| `METHOD_NOT_SUPPORTED` | 405 | Wrong HTTP method |
| `TIMEOUT` | 408 | Connection timeout |
| `CONFLICT` | 409 | State conflict |
| `PRECONDITION_FAILED` | 412 | Precondition not met |
| `PAYLOAD_TOO_LARGE` | 413 | Request too large |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Bad content type |
| `UNPROCESSABLE_CONTENT` | 422 | Valid syntax, bad semantics |
| `PRECONDITION_REQUIRED` | 428 | Missing required precondition header |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `CLIENT_CLOSED_REQUEST` | 499 | Client disconnected |
| `INTERNAL_SERVER_ERROR` | 500 | Unspecified server error |
| `NOT_IMPLEMENTED` | 501 | Feature not supported |
| `BAD_GATEWAY` | 502 | Invalid upstream response |
| `SERVICE_UNAVAILABLE` | 503 | Server not ready |
| `GATEWAY_TIMEOUT` | 504 | Upstream timeout |

### Extracting HTTP Status

```ts
import { getHTTPStatusCodeFromError } from '@trpc/server/http';

if (cause instanceof TRPCError) {
  const httpCode = getHTTPStatusCodeFromError(cause);
}
```

### onError Handler

```ts
createHTTPServer({
  router: appRouter,
  onError(opts) {
    const { error, type, path, input, ctx, req } = opts;
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
    }
  },
});
```

### Error Formatting

Custom error shapes inferred end-to-end to the client:

```ts
const t = initTRPC.create({
  errorFormatter(opts) {
    const { shape, error } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});
```

`errorFormatter` receives:

```ts
interface ErrorFormatterOpts {
  error: TRPCError;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: unknown;
  shape: { message: string; code: number; data: DefaultErrorData };
}
```

Default error shape:

```ts
interface DefaultErrorShape {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;  // JSON-RPC 2.0 numeric code
  data: {
    code: TRPC_ERROR_CODE_KEY;    // e.g., 'BAD_REQUEST'
    httpStatus: number;
    path?: string;
    stack?: string;               // only when isDev: true
  };
}
```

### Stack Traces

By default, `error.data.stack` only included when `isDev: true` (which defaults to `process.env.NODE_ENV !== 'production'`). Override with:

```ts
const t = initTRPC.create({ isDev: false });
```

---

## 9. Metadata

Procedure metadata allows attaching an optional `meta` property available in all middleware. Defined during `initTRPC`:

```ts
interface Meta {
  authRequired: boolean;
}

const t = initTRPC.context<Context>().meta<Meta>().create({
  defaultMeta: { authRequired: false },
});
```

### Using Meta in Middleware

```ts
const authedProcedure = t.procedure.use(async (opts) => {
  const { meta, next, ctx } = opts;
  if (meta?.authRequired && !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next();
});
```

### Chaining and Shallow Merging

```ts
const publicProcedure = t.procedure;
// Meta: { authRequired: false }  (from defaultMeta)

const authProcedure = publicProcedure
  .use(authMiddleware)
  .meta({ authRequired: true, role: 'user' });
// Meta: { authRequired: true, role: 'user' }

const adminProcedure = authProcedure.meta({ role: 'admin' });
// Meta: { authRequired: true, role: 'admin' }  (shallow merge)
```

### Use with OpenAPI

Meta is commonly used with `trpc-openapi` to expose REST-compatible endpoints:

```ts
interface Meta {
  openapi: { method: 'GET' | 'POST'; path: string };
}
```

---

## 10. Key v11 Changes from v10

### Breaking Changes

- **TypeScript >= 5.7.2 required**
- **Fastify adapter requires Fastify v5+** (v4 returns empty responses silently)
- Transformers moved to links (not on `initTRPC.create()` anymore)
- `@tanstack/react-query` v5 required for `@trpc/react-query`
- `experimental.sseSubscriptions` option moved to `sse`
- Subscription output type changed to `AsyncGenerator`

### New Features in v11

- **Async generator subscriptions** (`async function*`)
- **SSE-based subscriptions** (recommended over WebSockets)
- **`tracked()` helper** for automatic reconnection
- **HTTP/2 support** in standalone adapter
- **`basePath` option** in standalone adapter
- **Lazy-loading routers** for code splitting
- **Embedded promises** in nested response data (with `httpBatchStreamLink`)
- **SSE ping/keepalive** configuration
- **`retryLink`** for client-side retry
- **Stopping subscriptions from server** via generator `return`
- **AWS Lambda response streaming** adapter
- **`useSubscription` improvements** with connection status

---

## References

### Official Documentation
- [Server Adapters Overview](https://trpc.io/docs/server/adapters)
- [Server-Side Calls](https://trpc.io/docs/server/server-side-calls)
- [Middlewares](https://trpc.io/docs/server/middlewares)
- [Subscriptions](https://trpc.io/docs/server/subscriptions)
- [WebSockets](https://trpc.io/docs/server/websockets)
- [Context](https://trpc.io/docs/server/context)
- [Error Handling](https://trpc.io/docs/server/error-handling)
- [Error Formatting](https://trpc.io/docs/server/error-formatting)
- [Metadata](https://trpc.io/docs/server/metadata)
- [Migration v10 to v11](https://trpc.io/docs/migrate-from-v10-to-v11)

### Adapter-Specific Docs
- [Standalone](https://trpc.io/docs/server/adapters/standalone)
- [Express](https://trpc.io/docs/server/adapters/express)
- [Fastify](https://trpc.io/docs/server/adapters/fastify)
- [Fetch / Edge](https://trpc.io/docs/server/adapters/fetch)
- [Next.js](https://trpc.io/docs/server/adapters/nextjs)
- [AWS Lambda](https://trpc.io/docs/server/adapters/aws-lambda)

### Source Code (adapter internals)
- [`packages/server/src/adapters/fetch/fetchRequestHandler.ts`](https://github.com/trpc/trpc/blob/main/packages/server/src/adapters/fetch/fetchRequestHandler.ts)
- [`packages/server/src/adapters/node-http/nodeHTTPRequestHandler.ts`](https://github.com/trpc/trpc/blob/main/packages/server/src/adapters/node-http/nodeHTTPRequestHandler.ts)
- [`packages/server/src/unstable-core-do-not-import/http/resolveResponse.ts`](https://github.com/trpc/trpc/blob/main/packages/server/src/unstable-core-do-not-import/http/resolveResponse.ts)

### NestJS Integration
- [nestjs-trpc (official community)](https://nestjs-trpc.io/)
- [nestjs-trpc-v2](https://github.com/mguay22/nestjs-trpc-v2)
- [trpc-nestjs-adapter](https://github.com/macstr1k3r/trpc-nestjs-adapter)
- [trpc-nest-decorators](https://github.com/isaev-the-poetry/trpc-nest)

### GitHub Discussions
- [Server Side Calls with createCallerFactory (#6159)](https://github.com/trpc/trpc/discussions/6159)
- [Custom adapter for Chrome Extension (#5798)](https://github.com/trpc/trpc/discussions/5798)
- [Using with NestJS (#1504)](https://github.com/trpc/trpc/discussions/1504)
