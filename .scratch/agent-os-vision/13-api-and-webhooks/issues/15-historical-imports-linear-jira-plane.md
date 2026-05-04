---
Status: completed
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q-flag-granularity, C1, C5, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: []
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

One-shot historical import adapters: `import-linear` (full Linear workspace history), `import-jira` (full Jira project history), `import-plane` (full Plane workspace history). Each gated by individual flag. These differ from live sync connectors (slices 10–11): they are one-time bulk pulls with no push-back. Implementation: `connectors.importFrom(source, config)` tRPC mutation; graphile-worker job queued; progress events emitted via subscription; result in `connector_runs` stats. Field mapping per adapter uses same schemas as live sync adapters.

- **Web**: `/settings/connectors` → Import History section; progress bar via subscription; final stats displayed.
- **CLI**: `fulcrum import linear`, `fulcrum import jira --project-key PROJ`, `fulcrum import plane --json`; `--watch` flag streams progress JSON lines.
- **TUI**: Settings → Connectors → Historical Imports panel; progress bar during import.

## Acceptance criteria

- [ ] Linear import against mocked API: task count in Fulcrum matches mocked issue count; cycle → sprint mapping; team member → org member cross-reference.
- [ ] Jira import against mocked API: issue count matches; field mapping verified (status, priority, assignee, labels, due, subtasks as children).
- [ ] Plane import against mocked API: task count matches; module → sprint; member → user.
- [ ] All three flags independently: OFF → `FeatureDisabledError`; ON → import queues job.
- [ ] Progress subscription: 3 progress events emitted for a 100-item import; final `connector_runs.stats` correct.
- [ ] Web progress bar, CLI `--watch` stream, TUI progress bar all show live progress from same job.

## Blocked by

- 13/issues/09-connector-framework-interface.md

## Notes

P13.35 maps to this slice. Import adapters reuse auth env vars from live sync connectors where applicable.
