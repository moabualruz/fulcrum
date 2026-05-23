# Integration Hub

Bounded service that owns Fulcrum's outward-facing boundary: local git **Repos**, external-system **Connectors** (PM tools, code hosts, wikis), outbound **Webhooks**, and full-workspace data portability (JSON manifest + CSV).

## Language

**Repo**:
A registered local git working tree identified by ULID, tracked with branch/sha/dirty posture across sessions.
_Avoid_: Repository (TypeORM term), Project, Workspace, Folder.

**RepoStatus**:
Mutable snapshot of a Repo's current branch, head SHA, ahead/behind counts, dirty/untracked flags, last_checked_at.
_Avoid_: Working-tree state, git state.

**Connector**:
An adapter that pulls/pushes tasks (or repo metadata) between Fulcrum and one external system, identified by `ConnectorKind` (`jira`, `linear`, `plane`, `github-issues`, `github`, `gitlab`, `bitbucket`, `confluence`, `notion`).
_Avoid_: Integration, Plugin, Provider, Sync source.

**ConnectorKind**:
The closed enum of supported external systems; each value names exactly one Connector adapter and its feature flag (`connector-<kind>`).
_Avoid_: Provider type, integration name.

**ConnectorState**:
Per-org enablement record for a Connector — `{orgId, kind, name, enabled}` plus connector-specific cursors (e.g. `GithubConnectorState.cursor`, `installationId`, `repoFullName`).
_Avoid_: Connection, credential, account.

**ConnectorAdapter**:
Runtime contract a Connector implements: `connect`, `disconnect`, `pull`, `push(items)`, `healthCheck`. Registered with `ConnectorRegistry`.
_Avoid_: Driver, client.

**Importer**:
A one-shot historical-import path (under `application/importers/sources`) that walks an external system's API, maps rows via a `FieldMap`, and upserts `FulcrumTask` rows. Used for backfill; Connector handles ongoing sync.
_Avoid_: Migration, loader, ETL.

**FieldMap**:
A per-source mapping table (`jira.fieldmap.ts`, `linear.fieldmap.ts`, `plane.fieldmap.ts`) that translates external field names + status vocab into Fulcrum's domain shape.
_Avoid_: Schema, transformer.

**SyncResult**:
Outcome of a Connector or Importer run: `{imported, updated, errors}` (framework) or `{pulled, pushed, skipped, errors}` (adapter).
_Avoid_: Sync report, summary.

**SyncLog**:
Persisted row in `connector_sync_log` recording each Connector run's status (`running`/`succeeded`/`failed`) with counts and error message. Source of truth for doctor health output.
_Avoid_: Audit log, run record.

**Webhook**:
An outbound HTTP subscription owned by an org: `{url, eventsFilter, secret, enabled}`. Fires on domain events (`task.created`, `run.completed`, `sprint.started`, etc.).
_Avoid_: Hook (ambiguous with PreToolUse hooks), callback, subscriber.

**WebhookEventType**:
The closed enum of events a Webhook may subscribe to (`task.*`, `run.*`, `doc.*`, `sprint.*`).
_Avoid_: Event name, topic.

**WebhookDelivery**:
A single attempt to POST one event to one Webhook URL, with `status` (`pending`/`delivered`/`failed`/`retrying`), `attempt`, `responseCode`, `nextRetryAt`.
_Avoid_: Send, dispatch record.

**ImportManifest**:
A `fulcrum.json-export.v1` document — `{format, manifest: {schema_version, fulcrum_version, exported_at, counts, column_types}, <table>: rows[]}` — used for full-workspace JSON export/import with `skip|update|error` collision policy.
_Avoid_: Backup, dump, snapshot.

**ExportRedaction**:
The column-level filter that strips secret material (the `credentials` table and any column matching the redaction list) from an `ImportManifest` before write.
_Avoid_: Sanitization, masking, scrubbing.

## Relationships

- An **Org** owns many **Repos**, **Connectors**, **ConnectorStates**, **Webhooks**.
- A **Repo** has exactly one current **RepoStatus** (updated by the watcher worker).
- A **ConnectorAdapter** is registered once per **ConnectorKind** in the **ConnectorRegistry**; enablement is per-org via **ConnectorState**.
- An **Importer** is keyed by a source name that overlaps **ConnectorKind** (`jira`, `linear`, `plane`) but is a separate code path: Importer = historical backfill, Connector = ongoing sync.
- A **Connector** run produces zero or one **SyncResult** and exactly one terminal **SyncLog** row (`succeeded` or `failed`).
- A **Webhook** has many **WebhookDeliveries** (one per attempt per fired event).
- An **ImportManifest** covers many tables across all services; **ExportRedaction** is applied per row before write.

## Example dialogue

> **Dev:** "We're adding GitLab pull-request mirroring. Is that a **Connector** or an **Importer**?"
> **Domain expert:** "Both layers exist. The **Importer** at `application/importers/sources/` does the one-shot historical pull and field-maps into `FulcrumTask`. The **Connector** at `application/connectors/gitlab/` owns ongoing state (`ConnectorState.cursor`), is gated by `connector-gitlab` flag, and writes a **SyncLog** per run. Start with the **Importer** for backfill; promote to **Connector** when you need incremental sync."
> **Dev:** "And the local checkout we clone to disk is a **Repo**, not a **Connector**?"
> **Domain expert:** "Right — **Repo** is the local git working tree (ULID, branch, dirty flag, watcher worker). The `github` **Connector** talks to the GitHub API; the **Repo** talks to the filesystem. They are independent."

## Flagged ambiguities

- **Repo vs Repository vs Connector** — "Repo" is the Fulcrum domain term for a registered local git working tree (ULID, ahead/behind, watcher). "Repository" is reserved for the TypeORM/DDD persistence pattern (`TypeOrmModule.forFeature`) and never appears in user-facing language. "Connector" is the external-system adapter; a `github` **Connector** is not a **Repo** even though both relate to GitHub.
- **Connector vs Importer** — both have `jira`/`linear`/`plane` variants and both upsert tasks. Resolved: **Importer** = one-shot historical backfill with field maps; **Connector** = ongoing sync via `ConnectorAdapter` + `ConnectorState` cursor + `SyncLog`. Code paths must not be merged.
- **Webhook (outbound) vs hook (PreToolUse)** — repo-wide "hooks" usually mean PreToolUse/PostToolUse hook subcommands. Inside this service, **Webhook** always means an outbound HTTP subscription. Never abbreviate to "hook" here.
- **`github` vs `github-issues` ConnectorKind** — two distinct kinds. `github-issues` is the Importer-style task source; `github` is the broader code-host Connector (PRs, repo metadata, installation tokens). Both legal `ConnectorKind` values.
- **ImportManifest vs CSV import** — JSON `ImportManifest` is full-workspace, schema-versioned, multi-table, redaction-aware, gated on `import-export`. CSV import (`data-exchange/csv-import.ts`) is single-table task import gated on `import-csv`. Not interchangeable.
- **External connectors framework vs connectors/** — `application/external-connectors/` is the registry + `ConnectorAdapter` interface layer; `application/connectors/<kind>/` holds per-kind state commands/queries (e.g. `GithubConnectorState` cursor). Both are part of the Connector concept; do not introduce a third term.
