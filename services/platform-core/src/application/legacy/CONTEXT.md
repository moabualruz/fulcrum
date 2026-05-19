# Legacy

Compatibility shims that re-export pre-NestJS product-store functions and adapters under stable application-layer paths, so callers migrating to the new service layout keep working without importing from `infrastructure/product-store` directly.

## Language

**LegacyShim**:
A thin re-export wrapper in this folder that forwards to an `infrastructure/product-store` module via dynamic `import()`.
_Avoid_: facade, proxy, bridge, compatibility layer

**LegacySymphonyStore**:
An alias of `SqlExecutor` passed to symphony shim functions as their first argument.
_Avoid_: symphony db, orchestrator store, run store

**LegacyDatabaseHandle**:
An alias of `SqlExecutor` accepted by `web-runtime` shim functions for legacy callers expecting a raw handle.
_Avoid_: db, connection, store handle

**SqlAccess**:
An `EntityManager`-backed `execute(sql, params)` adapter exposed for legacy callers that predate `SqlExecutor`.
_Avoid_: query runner, db wrapper, raw sql client

**SettingsScreen**:
A `{ key, label, group }` record describing one navigable screen in the legacy settings surface.
_Avoid_: settings page, tab, section

## Relationships

- A **LegacyShim** function delegates to exactly one named export in `infrastructure/product-store/**` and adds no behavior.
- A **SqlAccess** adapter is constructed from a TypeORM `EntityManager` and is consumed only by callers not yet ported to `SqlExecutor`.
- A **SettingsScreen** belongs to one `group`; `settingsScreenGroups()` partitions the list, `settingsBreadcrumb(key)` resolves one entry.
- `createProjectAction` / `updateProjectAction` / `deleteProjectAction` are the only shims that publish through the parent service's `DomainEventOutbox` via `eventDispatcher.dispatch`.

## Example dialogue

> **Dev:** "Should new code import `createProject` from `application/legacy/web-runtime.ts`?"
> **Domain expert:** "No — that path is a **LegacyShim**. New code calls the NestJS application service that owns projects; this folder exists only to keep older call sites compiling during the migration."

## Flagged ambiguities

- "store" in **LegacySymphonyStore** / **LegacyDatabaseHandle** names a `SqlExecutor`, not the **ComponentLedger** SQLite store from the parent context — resolved: these aliases are SQL-executor handles, never the ledger.
