---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [14-connector-github]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [@gitbeaker/rest — https://github.com/jdalrymple/gitbeaker]
ImplRuntime: claude
---

## What to build

Gated `connector-gitlab` adapter (`FULCRUM_FEATURES=connector-gitlab`). Same pattern as `connector-github` but targeting GitLab API v4 via `@gitbeaker/rest`. Pulls merge requests and issues into `gitlab_mrs` and `gitlab_issues` tables (migration `0005_gitlab_connector`). PAT or OAuth token in `org_settings`. Failure gate: if `@gitbeaker/rest` is unmaintained → raw `xh` under thin adapter.

## Acceptance criteria

- [x] Migration class covering `0005_gitlab_connector` scope: `GitlabMr` entity + `GitlabIssue` entity — same property shape as GitHub equivalents but `mrIid` / `issueIid` instead of `number`. Raw SQL migration at `src/product-kernel/db/migrations/0005_gitlab_connector.sql`.
- [x] `OrgSettings` gains `gitlab_pat text` and `gitlab_oauth_token text`.
- [x] Graphile-worker task `connector.gitlab.sync`: fetches open MRs + issues for one repo; handles 429.
- [x] Daily cron enqueues sync for every repo with `remote_url` matching `gitlab.com` or a user-configured self-hosted GitLab host.
- [x] Flag OFF: zero `@gitbeaker` calls; no table writes.
- [x] Integration test with mock GitLab client; flag ON → rows populated.
- [ ] CLI: `fulcrum repo gitlab-mrs <id> [--json]` (gated). Deferred — CLI repo subcommand surface not yet built.
- [ ] Web: `/repos/<id>` dashboard shows "Merge Requests" section (gated). Deferred — web dashboard surface not yet built.
- [ ] TUI: parity with GitHub connector display (MR count in status bar when ON). Deferred — TUI pane not yet built.

## Blocked by

- 14-connector-github

## Implementation notes

Adapted to existing product-kernel architecture (raw SQL + PGlite, no ORM, no tRPC). Migration `0005_gitlab_connector.sql` follows sequential numbering after `0004_github_connector.sql`. Uses pluggable `GitlabClient` interface for testability — mock client in tests, Gitbeaker-based client with 429 backoff for production. `@gitbeaker/rest` is an optional peer dependency (lazy dynamic import with `@ts-expect-error`). Self-hosted GitLab support via `addGitlabHost()` for configurable host matching. MR source branches upserted into shared `repo_branches` table. CLI, Web, and TUI acceptance criteria deferred — depend on surfaces not yet built.
