---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [15-gated-llm-extraction.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q5b, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Gated features — report-llm-narration flag; fulcrum memory digest; weekly graphile-worker cron
---

## What to build

Gated memory-cluster digest (`FULCRUM_FEATURES=report-llm-narration`). Summarizes a project's memory cluster over a date range via Pillar 2 sidecar `summarize(memories[]) → string`. Output stored as a `Doc` entity with `docType='note'` (Pillar 7 docs) and `sourceRef = { kind: 'memory_digest', project_id, since }`.

Triggered two ways:
1. `fulcrum memory digest --project <id> [--since <date>]` CLI command
2. Weekly graphile-worker cron job (fires every Monday 00:00 UTC per org; skipped if project has < 10 memories since last run)

Default OFF — no sidecar calls, no cron enqueued.

## Acceptance criteria

- [ ] `FULCRUM_FEATURES` unset → `fulcrum memory digest` returns `feature not enabled` error; no cron scheduled
- [ ] `FULCRUM_FEATURES=report-llm-narration` → `fulcrum memory digest --project <id>` calls `summarize(memories)`; writes `doc_type='note'` row
- [ ] Written doc: non-empty `body`; `source_ref.kind = 'memory_digest'`; linked to project
- [ ] `--since <date>` filters memories to `created_at >= since`; default: last 7 days
- [ ] Weekly cron: graphile-worker job registered and fires on schedule; skips when `< 10` memories in window
- [ ] Sidecar unavailable → job/command fails with error log; no partial doc written
- [ ] Integration test: flag ON + mock sidecar returning summary string → doc row created; body matches mock
- [ ] `fulcrum memory digest --json` returns `{ docId, body, projectId, since }` on success
- [ ] `fulcrum doctor --json` `report_narration` subsystem: `disabled` when flag off; `ok` when on + cron registered

## Blocked by

- `15-gated-llm-extraction.md`
