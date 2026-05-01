---
Status: ready-for-agent
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q-flag-granularity, C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://developer.atlassian.com/cloud/jira/platform/rest/v3/, https://developers.linear.app/docs/graphql/working-with-the-graphql-api]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Two-way sync adapters gated by individual feature flags:
- **Jira** (`connector-jira`): pull Jira issues → Fulcrum tasks via Jira REST API v3; push Fulcrum task status/title updates → Jira issue; `healthCheck()` pings Jira auth endpoint. Env: `JIRA_URL`, `JIRA_TOKEN`, `JIRA_PROJECT_KEY`. Field mapping: Jira status → Fulcrum status enum; Jira priority → Fulcrum priority; assignee, due date, labels.
- **Linear** (`connector-linear`): two-way sync via Linear GraphQL API. Env: `LINEAR_API_KEY`, `LINEAR_TEAM_ID`. Field mapping: Linear state → Fulcrum status; cycle → sprint; estimate → estimate.

Both adapters: on auth failure `healthCheck()` returns `status='auth_failed'`; doctor surfaces `connector-unreachable` check failure; connector auto-disabled on 3 consecutive healthCheck failures.

- **Web**: `/settings/connectors/jira` and `/settings/connectors/linear` config forms; run history; manual sync trigger.
- **CLI**: `fulcrum connectors sync jira --json`, `fulcrum connectors sync linear --full --json`.
- **TUI**: Settings → Connectors `s` sync by kind; run log panel.

## Acceptance criteria

- [ ] Jira `pull()` against mocked Jira REST: creates correct task rows in PGlite; field mapping verified (status, priority, assignee, labels, due).
- [ ] Jira `push()`: Fulcrum task `status='done'` → Jira REST PATCH verified by mock assertion.
- [ ] Linear `pull()` against mocked GraphQL: tasks created; cycle mapped to sprint; estimate mapped.
- [ ] Linear `push()`: status mutation sent to GraphQL on Fulcrum task update.
- [ ] `healthCheck()` on each adapter: passes with valid mock creds; returns `auth_failed` with bad creds.
- [ ] `connector-jira` flag OFF → `connectors.enable('jira')` throws; ON → round-trip sync test passes.
- [ ] Web sync trigger, CLI `fulcrum connectors sync jira --json`, TUI `s` all write `connector_runs` row visible from all surfaces.

## Blocked by

- 13/issues/09-connector-framework-interface.md

## Notes

P13.26–P13.27 maps to this slice. Mock HTTP servers (MSW or `bun mock`) used in tests — no live API calls in CI.
