---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [02-sprints-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C2, Q8, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Burndown charts + per-project reporting row)
Docs: []
---

# Metrics cache schema + graphile-worker rollup job

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-01, T6-07, T6-08)

## What to build
Idempotent migration creating `metrics_cache` with all columns, `UNIQUE(project_id,
sprint_id, date)`, composite index `metrics_cache_project_sprint_date`. Implement
the graphile-worker rollup job `src/jobs/metrics-rollup.ts` that: queries
`events WHERE subject_kind='task' AND verb='status_changed'` past `last_rollup_cursor`;
computes per-day `started_count`, `completed_count`, `blocked_count`,
`points_completed`, `points_remaining`, `wip_count`; upserts day rows into
`metrics_cache`. Job is enqueued (deduped by `(project_id, sprint_id)`) whenever
a `status_changed` event fires. Also implement the on-demand `computeMetrics()`
query path that joins `events + tasks` live without cache, used for drill-down tooltips.

## Acceptance criteria
- [ ] Schema migration: `metrics_cache` created idempotently with all columns
- [ ] Schema migration: `UNIQUE(project_id, sprint_id, date)` prevents duplicate day rows
- [ ] Schema migration: `metrics_cache_project_sprint_date` index present
- [ ] Schema migration: FK `sprint_id → sprints(id) ON DELETE CASCADE` enforced
- [ ] Logic: `metricsRollupJob` registered with graphile-worker; job deduped on `(project_id, sprint_id)` key
- [ ] Logic: rollup job processes events after `last_rollup_cursor` only (incremental); re-running produces identical results (idempotent upsert)
- [ ] Logic: `computeMetricsOnDemand(projectId, sprintId)` queries events live; returns same shape as cache row
- [ ] Logic: burndown ideal-line formula: `ideal_points_remaining = capacity_points * (days_left / total_days)`
- [ ] Tests: rollup job processes a batch of 5 `status_changed` events and upserts correct day rows
- [ ] Tests: re-running rollup with same events produces no-op (idempotent)
- [ ] Tests: duplicate `(project_id, sprint_id, date)` upsert updates, not inserts (row count unchanged)
- [ ] Tests: on-demand query returns same values as cache for a known fixture sprint

## Blocked by
- 02-sprints-schema (needs `sprints.id` FK)

## Notes / Tech-stack hints
- `graphile-worker` provided by Pillar 1; this slice only registers the job definition
- `wip_count` = count of tasks in `started` category at end of each day
- Failure gate: if `graphile-worker` not yet available from Pillar 1, implement the on-demand path only; stub the job registration; add note in doctor check
- `last_rollup_cursor` stored as metadata in the job payload, not in DB; idempotency guaranteed by upsert
