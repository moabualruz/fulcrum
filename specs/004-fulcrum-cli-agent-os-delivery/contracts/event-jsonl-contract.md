# Event JSONL Contract

## Purpose

Fulcrum stores canonical events in SQLite and may mirror events to local JSONL for operator inspection, agent consumption, debugging, and exports. JSONL mirrors are append-only and rebuildable from canonical event records.

## File Location

Default path pattern:

```text
<stateRoot>/events/YYYY/MM/DD/fulcrum-events-YYYY-MM-DD.jsonl
```

Run-specific convenience mirrors may exist under:

```text
<stateRoot>/runs/<runId>/events.jsonl
```

## Event Shape

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01",
  "sequence": 42,
  "timestamp": "2026-04-24T10:00:00.000Z",
  "source": "core.run-supervisor",
  "severity": "info",
  "type": "run.heartbeat",
  "projectId": "proj_01",
  "taskId": "task_01",
  "runId": "run_01",
  "correlationId": "corr_01",
  "payloadSummary": {
    "message": "Agent heartbeat received.",
    "progress": 40
  },
  "payloadRef": null,
  "artifactRefs": [],
  "policyDecisionRefs": [],
  "redactionStatus": "redacted",
  "degraded": []
}
```

## Required Event Types

- `setup.previewed`
- `setup.applied`
- `doctor.checked`
- `project.registered`
- `task.created`
- `task.transitioned`
- `external.imported`
- `external.writeback.previewed`
- `external.writeback.completed`
- `run.created`
- `run.started`
- `run.heartbeat`
- `run.progress`
- `run.stale_detected`
- `run.cancel_requested`
- `run.cancelled`
- `run.failed`
- `run.completed`
- `context.build_started`
- `context.build_completed`
- `context.lane_degraded`
- `memory.imported`
- `memory.draft_created`
- `memory.approved`
- `memory.marked_stale`
- `code.search_completed`
- `code.evidence_stale`
- `worktree.allocated`
- `worktree.status_checked`
- `worktree.cleanup_blocked`
- `worktree.cleaned`
- `quality.started`
- `quality.completed`
- `policy.checked`
- `policy.approved`
- `policy.denied`
- `artifact.attached`
- `adapter.health_checked`
- `adapter.degraded`
- `backup.created`
- `restore.completed`
- `rebuild.completed`
- `export.created`
- `reset.previewed`
- `uninstall.previewed`

## Validation Rules

- Events are append-only after creation.
- `sequence` is monotonically increasing within the canonical event stream.
- Payload summaries must be redacted and safe to show in cockpit or export.
- Large or sensitive raw payloads are stored as artifacts or local refs and linked through `payloadRef`.
- Every run event includes `runId`; every task-linked event includes `taskId`; every project-linked event includes `projectId`.
- Degraded or denied outcomes include cause and next action in payload summary.

## Recommended Skill Calls

Use [../skill-calls.md](../skill-calls.md) as the full catalog. For event and
JSONL contracts, prioritize [$data-integrity-guardian](/home/mkh/.raise/profiles/vanilla/codex/skills/data-integrity-guardian/SKILL.md),
[$reliability-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/reliability-reviewer/SKILL.md),
[$api-and-interface-design](/home/mkh/.raise/profiles/vanilla/codex/skills/api-and-interface-design/SKILL.md),
[$security-and-hardening](/home/mkh/.raise/profiles/vanilla/codex/skills/security-and-hardening/SKILL.md),
and [$testing-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/testing-reviewer/SKILL.md).
