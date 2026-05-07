# Context: Repo

> Repository supervisor scaffolding. Tracks which repos the user works in, working-tree posture, branch state, per-repo settings. Covers HANDOVER §6.1.

## Status

**Scaffolding only.** Migrations under `src/repo/migrations/` ship; CLI surface (`fulcrum repo …`) is not wired yet.

## Vocabulary (planned)

- **Repo** — a registered git working tree on the local machine, identified by ULID and tracked across sessions.
- **Repo status** — current branch, head SHA, ahead/behind counts, dirty/untracked flags, last_checked_at.
- **Repo settings** — opaque key/value store keyed by repo id. Used by later layers (tasks, runs, artifacts).

## Planned surface

```
fulcrum repo register [path]
fulcrum repo list [--json]
fulcrum repo show <slug-or-id>
fulcrum repo refresh <slug-or-id>
fulcrum repo forget <slug-or-id>
fulcrum repo set <slug-or-id> <key> <value>
fulcrum repo get <slug-or-id> <key>
```

## Persistence

- `~/.fulcrum/state/global/repos.db` (SQLite via `bun:sqlite`).
- Migrations live in `src/repo/migrations/NNNN-name.sql`. Schema version via `PRAGMA user_version`.

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

Context-scoped decisions will live under `src/repo/docs/adr/` when recorded. None recorded yet; create the directory lazily from `docs/adr/0000-template.md`.
