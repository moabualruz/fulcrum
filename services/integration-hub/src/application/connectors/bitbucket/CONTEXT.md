# Bitbucket Connector

Per-kind sub-area that owns Bitbucket pull request mirroring inside the integration-hub connectors surface: upsert command, org-scoped queries, and the DTO/input shapes the interface layer consumes.

## Language

**BitbucketPullRequest**:
The persisted mirror of a Bitbucket Cloud pull request, keyed by `(orgId, repoSlug, pullRequestId)` within the org scope.
_Avoid_: PR row, BB merge request.

**RepoSlug**:
The `workspace/repo` identifier Bitbucket uses to address a repository, used as the natural key alongside `pullRequestId`.
_Avoid_: Repo name, full name, slug.

**PullRequestId**:
The Bitbucket-assigned numeric pull request identifier, stored as a string to preserve the upstream representation.
_Avoid_: PR number, ticket id.

**UpsertBitbucketPullRequestInput**:
The `{repoSlug, pullRequestId, title, state}` payload accepted by `upsertBitbucketPullRequest`; missing `repoSlug`, `pullRequestId`, or `title` raises `AppValidationError`.
_Avoid_: PR payload, sync input.

**BitbucketPullRequestDto**:
The flattened `{id, orgId, projectId, repoSlug, pullRequestId, title, state}` response shape produced by `serializeBitbucketPullRequest` for interface adapters.
_Avoid_: PR view, PR record.

## Relationships

- A **BitbucketPullRequest** belongs to exactly one org and is matched on `(orgId, repoSlug, pullRequestId)` before insert vs update is decided.
- `upsertBitbucketPullRequest` consumes an **UpsertBitbucketPullRequestInput** and returns a **BitbucketPullRequestDto** via `serializeBitbucketPullRequest`.
- `listBitbucketPullRequests` filters by **RepoSlug** when provided, otherwise returns every **BitbucketPullRequest** in the org, ordered by `updatedAt DESC`.
- `getBitbucketPullRequest` looks up by primary `id` then enforces org scope, raising `AppForbiddenError` on cross-org access and `AppNotFoundError` when absent.

## Example dialogue

> **Dev:** "If two pull requests share the same `pullRequestId` across repos, do we collide?"
> **Domain expert:** "No — the natural key is `(orgId, repoSlug, pullRequestId)`. **RepoSlug** disambiguates, so the same **PullRequestId** in a different repo is a distinct **BitbucketPullRequest**."
> **Dev:** "What if `projectId` is missing on the context?"
> **Domain expert:** "Upsert falls back to the all-zero UUID placeholder; the row still persists, but it's a signal the caller didn't scope the request to a project."

## Flagged ambiguities

- **PullRequestId vs row `id`** — `PullRequestId` is the upstream Bitbucket identifier (string); the row `id` is the local UUID primary key. `getBitbucketPullRequest` takes the latter; the natural key uses the former.
- **State** — stored as a free-form string mirroring Bitbucket's value (e.g. `OPEN`, `MERGED`, `DECLINED`); no closed enum is enforced here, so callers must not assume a fixed vocabulary.
