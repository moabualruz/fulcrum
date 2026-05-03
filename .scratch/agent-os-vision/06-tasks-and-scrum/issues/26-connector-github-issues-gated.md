---
Status: implemented
ImplRuntime: claude
LastVerifiedRuntime: codex
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [06-connector-framework-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Gated connector-github-issues — GitHub REST adapter (one-way pull)

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-57, T6-58, T6-59)

## What to build
`FULCRUM_FEATURES=connector-github-issues` ships the GitHub REST adapter extending
`ConnectorBase`. Auth: `GITHUB_TOKEN` + `GITHUB_REPO` (format `owner/repo`). Fetches
issues + labels + milestones via GitHub REST API; maps milestones to sprints;
`external_id='github:<number>'`. Idempotent upsert via framework.

## Acceptance criteria
- [ ] Logic: `GitHubIssuesConnector extends ConnectorBase` in `src/connectors/github-issues.ts`; registered as `connector-github-issues` with flag guard
- [ ] Logic: `fetch()` calls `GET /repos/{owner}/{repo}/issues?state=all&per_page=100` paginated via Link header; maps each issue to `UpsertTaskInput`
- [ ] Logic: field mapping — GitHub issue state (`open`/`closed`) → Fulcrum status; GitHub labels → Fulcrum labels (created if not existing); GitHub milestone → Fulcrum sprint (matched by title, created from milestone if not found); GitHub assignees (first) → Fulcrum assignee by GitHub login→user email mapping
- [ ] Logic: `external_id='github:<number>'` where `<number>` is the GitHub issue number
- [ ] Logic: milestone→sprint mapping: `milestone.due_on` → sprint `end_date`; `milestone.created_at` → sprint `start_date`
- [ ] Flag OFF: no GitHub API calls; connector disabled
- [ ] Flag ON: `fulcrum connectors sync github-issues` imports issues + labels + milestones
- [ ] Tests: mock `GET /repos/{owner}/{repo}/issues` with Link pagination → all pages imported
- [ ] Tests: label→tag mapping creates new labels if not existing; existing labels matched by name
- [ ] Tests: milestone→sprint matching — existing sprint matched; new milestone creates sprint row with correct dates
- [ ] Tests: flag OFF → no HTTP call (spy)
- [ ] Tests: `--json` `{imported, updated, errors}` shape valid

## Blocked by
- 06-connector-framework-schema

## Notes / Tech-stack hints
- `GITHUB_TOKEN` Personal Access Token or GitHub App installation token; connector auto-selects based on token format (`ghp_` = PAT, `ghs_` = app installation)
- `gh` CLI (from global rules §2) can be used for authenticated GitHub API calls in tests/manual runs; HTTP adapter uses raw `fetch` with `Authorization: Bearer ${GITHUB_TOKEN}`
- Bi-directional sync behind `connector-github-issues-bidirectional` flag — not this slice
