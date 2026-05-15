# Context: Repository Supervision

> Repository supervisor scaffolding. Tracks which repos the user works in, working-tree posture, branch state, per-repo settings. Covers HANDOVER §6.1.

## Status

Implementation lives under `services/integration-hub/src/application/repos/**`. Web, CLI, TUI, tRPC, and worker bootstrap code call this service/application boundary instead of owning git sync, watcher, or dashboard logic.

## Vocabulary (planned)

- **Repo** — a registered git working tree on the local machine, identified by ULID and tracked across sessions.
- **Repo status** — current branch, head SHA, ahead/behind counts, dirty/untracked flags, last_checked_at.
- **Repo settings** — opaque key/value store keyed by repo id. Used by later layers (tasks, runs, artifacts).

## Planned surface

```
fulcrum repos register [path]
fulcrum repos list [--json]
fulcrum repos show <slug-or-id>
fulcrum repos sync <slug-or-id>
fulcrum repos unregister <slug-or-id>
```

## Persistence

- PostgreSQL production and PGlite local/test via the shared application persistence layer.
- Repository supervision read/write behavior is exercised by integration-hub service tests and cross-surface repo tests.

## Invariants (for the eventual implementation)

- Repo ids are ULIDs, never autoincrement.
- Listing is deterministic (`ORDER BY registered_at, id`).
- `register` is idempotent: re-registering a path updates `last_seen_at` only.
- `forget` removes the repo row plus its `repo_status` and `repo_settings` rows.
- Doctor surfaces `repos.count` and dead-path warnings.

## Cross-context coupling (planned)

- Hook integration: a `repo-track` hook on session start registers/refreshes for the cwd.
- Later layers (tasks, runs, artifacts) key their rows by `repo_id`.

## ADRs

Context-scoped decisions live with the integration-hub service when recorded. Create ADR directories lazily from `docs/adr/0000-template.md`.
