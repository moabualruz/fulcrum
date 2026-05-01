---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md, 17-cross-cutting-platform/issues/09-json-import-export-trpc.md, 13-api-and-webhooks/issues/04-connector-framework.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, C5, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B8 import/export)
Docs: https://developers.linear.app/docs, https://developer.atlassian.com/cloud/jira/platform/rest/v3/
---

# GATED: import-linear, import-jira, import-plane — connector stubs + task mapper

## What to build

Three gated importers, each sharing the connector framework from Pillar 13. **`import-linear`** (`FULCRUM_FEATURES=import-linear`): Linear GraphQL API client (API key from `credentials` via `credentials.get('LINEAR_API_KEY')`); fetches issues via `IssueConnection` query; maps Linear fields → Fulcrum tasks (title, description, status, priority, assignee, labels, due date); `src/importers/linear.ts` connector. **`import-jira`** (`FULCRUM_FEATURES=import-jira`): Jira REST API v3 client; fetches issues via `/rest/api/3/search`; host/email/token from `credentials`; maps Jira fields → Fulcrum tasks. **`import-plane`** (`FULCRUM_FEATURES=import-plane`): Plane API client; token from `credentials`; maps Plane issues → Fulcrum tasks. All three: CLI `fulcrum import --format <linear|jira|plane> --project <id> [--dry-run]`; `dataImport.preflight` + `dataImport.run` tRPC; field mapping config in `src/importers/<name>.fieldmap.ts`.

## Acceptance criteria

- [ ] `import-linear` OFF: `fulcrum import --format linear` → error "Feature import-linear not enabled".
- [ ] `import-linear` ON: mocked Linear GraphQL response → 5 tasks created with correct `title`, `status`, `priority`, `labels`; API key read from `credentials` (not env var).
- [ ] `import-jira` OFF: same pattern.
- [ ] `import-jira` ON: mocked Jira REST response → tasks mapped; `reporter` mapped to Fulcrum assignee; `story_points` → `estimate`; `jira_issue_id` preserved in `custom_fields`.
- [ ] `import-plane` ON: mocked Plane response → tasks mapped.
- [ ] All importers: `--dry-run` shows counts without DB writes; `--json` returns `{imported, skipped, errors}`.
- [ ] API key missing from `credentials` → error "Credential 'LINEAR_API_KEY' not found; run: fulcrum secrets set LINEAR_API_KEY".
- [ ] Connector framework: rate-limit handling (429 → exponential backoff); network timeout → retry 3×; final failure → error with partial count.
- [ ] Vitest: each importer with mocked HTTP client; field mapping unit tests.

## Blocked by

- Issue 02 (secrets) — API keys read from `credentials`.
- Issue 09 (import/export tRPC) — `dataImport` procedures.
- Pillar 13 issue 04 (connector framework) — rate-limit + retry plumbing.
