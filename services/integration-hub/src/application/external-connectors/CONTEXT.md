# External Connectors

The framework layer that defines the `ConnectorAdapter` contract, holds the per-process `ConnectorRegistry`, and ships the shared `ConnectorBase` pull-sync orchestrator used by every per-kind connector under `application/connectors/<kind>/`.

## Language

**ConnectorRegistry**:
Per-process map of `ConnectorKind` to live `ConnectorAdapter` instances, owning enablement state and `connect`/`disconnect` lifecycle.
_Avoid_: Container, manager, factory.

**ConnectorBase**:
Abstract base class with `name`, `flag`, and `fetch()` that subclasses implement to return `UpsertTaskInput[]`; consumed by `runConnectorJob`.
_Avoid_: BaseConnector, AbstractConnector.

**UpsertTaskInput**:
Normalized per-item shape returned from `ConnectorBase.fetch()` (external_id, title, status, optional labels/assignee/sprint fields) before upsert into `tasks`.
_Avoid_: TaskDTO, TaskRow, FetchedTask.

**runConnectorJob**:
Orchestrator that guards on the connector's `flag`, opens a `running` sync-log row, iterates `fetch()` items, upserts tasks by `(org_id, external_id)`, and closes the row with `succeeded`/`failed`.
_Avoid_: syncConnector, runSync, executeConnector.

**FeatureDisabledError**:
Thrown by `ConnectorRegistry.enable` when `connector-<kind>` feature flag is off; carries `flag` and `kind`.
_Avoid_: FlagDisabledError, DisabledError.

**doctorConnectorCheck**:
Query that returns the latest `SyncLog` row per connector for an org, feeding `fulcrum doctor` health output.
_Avoid_: healthReport, lastRuns.

## Relationships

- A **ConnectorRegistry** holds at most one **ConnectorAdapter** per **ConnectorKind**.
- A **ConnectorBase** subclass is paired with a `connector-<kind>` flag and run by **runConnectorJob**; it does not itself live in the **ConnectorRegistry**.
- **runConnectorJob** writes exactly one terminal **SyncLog** row per invocation; **doctorConnectorCheck** reads the latest row per connector.
- **UpsertTaskInput** is the only shape that crosses from a `ConnectorBase` subclass into `runConnectorJob`.

## Example dialogue

> **Dev:** "Does my new adapter go in the **ConnectorRegistry** or extend **ConnectorBase**?"
> **Domain expert:** "Both, for different jobs. Implement `ConnectorAdapter` and register with **ConnectorRegistry** for the lifecycle surface (`connect`/`pull`/`push`/`healthCheck`). Extend **ConnectorBase** when you want **runConnectorJob** to drive a one-way pull with **UpsertTaskInput** and sync-log bookkeeping for free."

## Flagged ambiguities

- **ConnectorAdapter vs ConnectorBase** — `ConnectorAdapter` (in `interface.ts`) is the full bidirectional contract the **ConnectorRegistry** stores; `ConnectorBase` (in `framework.ts`) is the pull-only abstract class consumed by **runConnectorJob**. A kind may implement either or both.
- **SyncResult shape** — `interface.ts` exports `{pulled, pushed, skipped, errors}` (adapter return); `framework.ts` re-declares `SyncResult` as `{imported, updated, errors}` (job return). The names collide intentionally per parent CONTEXT; do not unify the shapes.
- **isFeatureEnabled (framework) vs ConnectorRegistryOptions.isFeatureEnabled** — the framework helper reads `FULCRUM_FEATURES` env directly for `runConnectorJob`; the registry option is an injected per-org predicate for `enable()`. Both gate on `connector-<kind>` but at different layers.
