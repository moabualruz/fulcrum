# Project Connectors

Sub-area that scopes a **Connector**'s enablement to a single **Project** within an org, with its own row, config blob, and sync timestamp — distinct from the org-wide `ConnectorState` registered in the parent service.

## Language

**ProjectConnector**:
A row in `project_connectors` binding one **Project** to one `connectorType` with `enabled`, `config`, and `last_synced_at`.
_Avoid_: ProjectIntegration, ProjectBinding, ProjectLink.

**ConnectorType**:
The string discriminator stored on a **ProjectConnector** row identifying which adapter handles it; overlaps the parent `ConnectorKind` enum but typed as raw string at this layer.
_Avoid_: Kind, provider, adapterName.

**ConnectorConfig**:
The per-**ProjectConnector** JSONB blob holding adapter-specific settings (repo slug, board id, project key).
_Avoid_: Settings, options, params.

**LastSyncedAt**:
Timestamp stamped on a **ProjectConnector** by `syncProjectConnector`; refusal point for disabled rows.
_Avoid_: SyncedAt, lastRun, lastPull.

## Relationships

- A **Project** owns zero or more **ProjectConnectors**, unique by (`projectId`, `connectorType`).
- A **ProjectConnector** carries one **ConnectorConfig** and one **LastSyncedAt**.
- An org-wide **ConnectorState** (parent context) enables a `ConnectorKind`; a **ProjectConnector** scopes that enablement to one **Project**.
- Every upsert/sync writes a `project_connector` event via `appendEventOrm`.

## Example dialogue

> **Dev:** "Two projects in the same org both link to Jira. One `ConnectorState` or two **ProjectConnectors**?"
> **Domain expert:** "One org-level `ConnectorState` for `jira` (credentials, feature flag). Two **ProjectConnectors** — one per **Project** — each with its own **ConnectorConfig** (board id, project key) and **LastSyncedAt**."
> **Dev:** "Can I sync a disabled **ProjectConnector**?"
> **Domain expert:** "No — `syncProjectConnector` throws if `enabled` is false."

## Flagged ambiguities

- **ProjectConnector vs ConnectorState** — `ConnectorState` (parent) is org-wide enablement of a `ConnectorKind`; **ProjectConnector** is per-project binding with its own config. Both can coexist for the same kind.
- **ConnectorType (string) vs ConnectorKind (enum)** — this sub-area stores `connector_type` as raw string for forward compatibility; values should still resolve to a parent `ConnectorKind`. Do not introduce a third vocabulary.
