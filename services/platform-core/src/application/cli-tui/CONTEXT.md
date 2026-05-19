# CLI/TUI

Application-layer helpers that prepare platform-core state for the Fulcrum CLI and TUI surfaces (database bootstrap, default-org readiness) before they call into other services.

## Language

**ProductReadiness**:
The result returned to a CLI/TUI surface after the local product database has been initialized, reporting the resolved engine, applied schema status, and the default org row.
_Avoid_: startup check, health, init result, bootstrap report

## Relationships

- A **ProductReadiness** result is produced once per CLI/TUI cold start and wraps a parent **DatabaseRuntime** selection plus a parent **LocalBootstrapSeed** run; it adds no new persisted state.

## Example dialogue

> **Dev:** "Where should the TUI call to know the local DB is ready?"
> **Domain expert:** "`initializeLocalProductReadiness` — it resolves the **DatabaseRuntime**, runs migrations, ensures the default org from **LocalBootstrapSeed**, and returns a **ProductReadiness** the surface can render."

## Flagged ambiguities

- None specific to this sub-area; all other vocabulary (Org, DatabaseRuntime, LocalBootstrapSeed, SchemaMigration) is owned by the parent `services/platform-core/CONTEXT.md`.
