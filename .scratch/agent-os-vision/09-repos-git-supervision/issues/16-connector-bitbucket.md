---
Status: ready-for-agent
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [14-connector-github]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [bitbucket.js — https://github.com/MunifTanjim/node-bitbucket]
---

## What to build

Gated `connector-bitbucket` adapter (`FULCRUM_FEATURES=connector-bitbucket`). Same pattern as GitHub/GitLab connectors but targeting Bitbucket API 2.0 via `bitbucket.js`. Pulls PRs and issues into `bb_prs` and `bb_issues` tables (migration `0009d_bitbucket`). App password or OAuth token in `org_settings`. Failure gate: if `bitbucket.js` is unmaintained → raw `xh` under thin adapter.

## Acceptance criteria

- [ ] Migration `0009d_bitbucket`: `bb_prs` + `bb_issues` with standard column shape; `bb_pr_id` UUID primary key from Bitbucket API.
- [ ] `OrgSettings` gains `bitbucket_app_password text` and `bitbucket_oauth_token text`.
- [ ] Graphile-worker task `connector.bitbucket.sync`: fetches open PRs + issues; handles 429.
- [ ] Daily cron for repos with `remote_url` matching `bitbucket.org`.
- [ ] Flag OFF: zero API calls; no table writes.
- [ ] Integration test with mock Bitbucket API; flag ON → rows populated.
- [ ] CLI: `fulcrum repo bitbucket-prs <id> [--json]` (gated).
- [ ] Web: `/repos/<id>` dashboard "Pull Requests" section works for Bitbucket repos (gated).
- [ ] TUI: PR count in status bar when flag ON.

## Blocked by

- 14-connector-github
