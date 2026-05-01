---
Status: ready-for-agent
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [07-trpc-procedures, 01-schema-migration]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [@octokit/rest v21 — https://github.com/octokit/rest.js]
---

## What to build

Gated `connector-github` adapter (`FULCRUM_FEATURES=connector-github`). One-way pull of GitHub metadata (PRs, issues, releases, workflow runs, check-runs) via `@octokit/rest` into `github_prs` and `github_issues` tables (migration `0009b_github`). OAuth token stored in `org_settings`. Daily graphile-worker cron syncs open PRs and issues for all GitHub-remote repos. Failure gate: if GitHub changes OAuth flow → fall back to raw `xh` calls under a thin adapter.

## Acceptance criteria

- [ ] Migration `0009b_github`: `github_prs(id, repo_id, org_id, number, title, state, author, head_sha, base_branch, head_branch, labels, created_at, updated_at, merged_at)` + `github_issues(id, repo_id, org_id, number, title, state, author, labels, created_at, updated_at, closed_at)`.
- [ ] `OrgSettings` gains `github_oauth_token text` column.
- [ ] Graphile-worker task `connector.github.sync`: fetches open PRs + issues for one repo via Octokit; upserts rows; handles 429 via exponential backoff using `X-RateLimit-Reset`.
- [ ] Daily cron enqueues `connector.github.sync` for every `kind='remote'` repo whose `remote_url` matches `github.com`.
- [ ] Flag OFF: zero Octokit calls; no `github_prs`/`github_issues` writes.
- [ ] Flag ON: `github_prs` populated after sync; Playwright/integration test with mock Octokit server.
- [ ] `repos.branches.list` tRPC procedure includes PR-branch rows from `repo_branches` upserted by the connector.
- [ ] CLI: `fulcrum repo github-prs <id> [--json]` lists open PRs for the repo (gated).
- [ ] Web: `/repos/<id>` dashboard shows "Pull Requests" section (gated; hidden when flag OFF).
- [ ] TUI: repo pane shows "PRs" count in status bar when flag ON.

## Blocked by

- 07-trpc-procedures
- 01-schema-migration
