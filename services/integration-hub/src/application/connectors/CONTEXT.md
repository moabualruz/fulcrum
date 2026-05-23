# Connectors

Per-kind Connector surface: holds the global web-action entry points (feature-flag gating, descriptor listing, save/sync stubs) plus sub-folders (`github/`, `gitlab/`, `bitbucket/`) that own each kind's `ConnectorState` cursors, commands, and queries.

## Language

**ConnectorName**:
The narrow subset of `ConnectorKind` exposed to global web actions (`confluence`, `notion`, `github-issues`); broader kinds route through project connector settings.
_Avoid_: Connector type, web kind.

**ConnectorDescriptor**:
A `{name, enabled, config}` row returned by `listConnectors` for UI/CLI rendering, where `enabled` reflects the `connector-<name>` feature flag and `config` is null at the global scope.
_Avoid_: Connector summary, status row.

**ConnectorConfig**:
The `{name, host, email, token}` input accepted by `saveConnectorConfig`; persistence is delegated to project connector settings, never stored globally.
_Avoid_: Credentials, account, connection settings.

**FeatureList**:
The parsed `FULCRUM_FEATURES` env var, the sole authority for whether a `connector-<name>` flag is on at this layer.
_Avoid_: Feature flags map, env flags.

## Relationships

- A **ConnectorName** is always a member of the parent service's **ConnectorKind**, never a superset.
- `listConnectors` returns one **ConnectorDescriptor** per **ConnectorName**, gated by **FeatureList**.
- `saveConnectorConfig` accepts a **ConnectorConfig** but raises `AppInvariantError` — global persistence is intentionally absent; project scope owns it.
- Per-kind sub-folders (`github/`, `gitlab/`, `bitbucket/`) own that kind's **ConnectorState** commands/queries and are not addressed by `web-actions.ts`.

## Example dialogue

> **Dev:** "Can I save a Notion token through `saveConnectorConfig`?"
> **Domain expert:** "No — it validates the **ConnectorConfig** and feature flag, then throws `AppInvariantError`. Global persistence is a stub; the real save lives in project connector settings. The web action exists so the UI can surface the `connector-notion` flag state via `listConnectors`."
> **Dev:** "Why is `github-issues` here but not `github`?"
> **Domain expert:** "`ConnectorName` is the global-web subset. The broader `github` kind has its own sub-folder under `connectors/github/` with **ConnectorState** cursors and installation handling — that path doesn't route through `web-actions.ts`."

## Flagged ambiguities

- **ConnectorName vs ConnectorKind** — `ConnectorName` (this file) is the three-value web-action subset; `ConnectorKind` (parent service) is the full closed enum. Do not widen `ConnectorName` without promoting the kind through project connector settings first.
- **ConnectorConfig (here) vs ConnectorState (parent)** — `ConnectorConfig` is the unsaved input DTO at the global web layer; `ConnectorState` is the persisted per-org record under per-kind sub-folders. Not interchangeable.
