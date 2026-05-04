---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [02-repo-repository-crud, 03-simple-git-wrapper]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q28, C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [tRPC v11 procedure API]
---

## What to build

All `repos.*` tRPC procedures (`src/repos/router.ts`) — the single source of truth consumed by Web, CLI codegen, and TUI. Covers all read operations (always-on) and all write-side operations (guarded by `repo-write-ops` feature flag). Every procedure is Zod-validated input+output, calls `assertPermission()`, and emits `events` rows on mutations.

## Acceptance criteria

- [ ] Read procedures (always-on): `repos.list`, `repos.get`, `repos.branches.list`, `repos.commits.list`, `repos.commits.get`, `repos.files.tree`, `repos.files.content`, `repos.blame`, `repos.status`, `repos.stash.list`.
- [ ] Mutation procedures (always-on): `repos.add`, `repos.update`, `repos.remove`, `repos.sync`.
- [ ] Branch mutation procedures (always-on read, `repo-write-ops` flag for create/checkout/delete): `repos.branches.create`, `repos.branches.checkout`, `repos.branches.delete`.
- [ ] Write-ops guard: `repos.branches.create`, `repos.branches.checkout`, `repos.branches.delete`, `repos.commits.commit`, `repos.push` throw `FEATURE_GATED` error when `repo-write-ops` flag is off.
- [ ] `repos.commits.list` supports pagination (`page`, `limit`, cursor).
- [ ] `repos.files.content` returns `{ content, mimeType }` and handles binary files (base64-encoded content when MIME is not text).
- [ ] `assertPermission()` called on every procedure; lint rule passes.
- [ ] Unit tests: each procedure with mock repository + feature-flag both states for gated procedures.
- [ ] tRPC type-check passes (`bun run ci`).

## Blocked by

- 02-repo-repository-crud
- 03-simple-git-wrapper
