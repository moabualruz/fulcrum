# Testing

Seeding and cleanup helpers that stage realistic workflow-coordination rows (projects, tasks, docs, **Artifacts**, search entries) for end-to-end suites that drive the live database through public surfaces.

## Language

**E2eFixture**:
A scripted insert that materializes a single domain row (project, task, doc, **Artifact**, search entry) under an `orgId` so an E2E test can exercise it through the real API.
_Avoid_: factory, seed, mock, stub.

**SeedInput**:
The typed payload describing one **E2eFixture** to insert (`E2eSeedProjectInput`, `E2eSeedTaskInput`, `E2eSeedDocInput`, `E2eSeedArtifactInput`, `E2eSeedSearchKindsInput`).
_Avoid_: params, options, config.

**CleanupManifest**:
The `E2eCleanupInput` record of ids produced during a test (`artifactIds`, `docIds`, `taskIds`, `projectIds`, `runIds`, `searchSourceIds`) replayed by `cleanupE2eFixtures` to delete every row the test created.
_Avoid_: teardown list, garbage list, rollback set.

**DualWriteSeed**:
A seed call that writes the legacy table and its `fulcrum_*` counterpart in one helper (e.g. `projects` + `fulcrum_projects`, `artifacts` + `fulcrum_artifacts`) so both read paths resolve the same fixture.
_Avoid_: mirror write, shadow write, sync insert.

## Relationships

- A test issues one-or-more **SeedInput** calls; each call produces one **E2eFixture** row (and its dual counterpart when **DualWriteSeed** applies) and contributes ids to the **CleanupManifest**.
- An `E2eSeedArtifactInput` **E2eFixture** produces exactly one `agent_runs` row and exactly one **Artifact** row, both recorded in the **CleanupManifest** under `runIds` and `artifactIds`.
- A **CleanupManifest** drives `cleanupE2eFixtures` to delete rows in dependency order (artifacts → docs → tasks → search entries → projects → runs).

## Example dialogue

> **Dev:** "If I call `seedE2eArtifact`, what do I add to my **CleanupManifest**?"
> **Domain expert:** "Both the returned `id` under `artifactIds` and the returned `runId` under `runIds` — the helper is a **DualWriteSeed** that inserts into `artifacts` and `fulcrum_artifacts` plus an `agent_runs` row, and `cleanupE2eFixtures` needs every id to fully tear it down."

## Flagged ambiguities

- "Fixture" vs "Seed" vs "Factory" — resolved: **E2eFixture** for the inserted row, **SeedInput** for the typed input. "Factory" is not used here; reserve it for object-construction helpers in unit tests.
- "Cleanup" vs "Teardown" vs "Rollback" — resolved: **CleanupManifest** + `cleanupE2eFixtures`. "Teardown" is the test-framework hook that calls them; "rollback" implies a transaction boundary that does not exist for these suites.
