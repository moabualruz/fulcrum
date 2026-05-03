---
Status: in-progress
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [02-repo-repository-crud, 03-simple-git-wrapper, 05-sync-worker-local]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q24, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [simple-git clone/fetch API]
---

## What to build

End-to-end remote repo registration and on-demand sync. `fulcrum repo add --url <remote>` creates a `kind='remote'` row. Graphile-worker task `repo.sync.remote` (`src/repos/workers/sync-remote.ts`) clones a `--mirror` to `~/.fulcrum/repos/<org>/<slug>/` on first run, then `git fetch --all --prune` on subsequent runs, and executes the same branch/commit/file pipeline as the local sync worker. Daily LRU cron `repo.lru.warmup` enqueues `repo.sync.remote` for the top-5 repos by `last_touched_at`.

## Acceptance criteria

- [ ] `fulcrum repo add --url <remote> [--name] [--project-id]` creates `repos` row with `kind='remote'`, `remote_url=<remote>`.
- [ ] First `repo.sync.remote` run: `git clone --mirror <url> ~/.fulcrum/repos/<org>/<slug>/` succeeds.
- [ ] Subsequent run: `git fetch --all --prune` on existing mirror.
- [ ] Post-fetch: runs same branch/commit/file/search_documents pipeline as `sync-local`.
- [ ] `repos.last_touched_at` bumped on every sync, file-read, or agent run referencing this repo.
- [ ] `repo.lru.warmup` cron (24 h): `SELECT … ORDER BY last_touched_at DESC LIMIT 5 WHERE kind='remote'` → enqueues `repo.sync.remote` for each.
- [ ] Integration test: clone a local bare repo (test fixture) as "remote" → sync → assert commits, branches, files populated.
- [ ] `fulcrum repo sync <id>` triggers `repo.sync.remote` for remote repos and waits for completion.
- [ ] Doctor alert when `~/.fulcrum/repos/` exceeds 10 GB (slice 18 surfaces this).

## Blocked by

- 02-repo-repository-crud
- 03-simple-git-wrapper
- 05-sync-worker-local
