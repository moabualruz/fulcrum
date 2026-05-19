# Database

Application-layer database orchestration: resolving backend selection, opening the SQL executor, exposing schema migration commands, and recovering stale PGlite locks before connect.

## Language

**ResolvedDatabaseConfig**:
The fully-merged decision of which backend to open, holding either a `pglite` `dataDir` or a `postgres` `url` after CLI, env, and persisted config have been collapsed.
_Avoid_: db settings, connection options, dsn

**DatabaseConfigInput**:
The unresolved triplet (`env`, `config`, `cli`) fed into `resolveDatabaseConfig`, capturing each source before precedence is applied.
_Avoid_: config bag, args, input

**FulcrumHome**:
The directory rooting local state, taken from `FULCRUM_HOME` or `~/.fulcrum`, under which the default PGlite `db/main` data dir lives.
_Avoid_: state dir, app home, workdir

**ProductDbStatus**:
The doctor-shaped status record combining `backend`, redacted `connection`, runtime selection, current/pending migrations, and `pastDue` count.
_Avoid_: health snapshot, db report, info dump

**ProductDbConnectionSummary**:
The redacted, displayable connection descriptor (`local-pglite` + `dataDir`, or `postgres` + password-masked `url`) safe to surface in CLI output.
_Avoid_: dsn, connection string, target

**StandalonePgliteMigration**:
A self-contained migration run that builds its own TypeORM `DataSource` over the PGlite driver — used when no DI container is available.
_Avoid_: bootstrap migrate, raw migrate, fallback

**PgliteLockRecoveryResult**:
The outcome of inspecting `postmaster.pid` in the PGlite data dir, reporting `absent | active | stale-removed | unparseable` and the parsed pid.
_Avoid_: lock check, pid file result

## Relationships

- A **DatabaseConfigInput** resolves into exactly one **ResolvedDatabaseConfig** via fixed precedence (CLI → env → persisted → default `pglite`).
- A **ResolvedDatabaseConfig** opens one `SqlExecutor`; the `postgres` branch carries `url`, the `pglite` branch carries `dataDir` rooted at **FulcrumHome**.
- A **ProductDbStatus** wraps one **ProductDbConnectionSummary** plus the **SchemaMigration** ledger view (`current`, `pending`, `pastDue`).
- A **StandalonePgliteMigration** writes **SchemaMigration** rows and appends **Event** audit rows through the same repositories the container-backed path uses.
- A **PgliteLockRecoveryResult** with status `active` blocks opening the **ResolvedDatabaseConfig**; `stale-removed` clears the path for connect.

## Example dialogue

> **Dev:** "If `FULCRUM_DATABASE_URL` is set and `--backend pglite` is passed, what does `resolveDatabaseConfig` return?"
> **Domain expert:** "CLI wins — backend is `pglite`, and the env URL is ignored for selection. The **ResolvedDatabaseConfig** carries `dataDir`, not `url`."
> **Dev:** "And the standalone PGlite migrate path — why does it exist next to `runSchemaMigration`?"
> **Domain expert:** "**StandalonePgliteMigration** is the no-container fallback for bootstrap and tests; it constructs its own `DataSource` over the PGlite driver but writes the same **SchemaMigration** and **Event** rows."

## Flagged ambiguities

- "backend" was used to mean both the `DbBackend` literal (`pglite | postgres`) and the broader **DatabaseRuntime** selection from the parent context — resolved: here it is only the literal; **DatabaseRuntime** stays in `services/platform-core/CONTEXT.md`.
- "status" overlapped **ProductDbStatus** (this module's doctor record) and **PgliteLockRecoveryResult.status** (lock-file state) — resolved: distinct; the lock status is a field, not a synonym.
