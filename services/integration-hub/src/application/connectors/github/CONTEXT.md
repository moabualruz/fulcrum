# GitHub Connector

Per-repo `GithubConnectorState` commands and queries: upsert-by-`(org, installationId, repoFullName)`, list/get with org-scope enforcement, and DTO serialization for the GitHub `ConnectorKind`.

## Language

**GithubConnectorState**:
The persisted per-org, per-repo record keyed by `(orgId, installationId, repoFullName)` with a sync `cursor`.
_Avoid_: GitHub config, repo connection.

**InstallationId**:
The GitHub App installation identifier that authorizes access to a repository under this org.
_Avoid_: App id, integration id.

**RepoFullName**:
The `owner/repo` slug that pairs with an **InstallationId** to uniquely identify a connected repository.
_Avoid_: Repo path, repository name.

**Cursor**:
The opaque sync checkpoint string (nullable) advanced by upserts to resume incremental ingestion.
_Avoid_: Offset, sync token, watermark.

**GithubConnectorStateDto**:
The serialized `{id, orgId, projectId, installationId, repoFullName, cursor}` shape returned to callers; entities are never returned directly.
_Avoid_: GitHub state object, response payload.

## Relationships

- An **Org** owns many **GithubConnectorState** rows, one per `(InstallationId, RepoFullName)` pair.
- `upsertGithubConnectorState` finds-or-creates a **GithubConnectorState** and advances its **Cursor** in a single transaction.
- `getGithubConnectorState` raises `AppForbiddenError` when the row's org does not match the **AppContext** org.
- `serializeGithubConnectorState` maps a **GithubConnectorState** entity to a **GithubConnectorStateDto** for application boundaries.

## Example dialogue

> **Dev:** "If the same **InstallationId** connects two repos, do I get one row?"
> **Domain expert:** "No — uniqueness is `(orgId, installationId, repoFullName)`, so each **RepoFullName** is its own **GithubConnectorState** with its own **Cursor**."
> **Dev:** "What if `projectId` is missing on the **AppContext**?"
> **Domain expert:** "Upsert falls back to the zero-UUID sentinel. That's a creation-time default for org-scoped rows, not a real project link."

## Flagged ambiguities

- **Cursor vs sync state** — `Cursor` is an opaque resume token written by ingestion; it is not a structured progress object. Treat as a string blob.
- **projectId sentinel** — The `00000000-0000-4000-8000-000000000000` value on insert means "no project scope yet", not a real **Project**. Do not query against it as a foreign key.
