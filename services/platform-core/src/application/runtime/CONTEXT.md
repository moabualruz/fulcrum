# Runtime

Process-lifetime wiring for the platform-core service: how the TypeORM `DataSource`, request-scoped `EntityManager`, and dependency-injection container are constructed for CLI/worker and web entrypoints, and how a per-request tenancy scope is resolved.

## Language

**DiContainer**:
A minimal structural DI container interface (`get`/`has`/`bind`) used during the needle-di → NestJS migration to keep non-bootstrap code framework-agnostic.
_Avoid_: injector, registry, service locator

**LocalApplicationContainer**:
The CLI/worker-side composition root holding a built `DiContainer` plus a `cleanup` thunk that destroys the underlying `DataSource`.
_Avoid_: app container, root module, bootstrap

**WebRuntime**:
The long-lived web-process composition root holding the `ApplicationOrm`, optional `FlagRegistry`, optional `authHandler`, and a `createRequestContext` factory.
_Avoid_: server context, app context, runtime singleton

**WebRequestRuntime**:
The per-request value carrying the request-scoped `EntityManager` and `DiContainer` derived from a `WebRuntime`.
_Avoid_: request context, request scope, http context

**WebDatabaseHandle**:
The singleton `initDatabase()` returns: `engine: "typeorm"`, `em`, `orm`, plus raw `query`/`exec`/`close` for legacy SQL access.
_Avoid_: db, connection, client, pool

**ApplicationPersistence**:
The TypeORM `EntityManager` alias used by application services as their persistence seam.
_Avoid_: repository, session, unit of work

**ApplicationOrm**:
The TypeORM `DataSource` alias used when callers need the orm root rather than an `EntityManager`.
_Avoid_: connection, db client

**ApplicationScopeResult**:
The resolved per-call tenancy envelope produced by `resolveApplicationScope`: an `em` plus a `ctx` of `{ orgId, userId, projectId }`.
_Avoid_: auth context, session, principal

**LocalDevelopmentSession**:
The synthetic session returned by `localDevSession` for unauthenticated local web use, carrying a fake `session`, resolved `orgId`, and `userId` (defaulting to `local-admin`).
_Avoid_: dev login, anonymous session, guest

## Relationships

- A **WebRuntime** is built once per process by `createDefaultWebRuntime` and produces one **WebRequestRuntime** per inbound request via `createRequestContext`.
- A **LocalApplicationContainer** wraps exactly one `DataSource` and exposes it through a **DiContainer** keyed by the `DataSource` token.
- `initDatabase()` returns the singleton **WebDatabaseHandle**; `getDatabase()` retrieves it; both throw if startup ordering is wrong.
- `resolveApplicationScope` consumes an **ApplicationPersistence** plus optional `orgId`/`projectId`/`taskId`/`runId` and returns an **ApplicationScopeResult** by delegating to `identity-access` and `work-management`.
- A **WebRequestRuntime** is the runtime-side input to `resolveApplicationScope` for HTTP/tRPC handlers; a **LocalApplicationContainer** plays the same role for CLI/worker code paths.
- `startLocalWorkflowSupervisor` reads the `DataSource` out of a **DiContainer** to boot the execution-orchestration symphony orchestrator against `DEFAULT_ORG_ID`.

## Example dialogue

> **Dev:** "Inside a tRPC procedure I have a **WebRequestRuntime** — how do I get the tenancy `ctx`?"
> **Domain expert:** "Call `resolveApplicationScope({ em: req.em, orgId, userId })` with the request's `EntityManager`; it returns an **ApplicationScopeResult** with `ctx.orgId` and `ctx.projectId` already resolved."
> **Dev:** "And from `fulcrum web`, who builds the **WebRuntime**?"
> **Domain expert:** "`createDefaultWebRuntime` — it calls `initDatabase()` for the singleton **WebDatabaseHandle**, wires the `FlagRegistry` and `authHandler`, then exposes `createRequestContext` for each request. CLI/worker code uses `buildLocalApplicationContainer` instead and gets a **LocalApplicationContainer**."

## Flagged ambiguities

- "container" was used for both the **DiContainer** (the structural interface) and the **LocalApplicationContainer** (the composition root that holds one) — resolved: **DiContainer** is the interface, **LocalApplicationContainer** is the bootstrap result that owns one plus a `cleanup` thunk.
- "runtime" overlapped **WebRuntime** (process-lifetime) and **WebRequestRuntime** (request-lifetime) — resolved: **WebRuntime** is built once per process and produces one **WebRequestRuntime** per request via `createRequestContext`.
- "em" / "orm" / "db" were used interchangeably for the persistence seam — resolved: **ApplicationPersistence** is the `EntityManager` and is the default seam; **ApplicationOrm** is the `DataSource` and is only used when the orm root is needed; **WebDatabaseHandle** is the singleton wrapper exposing both plus legacy raw SQL.
