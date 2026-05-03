---
Status: implemented
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [01-schema-migration, 02-repo-repository-crud, 03-simple-git-wrapper]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q24, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [chokidar v4 — https://github.com/paulmillr/chokidar, @parcel/watcher fallback]
---

## What to build

End-to-end local repo registration + reactive filesystem watch. `fulcrum repo add --path <dir>` registers the repo (DB row + watcher start). `RepoWatcher` (`src/repos/watcher.ts`) wraps chokidar: one watcher per `kind='local'` repo, debounce 300 ms on `add|change|unlink`, enqueues `repo.sync.local` graphile-worker job. `WatcherRegistry` starts all watchers at Fulcrum startup and exposes `start(id)` / `stop(id)` for live add/remove. Failure gate: if chokidar leaks FSEvents handles (>50 MB/h, >5 repos), swap to `@parcel/watcher` behind the same `RepoWatcher` interface.

## Acceptance criteria

- [ ] `fulcrum repo add --path <dir>` creates a `repos` row with `kind='local'`, `local_path=<dir>`, `sync_status='idle'`.
- [ ] `fulcrum repo add --path <dir> --project-id <id>` scopes the repo to the project.
- [ ] On startup, `WatcherRegistry.startAll()` instantiates watchers for every active `kind='local'` repo.
- [ ] File change in watched dir → chokidar event → debounce 300 ms → `repo.sync.local` job enqueued with correct `repoId`.
- [ ] `fulcrum repo remove <id>` stops the watcher and soft-deletes (archives) the row.
- [ ] `WatcherRegistry.stop(id)` closes the chokidar instance and frees FSEvents handles.
- [ ] Integration test: create tmp git repo → register → write file → assert job enqueued within 1 s.
- [ ] `@parcel/watcher` fallback is a drop-in swap (same interface, same test passes) — verified via a feature-flag toggle in test only.
- [ ] Memory: watcher count verified <= N after N repos registered (no handle leak across 5 add/remove cycles).

## Blocked by

- 01-schema-migration
- 02-repo-repository-crud
- 03-simple-git-wrapper
