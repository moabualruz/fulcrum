---
Status: implemented
ImplCommit: 36eda920
ImplRuntime: codex
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/05-binary-entrypoint-and-compile.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, C4, A4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Integration tests for runs, notifications, audit, webhooks, and connectors domain commands. Covers: `fulcrum runs list --status running --json`, `fulcrum runs cancel <id> --json`, `fulcrum notify list --unread --json`, `fulcrum notify list --unread --watch` (streaming), `fulcrum audit query --kind task --since <ISO> --json`, `fulcrum audit export --format json --output audit.json`, `fulcrum webhooks list --json`, `fulcrum webhooks test <id>`, `fulcrum connectors enable jira` (flag ON/OFF), `fulcrum connectors sync jira --json`, `fulcrum flags list --json`, `fulcrum flags set router-llm on`.

- **Web**: notification bell count, audit log, webhook delivery log all visible in web UI after CLI operations.
- **CLI**: primary surface.
- **TUI**: notifications inbox, audit panel, connectors settings all reflect CLI mutations.

## Acceptance criteria

- [ ] `fulcrum runs list --status running --json` → `AgentRun[]` with claim state fields.
- [ ] `fulcrum notify list --unread --watch` streams new notification JSON lines on new event; exits clean on `CTRL+C`.
- [ ] `fulcrum audit query --since 2026-01-01 --json` → filtered `AuditEvent[]` with `org_id` field.
- [ ] `fulcrum audit export --format json --output /tmp/audit.json` → file written; valid JSON.
- [ ] `fulcrum webhooks test <id> --json` → delivery row created with `payload.type='ping'`.
- [ ] `fulcrum connectors enable jira` with `connector-jira` OFF → `FeatureDisabledError` (JSON + exit 1).
- [ ] `fulcrum flags set router-llm on --json` → flag set; `fulcrum flags list --json` reflects.
- [ ] After CLI mutation, web + TUI show same state.

## Blocked by

- 14/issues/05-binary-entrypoint-and-compile.md

## Notes

P14.19–P14.24 maps to this slice.
