---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [14-connector-github]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [bitbucket.js — https://github.com/MunifTanjim/node-bitbucket]
ImplRuntime: claude
---

## What to build

Gated `connector-bitbucket` adapter (`FULCRUM_FEATURES=connector-bitbucket`). Same pattern as GitHub/GitLab connectors but targeting Bitbucket API 2.0 via `bitbucket.js`. Pulls PRs and issues into `bb_prs` and `bb_issues` tables (migration `0005_bitbucket_connector`). App password or OAuth token in `org_settings`. Failure gate: if `bitbucket.js` is unmaintained → raw `xh` under thin adapter.

## Acceptance criteria

- [x] Migration `0005_bitbucket_connector.sql`: `bb_prs` + `bb_issues` tables; `org_settings` gains `bitbucket_app_password` + `bitbucket_oauth_token` columns.
- [x] `OrgSettings` gains `bitbucket_app_password text` and `bitbucket_oauth_token text`.
- [x] Graphile-worker task `connector.bitbucket.sync`: fetches open PRs + issues; handles 429 via exponential backoff with Retry-After header.
- [x] Daily cron for repos with `remote_url` matching `bitbucket.org`.
- [x] Flag OFF: zero API calls; no table writes.
- [x] Integration test with mock Bitbucket API; flag ON → rows populated.
- [ ] CLI: `fulcrum repo bitbucket-prs <id> [--json]` (gated). — deferred, depends on CLI repo subcommand surface.
- [ ] Web: `/repos/<id>` dashboard "Pull Requests" section works for Bitbucket repos (gated). — deferred, depends on web dashboard surface.
- [ ] TUI: PR count in status bar when flag ON. — deferred, depends on TUI pane surface.

## Blocked by

- 14-connector-github

## Implementation notes

Adapted to existing product-kernel architecture (raw SQL + PGlite, no ORM, no tRPC). Migration `0005_bitbucket_connector.sql` follows sequential numbering after `0004_github_connector.sql`. Uses pluggable `BitbucketClient` interface for testability — mock client in tests, thin HTTP adapter with 429 backoff + pagination for production. No `bitbucket.js` dependency — uses raw `fetch` under a thin adapter per the failure-gate design. Auth supports both OAuth token and app password, with OAuth preferred. CLI, Web, and TUI acceptance criteria deferred — depend on surfaces not yet built.
