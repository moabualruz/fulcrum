---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [02-repo-repository-crud, 03-simple-git-wrapper]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q24, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [graphile-worker task API]
---

## What to build

Graphile-worker task `repo.sync.local` (`src/repos/workers/sync-local.ts`): full sync pipeline for local repos — status → branches → commits (last 200) → file index → `search_documents` upsert → events row — with atomic status transitions (`syncing` → `idle` | `error`). This is the worker invoked by the chokidar watcher and by `fulcrum repo sync`.

## Acceptance criteria

- [x] Task sets `repos.sync_status='syncing'` at start, `'idle'` on success, `'error'` on exception.
- [x] Calls `getStatus()` → updates `repos.current_branch`.
- [x] Calls `listBranches()` → `BranchRepository.upsertBulk()`.
- [x] Calls `getCommitLog({ maxCount: 200 })` → `CommitRepository.upsertBulk()`.
- [x] Calls `getFileTree()` → `FileIndexRepository.upsertBulk()`.
- [x] Upserts `search_documents` rows: `source_kind='repo_file'`, `body=path`, `org_id` set, one row per file (upsert-on-conflict).
- [x] Updates `repos.last_sync_at` and `repos.last_touched_at` on success.
- [x] On error: `repos.sync_status='error'` + inserts `events` row `verb='repo.sync.failed'`.
- [x] Graphile-worker deduplication: job keyed on `repoId` so rapid file changes collapse to one run.
- [x] Integration test: fixture git repo with 5 commits → enqueue task → assert all 5 commits in `repo_commits`, branches in `repo_branches`, files in `repo_files_index`, `search_documents` rows present.
- [x] Benchmark: 10k-file repo syncs in < 5 s (unit benchmark with `hyperfine`).

## Blocked by

- 02-repo-repository-crud
- 03-simple-git-wrapper
