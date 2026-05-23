# GitLab Connector

Per-kind GitLab sub-area: owns the `GitlabMergeRequest` upsert command, list/get queries, and serializer that the broader Connectors area routes to once a `gitlab` ConnectorKind is provisioned.

## Language

**GitlabMergeRequest**:
The persisted per-org row representing one merge request, keyed by `(orgId, repoPath, mergeRequestIid)`.
_Avoid_: MR, pull request, GitLab PR.

**RepoPath**:
The GitLab project's `group/subgroup/repo` namespace path used as the natural key alongside `mergeRequestIid`.
_Avoid_: Repo slug, project path, full name.

**MergeRequestIid**:
GitLab's per-project internal id (`iid`), distinct from the global `id`, used in URLs and as part of the natural key.
_Avoid_: MR id, pr number, merge id.

**UpsertGitlabMergeRequestInput**:
The `{repoPath, mergeRequestIid, title, state}` DTO accepted by `upsertGitlabMergeRequest`; org and project are sourced from `AppContext`.
_Avoid_: MR payload, sync input.

**GitlabMergeRequestDto**:
The serialized read shape `{id, orgId, projectId, repoPath, mergeRequestIid, title, state}` returned by all commands and queries here.
_Avoid_: MR row, GitLab record.

## Relationships

- A **GitlabMergeRequest** belongs to exactly one org (via `AppContext.orgId`) and one project (via `AppContext.projectId`, defaulted to the nil UUID when absent).
- `upsertGitlabMergeRequest` finds by `(orgId, repoPath, mergeRequestIid)` then writes `title`/`state`/`updatedAt`; it never creates duplicates for the same natural key.
- `listGitlabMergeRequests` and `getGitlabMergeRequest` both enforce org scope — `getGitlabMergeRequest` raises `AppForbiddenError` when the row's org differs from `ctx.orgId`.
- All three operations return a **GitlabMergeRequestDto** via the shared `serializeGitlabMergeRequest` helper.

## Example dialogue

> **Dev:** "If I upsert with the same `mergeRequestIid` but a different `repoPath`, do I overwrite?"
> **Domain expert:** "No — the natural key is `(orgId, repoPath, mergeRequestIid)` together. Different **RepoPath** means a different **GitlabMergeRequest** row, even if the iid collides."
> **Dev:** "Why does `upsertGitlabMergeRequest` accept `projectId` from context instead of input?"
> **Domain expert:** "Project scope is an ambient concern of `AppContext`, not a property of the MR payload. When `ctx.projectId` is null we fall back to the nil UUID so the column stays non-null at the global scope."

## Flagged ambiguities

- **MergeRequestIid vs MR id** — GitLab exposes both a global `id` and a per-project `iid`; this sub-area persists `iid` as `mergeRequestIid` and never stores the global id. Do not conflate them when wiring webhook payloads.
- **RepoPath vs projectId** — `RepoPath` is the GitLab-side namespace string; `projectId` is the Fulcrum project UUID from `AppContext`. They are not interchangeable keys.
