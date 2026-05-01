---
Status: ready-for-agent
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q22, Q24, C2]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: []
---

## What to build

Migration `0009_repos_git` extending the `repos` table and creating `repo_branches`, `repo_commits`, `repo_files_index`, and the `tasks.repo_id` FK amendment. Every new table carries composite `(org_id, …)` indexes per Q22. Migration must run clean on both PGlite and PostgreSQL.

## Acceptance criteria

- [ ] `repos` table gains: `name`, `slug`, `kind` (local|remote), `local_path`, `remote_url`, `default_branch`, `current_branch`, `last_sync_at`, `sync_status` (idle|syncing|error), `last_touched_at`, `archived`.
- [ ] `CREATE UNIQUE INDEX repos_org_slug ON repos (org_id, slug)`.
- [ ] `CREATE INDEX repos_org_touched ON repos (org_id, last_touched_at DESC)`.
- [ ] `CREATE INDEX repos_kind_status ON repos (kind, sync_status)`.
- [ ] `repo_branches` table created with all columns + `UNIQUE (repo_id, name)` + `(org_id, repo_id)` index.
- [ ] `repo_commits` table created with all columns + `UNIQUE (repo_id, sha)` + `(repo_id, committed_at DESC)` + `(org_id, repo_id)` indexes.
- [ ] `repo_files_index` table created with all columns + `UNIQUE (repo_id, path)` + `(org_id, repo_id, kind)` index.
- [ ] `ALTER TABLE tasks ADD COLUMN repo_id text REFERENCES repos(id)` + `CREATE INDEX tasks_org_repo ON tasks (org_id, repo_id)`.
- [ ] Migration applies without error on PGlite (file-backed) and on PostgreSQL in CI.
- [ ] Migration is reversible (down migration drops all new tables and columns).
- [ ] Unit test asserts each index name exists in `pg_indexes` after migration.

## Blocked by

None - can start immediately
