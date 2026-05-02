---
Status: ready-for-agent
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q-flag-granularity, C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://docs.github.com/en/rest/issues]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Two-way sync adapter for GitHub Issues gated by `connector-github-issues`. Pull GitHub issues → Fulcrum tasks via GitHub REST API v3 (`GET /repos/{owner}/{repo}/issues`). Push Fulcrum task updates → GitHub issue state/title/labels via PATCH. `healthCheck()` pings `GET /user` with the token. Env: `GITHUB_TOKEN`, `GITHUB_REPO` (`owner/repo`). Field mapping: GitHub issue state (`open`/`closed`) → Fulcrum status; labels → Fulcrum labels; assignees → assignee (first). Idempotent by `external_id` (GitHub issue number stored in `tasks.metadata_json`).

- **Web**: `/settings/connectors/github-issues` config form + run history.
- **CLI**: `fulcrum connectors sync github-issues --json`; `fulcrum connectors runs github-issues --json`.
- **TUI**: Settings → Connectors card for GitHub Issues, `s` sync, run log.

## Acceptance criteria

- [ ] `pull()` against mocked GitHub REST: task rows created with `metadata_json.external_id = <issue_number>`; re-pull idempotent (no duplicates).
- [ ] `push()` against mocked GitHub REST: Fulcrum status change → GitHub PATCH verified.
- [ ] `healthCheck()` returns pass with valid mock token; `auth_failed` with 401 mock.
- [ ] `connector-github-issues` flag OFF → `connectors.enable('github-issues')` throws `FeatureDisabledError`.
- [ ] Web config form, CLI `fulcrum connectors sync github-issues --json`, TUI `s` all write `connector_runs` row.
- [ ] Doctor `connector-reachability` check: mock host down → check `status='fail'`; mock host up → `status='pass'`.

## Blocked by

- 13/issues/09-connector-framework-interface.md

## Notes

P13.28 maps to this slice. GitHub connector for repo supervision (branches/PRs) is separate — that's the `connector-github` flag in slice 12.
