---
Status: implemented
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [01-schema-migration]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q22, C2, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: []
---

## What to build

`RepoRepository`, `BranchRepository`, `CommitRepository`, and `FileIndexRepository` — tRPC-ready typed DB wrappers covering CRUD + bulk-upsert operations on all four Pillar 9 tables. Every mutation emits an `events` row. Zod schemas exported alongside each repository for use by tRPC procedures (slice 06).

## Acceptance criteria

- [ ] `RepoRepository`: `create`, `get`, `list` (by `org_id`, with optional `project_id` filter), `update`, `archive`, `delete` — all Zod-validated input + output.
- [ ] `BranchRepository`: `upsertBulk(repoId, branches[])`, `list(repoId)`, `delete(repoId, name)`.
- [ ] `CommitRepository`: `upsertBulk(repoId, commits[])` (conflict-update-nothing on duplicate `(repo_id, sha)`), `list(repoId, { branch?, page, limit })`.
- [ ] `FileIndexRepository`: `upsertBulk(repoId, files[])`, `tree(repoId, { path?, branch? })`, `getFile(repoId, path)`.
- [ ] Every `RepoRepository` mutation inserts into `events` table with `verb=repo.<action>`, `org_id`, `subject_kind='repo'`.
- [ ] Unit tests: happy path + constraint violations (duplicate slug) + cascade delete propagation to `repo_branches` and `repo_commits`.
- [ ] Zod schemas exported as `RepoSchema`, `BranchSchema`, `CommitSchema`, `FileIndexSchema` for downstream tRPC use.

## Blocked by

- 01-schema-migration
