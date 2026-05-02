---
Status: ready-for-agent
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q-flag-granularity, C1, C5, Q24]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://docs.github.com/en/rest/repos, https://docs.gitlab.com/ee/api/repositories.html, https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Three repo-supervision connector stubs gated individually:
- **GitHub** (`connector-github`): branches, recent commits, open PRs via GitHub REST API v3. Supplements Pillar 9 on-demand sync for GitHub-hosted repos. `pull()` returns `RepoBranchList` + `CommitList` + `PRList` compatible with Pillar 9 schema.
- **GitLab** (`connector-gitlab`): branches, MRs via GitLab REST. Env: `GITLAB_TOKEN`, `GITLAB_URL`.
- **Bitbucket** (`connector-bitbucket`): branches, PRs via Bitbucket REST. Env: `BITBUCKET_TOKEN`, `BITBUCKET_WORKSPACE`.

Each adapter: `healthCheck()` verified; `pull()` returns typed data; `push()` no-op (repo supervision is read-only from Fulcrum side). `connector_runs` recorded per sync.

- **Web**: `/settings/connectors` shows GitHub/GitLab/Bitbucket cards; `/projects/[id]/repos` shows branches/PRs pulled from connector.
- **CLI**: `fulcrum connectors sync github --json`; `fulcrum repo list --with-branches --json` reads from pulled data.
- **TUI**: Repo browser shows branches + PR state pulled from connector.

## Acceptance criteria

- [ ] All three adapters implement `ConnectorAdapter` interface; TypeScript compile.
- [ ] `pull()` returns data compatible with `repo_branches` + `repo_commits` Pillar 9 schema (integration test against mocked APIs).
- [ ] `healthCheck()` passes with mock tokens; `auth_failed` on 401.
- [ ] Each flag independently: OFF → `FeatureDisabledError`; ON → `pull()` succeeds.
- [ ] Web repo detail, CLI `fulcrum repo list --json`, TUI repo browser all reflect branch data pulled by connector.

## Blocked by

- 13/issues/09-connector-framework-interface.md

## Notes

P13.31 maps to this slice. Full Pillar 9 git supervision (chokidar, on-demand sync) is Pillar 9's scope; these adapters plug into Pillar 9's sync mechanism via the connector interface.
